// Which experience this device runs: the wall/counter *kiosk* (the web app as it has
// always been) or the phone-shaped *planner* (bottom tab bar + capture FAB, one column).
//
// The iOS app splits on `userInterfaceIdiom` (App/DeviceExperience.swift). A browser has
// no idiom, so the rule here is explicit, ordered and testable:
//
//   1. `?experience=planner|kiosk` on the URL wins for this load, and is remembered —
//      that is how you switch a device, and how a link can opt a phone in.
//   2. a stored preference (`waffled.experience`) wins next.
//   3. otherwise an installed PWA (display-mode: standalone) on a phone-sized viewport
//      is the planner; anything else — every wall display, kitchen iPad and desktop
//      browser tab — keeps getting the kiosk.
export type Experience = 'kiosk' | 'planner'

export const EXPERIENCE_KEY = 'waffled.experience'
export const PLANNER_HOME = '/planner/today'
export const PLANNER_ROOT = '/planner'
// The widest viewport that still counts as a phone (iPhone 16 Pro Max is 440pt).
export const PLANNER_MAX_WIDTH = 500

export interface ExperienceSignals {
  stored?: Experience | null
  search?: string
  standalone?: boolean
  width?: number
}

export function experienceFromSearch(search: string): Experience | null {
  const value = new URLSearchParams(search).get('experience')
  return value === 'planner' || value === 'kiosk' ? value : null
}

export function isExperience(value: unknown): value is Experience {
  return value === 'planner' || value === 'kiosk'
}

export function resolveExperience({ stored, search, standalone, width }: ExperienceSignals): Experience {
  const fromUrl = experienceFromSearch(search ?? '')
  if (fromUrl) return fromUrl
  if (isExperience(stored)) return stored
  const phoneSized = (width ?? Number.POSITIVE_INFINITY) <= PLANNER_MAX_WIDTH
  return standalone && phoneSized ? 'planner' : 'kiosk'
}

export function readStoredExperience(): Experience | null {
  try {
    const value = localStorage.getItem(EXPERIENCE_KEY)
    return isExperience(value) ? value : null
  } catch {
    return null
  }
}

/** `display-mode: standalone` is the installed-PWA signal on Android/desktop; iOS
 *  Safari only sets `navigator.standalone`. Either one means "this is not a browser
 *  tab on a desk", which is the thing that separates a phone planner from a kiosk. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
  try {
    return window.matchMedia('(display-mode: standalone)').matches || iosStandalone
  } catch {
    return iosStandalone
  }
}

export function rememberExperience(experience: Experience): void {
  try {
    localStorage.setItem(EXPERIENCE_KEY, experience)
  } catch {
    // Private mode / storage disabled: the choice then lasts this load only.
  }
}

let current: Experience | null = null

/** The experience for this load. Reads the URL once and remembers an explicit choice. */
export function currentExperience(): Experience {
  if (current) return current
  const search = typeof location === 'undefined' ? '' : location.search
  const experience = resolveExperience({
    stored: readStoredExperience(),
    search,
    standalone: isStandalone(),
    width: typeof window === 'undefined' ? undefined : window.innerWidth,
  })
  if (experienceFromSearch(search)) rememberExperience(experience)
  current = experience
  return experience
}

export function setExperience(experience: Experience): void {
  rememberExperience(experience)
  current = experience
}

/** Test seam: forget the memoised experience between cases. */
export function resetExperienceCache(): void {
  current = null
}
