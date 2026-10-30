import { createContext, useContext, useEffect, useRef } from 'react'
import type { InputProps, ObjectInputProps } from 'sanity'
import { fieldPathSegments, planReveal, type RevealAction } from './reveal'

/**
 * Lets a `field:<path>` step reach a field the form isn't rendering (collapsed
 * fieldset, collapsed object, unselected group), then puts things back when
 * the tour ends.
 *
 * `TourInput` (registered as `form.components.input`) records every mounted
 * object input's latest props, keyed by path. Before a field step, `reveal()`
 * walks the path from the document root, asks `planReveal` what hides the next
 * segment, and calls the matching public callback on that input. Every action
 * is logged so `restore()` can undo it in reverse order.
 */

type InputRef = { current: ObjectInputProps }

const ROOT_WAIT_MS = 3000
// Nested inputs mount right after their parent expands; a longer wait only
// delays steps whose path runs through arrays, which never register here.
const CHILD_WAIT_MS = 1000
const MAX_ACTIONS_PER_LEVEL = 3

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function pathKey(path: ObjectInputProps['path']): string {
  return path
    .map((seg) =>
      typeof seg === 'object' && seg !== null && '_key' in seg ? seg._key : String(seg)
    )
    .join('.')
}

function apply(props: ObjectInputProps, action: RevealAction) {
  if (action.kind === 'expand-field') props.onFieldExpand(action.name)
  else if (action.kind === 'expand-fieldset') props.onFieldSetExpand(action.name)
  else props.onFieldGroupSelect(action.group)
}

function undo(props: ObjectInputProps, action: RevealAction) {
  if (action.kind === 'expand-field') props.onFieldCollapse(action.name)
  else if (action.kind === 'expand-fieldset') props.onFieldSetCollapse(action.name)
  else if (action.previous) props.onFieldGroupSelect(action.previous)
}

export function createRevealRegistry() {
  const inputs = new Map<string, Set<InputRef>>()
  let applied: Array<{ ref: InputRef; action: RevealAction }> = []

  async function waitForInputs(key: string, timeout: number): Promise<InputRef[]> {
    const start = Date.now()
    for (;;) {
      const refs = inputs.get(key)
      if (refs?.size) return [...refs]
      if (Date.now() - start >= timeout) return []
      await sleep(100)
    }
  }

  return {
    register(ref: InputRef): () => void {
      const key = pathKey(ref.current.path)
      let set = inputs.get(key)
      if (!set) inputs.set(key, (set = new Set()))
      set.add(ref)
      return () => {
        set.delete(ref)
        if (!set.size) inputs.delete(key)
      }
    },

    /** Uncover `fieldPath` (e.g. "seo.metaTitle"). Resolves once nothing more can be opened. */
    async reveal(fieldPath: string, isCancelled: () => boolean): Promise<void> {
      const segments = fieldPathSegments(fieldPath)
      for (let depth = 0; depth < segments.length; depth++) {
        if (document.querySelector(`[data-tour-field="${CSS.escape(fieldPath)}"]`)) return
        const parentKey = segments.slice(0, depth).join('.')
        for (let n = 0; n < MAX_ACTIONS_PER_LEVEL; n++) {
          // Several open documents can share a path key; reveal in each.
          const refs = await waitForInputs(parentKey, depth === 0 ? ROOT_WAIT_MS : CHILD_WAIT_MS)
          if (isCancelled() || refs.length === 0) return
          let acted = false
          for (const ref of refs) {
            const action = planReveal(ref.current, segments[depth])
            if (typeof action === 'string') continue
            apply(ref.current, action)
            applied.push({ ref, action })
            acted = true
          }
          if (!acted) break
          // Let the form state re-render before re-planning (e.g. group → fieldset).
          await sleep(150)
        }
      }
    },

    /** Undo everything `reveal` opened, newest first. */
    restore(): void {
      const toUndo = applied.reverse()
      applied = []
      for (const { ref, action } of toUndo) {
        try {
          undo(ref.current, action)
        } catch {
          // the document was closed during the tour; nothing to restore
        }
      }
    },
  }
}

export type RevealRegistry = ReturnType<typeof createRevealRegistry>

export const RevealRegistryContext = createContext<RevealRegistry | null>(null)

function isObjectInput(props: InputProps): props is ObjectInputProps {
  return props.schemaType.jsonType === 'object' && 'members' in props
}

/** Global `form.components.input`: registers object inputs so `reveal` can expand them. */
export function TourInput(props: InputProps) {
  const registry = useContext(RevealRegistryContext)
  const objectInput = isObjectInput(props)
  const ref = useRef(props as ObjectInputProps)
  ref.current = props as ObjectInputProps

  useEffect(() => {
    if (!registry || !objectInput) return
    return registry.register(ref)
  }, [registry, objectInput])

  return props.renderDefault(props)
}
