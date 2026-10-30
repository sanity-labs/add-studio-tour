import { useRef } from 'react'
import type { ReactNode } from 'react'
import { TourController } from './TourController'
import { createRevealRegistry, RevealRegistryContext, type RevealRegistry } from './revealRegistry'
import { createTourStore, TourStoreContext, type TourStore } from './store'
import type { ResolvedTourConfig } from './types'

/**
 * TourProvider
 *
 * The Studio `layout` component. It creates a workspace-scoped tour store (so
 * tour state doesn't leak across workspaces in a multi-workspace Studio) and
 * hands off to TourController for the router/driver.js orchestration. Split in
 * two because a component can't consume a context it provides in the same
 * render — TourController reads the store TourProvider creates.
 */
export function TourProvider({
  config,
  children,
}: {
  config: ResolvedTourConfig
  children: ReactNode
}) {
  // useRef must take an explicit initial arg — React 19 types reject the
  // zero-arg overload (`useRef<T>()`).
  const storeRef = useRef<TourStore | undefined>(undefined)
  if (!storeRef.current) storeRef.current = createTourStore()
  const revealRef = useRef<RevealRegistry | undefined>(undefined)
  if (!revealRef.current) revealRef.current = createRevealRegistry()

  return (
    <TourStoreContext.Provider value={storeRef.current}>
      <RevealRegistryContext.Provider value={revealRef.current}>
        <TourController config={config}>{children}</TourController>
      </RevealRegistryContext.Provider>
    </TourStoreContext.Provider>
  )
}
