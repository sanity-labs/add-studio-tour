import { createContext, useContext } from 'react'
import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import type { TourState } from './types'

/**
 * The tour store is created per <TourProvider> rather than as a module-global
 * singleton. In a single Studio with several workspaces all using this plugin,
 * a shared global store would leak `isRunning`/`activeTour` across workspaces
 * when you switch between them. A per-provider store keeps each workspace's tour
 * state isolated.
 */
export function createTourStore() {
  return createStore<TourState>((set) => ({
    activeTour: null,
    isRunning: false,
    currentStep: 0,

    startTour: (tourId: string) =>
      set({ activeTour: tourId, isRunning: true, currentStep: 0 }),

    stopTour: () =>
      set({ activeTour: null, isRunning: false, currentStep: 0 }),

    setStep: (step: number) =>
      set({ currentStep: step }),
  }))
}

export type TourStore = ReturnType<typeof createTourStore>

export const TourStoreContext = createContext<TourStore | null>(null)

/** Read from the workspace-scoped tour store. */
export function useTourStore<T>(selector: (state: TourState) => T): T {
  const store = useContext(TourStoreContext)
  if (!store) throw new Error('useTourStore must be used within <TourProvider>')
  return useStore(store, selector)
}
