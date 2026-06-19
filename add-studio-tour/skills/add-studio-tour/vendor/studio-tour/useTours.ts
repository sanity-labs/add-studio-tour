import { useEffect, useState } from 'react'
import { useClient } from 'sanity'
import { mapTour, workspaceScopeFilter, type RawTour } from './targeting'
import type { TourDefinition } from './types'

/**
 * useTours
 *
 * Tours are authored as documents inside each workspace's dataset and fetched
 * at runtime. Because we're inside the Studio, `useClient()` is already bound to
 * the active workspace's project + dataset — switching workspaces swaps the
 * client and the effect refetches automatically.
 *
 * When `workspaceScope` is set (central-management mode), the query is filtered
 * to tours tagged for that workspace (plus untagged/global tours); otherwise
 * every tour of the type is returned.
 *
 * Reads the `published` perspective (not drafts) so the launcher mirrors what a
 * prospect would see, and bypasses the CDN so freshly-published edits show on
 * reload.
 */
const buildQuery = (scope: string | null) => `*[_type == $type${workspaceScopeFilter(scope)}] | order(_createdAt asc){
  _id,
  label,
  description,
  steps[]{
    title,
    description,
    target,
    side,
    align,
    delay,
    openTool,
    openPath,
    "doc": openDocument->{_id, _type}
  }
}`

export function useTours(
  typeName: string,
  chromeSelectors: Record<string, string>,
  workspaceScope: string | null = null
): { tours: TourDefinition[]; loading: boolean } {
  const client = useClient({ apiVersion: '2024-10-01' })
  const [tours, setTours] = useState<TourDefinition[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const params: Record<string, string> = { type: typeName }
    if (workspaceScope) params.scope = workspaceScope
    client
      .withConfig({ perspective: 'published', useCdn: false })
      .fetch<RawTour[]>(buildQuery(workspaceScope), params)
      .then((raw) => {
        if (!cancelled) setTours(raw.map((t) => mapTour(t, chromeSelectors)))
      })
      .catch((err) => {
        console.error('[tour] failed to load tours', err)
        if (!cancelled) setTours([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [client, typeName, chromeSelectors, workspaceScope])

  return { tours, loading }
}
