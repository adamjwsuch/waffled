import { useSyncExternalStore } from 'react'
import { currentExperience, setExperience, type Experience } from './mode'

const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())
const subscribe = (fn: () => void) => {
  listeners.add(fn)
  // `setExperience` notifies from module state, so keep the same subscription list in
  // sync by re-emitting through this one too.
  return () => listeners.delete(fn)
}

/** The experience, live: switching updates the tree (used by the switch button and
 *  by ExperienceGate's redirect) without a reload. */
export function useExperience(): Experience {
  return useSyncExternalStore(subscribe, currentExperience, currentExperience)
}

/** Flip between the phone planner and the kiosk, and remember the choice. */
export function useSwitchExperience(): (next: Experience) => void {
  return (next: Experience) => {
    setExperience(next)
    emit()
  }
}
