import { useEffect, useState } from 'react'
import { useClient } from 'sanity'
import { mapTour, type RawTour } from './targeting'
import type { TourDefinition } from './types'

/**
 * useTours
 *
 * Tours are authored as documents inside each workspace's dataset and fetched
 * at runtime. Because we're inside the Studio, `useClient()` is already bound to
 * the active workspace's project + dataset — switching workspaces swaps the
 * client and the effect refetches automatically.
 *
 * Reads the `published` perspective (not drafts) so the launcher mirrors what a
 * prospect would see, and bypasses the CDN so freshly-published edits show on
 * reload.
 */
const buildQuery = () => `*[_type == $type] | order(_createdAt asc){
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
  chromeSelectors: Record<string, string>
): { tours: TourDefinition[]; loading: boolean } {
  const client = useClient({ apiVersion: '2024-10-01' })
  const [tours, setTours] = useState<TourDefinition[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    client
      .withConfig({ perspective: 'published', useCdn: false })
      .fetch<RawTour[]>(buildQuery(), { type: typeName })
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
  }, [client, typeName, chromeSelectors])

  return { tours, loading }
}
