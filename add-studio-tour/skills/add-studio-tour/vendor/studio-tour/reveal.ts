/**
 * Pure planning for revealing a field that the form isn't rendering — NO React
 * or Sanity imports, so it can be unit-tested (see ../../tests/reveal.test.ts).
 *
 * Sanity doesn't mount fields inside a collapsed fieldset, a collapsed object
 * field, or a group tab that isn't selected, so a `field:<path>` step has no
 * `data-tour-field` node to highlight. `planReveal` looks at one object input's
 * form state and says which public callback (`onFieldSetExpand`,
 * `onFieldExpand`, `onFieldGroupSelect`) uncovers the next path segment.
 * The runtime side lives in `revealRegistry.tsx`.
 */

/** The slice of `ObjectInputProps` the planner reads. */
export interface RevealableInput {
  members: Array<{
    kind: string
    name?: string
    collapsed?: boolean
    fieldSet?: {
      name: string
      collapsed?: boolean
      hidden?: boolean
      members: Array<{ kind: string; name?: string }>
    }
  }>
  groups?: Array<{ name: string; selected?: boolean; fields?: Array<{ name: string }> }>
}

export type RevealAction =
  | { kind: 'expand-field'; name: string }
  | { kind: 'expand-fieldset'; name: string }
  | { kind: 'select-group'; group: string; previous: string | null }

/** Sanity's synthetic group that shows every field. */
export const ALL_FIELDS_GROUP = 'all-fields'

/**
 * What it takes to render `fieldName` inside this object input:
 * `'visible'` when it's already rendered (or, for an object, rendered and open),
 * an action to apply, or `'missing'` when nothing we control can show it
 * (hidden field, unknown name).
 */
export function planReveal(
  input: RevealableInput,
  fieldName: string
): RevealAction | 'visible' | 'missing' {
  for (const m of input.members) {
    if (m.kind === 'field' && m.name === fieldName) {
      return m.collapsed ? { kind: 'expand-field', name: fieldName } : 'visible'
    }
    if (m.kind === 'fieldSet' && m.fieldSet) {
      const inSet = m.fieldSet.members.some((f) => f.kind === 'field' && f.name === fieldName)
      if (!inSet) continue
      if (m.fieldSet.hidden) return 'missing'
      return m.fieldSet.collapsed ? { kind: 'expand-fieldset', name: m.fieldSet.name } : 'visible'
    }
  }

  // Not among the rendered members → it lives in a group that isn't selected.
  // Prefer the field's own group over "All fields" so the tour lands where an
  // editor would normally find it.
  const groups = input.groups ?? []
  const has = (g: { fields?: Array<{ name: string }> }) =>
    (g.fields ?? []).some((f) => f.name === fieldName)
  const target =
    groups.find((g) => !g.selected && g.name !== ALL_FIELDS_GROUP && has(g)) ??
    groups.find((g) => !g.selected && g.name === ALL_FIELDS_GROUP)
  if (!target) return 'missing'
  const previous = groups.find((g) => g.selected)?.name ?? null
  return { kind: 'select-group', group: target.name, previous }
}

/** Dotted path → the segments the planner walks (same scheme as TourField). */
export function fieldPathSegments(fieldPath: string): string[] {
  return fieldPath.split('.').filter(Boolean)
}
