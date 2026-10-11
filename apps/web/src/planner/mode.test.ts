import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import {
  EXPERIENCE_KEY,
  PLANNER_HOME,
  currentExperience,
  experienceFromSearch,
  isStandalone,
  readStoredExperience,
  rememberExperience,
  resetExperienceCache,
  resolveExperience,
} from './mode'

// The experience split is the whole gate for the planner, so its precedence is pinned
// here: a URL choice beats a stored one, a stored one beats the device heuristic, and
// the device heuristic only ever *adds* the planner — never takes the kiosk away.

describe('planner mode — resolveExperience', () => {
  it('defaults to the kiosk with no signals at all', () => {
    expect(resolveExperience({})).toBe('kiosk')
  })

  it('gives an installed PWA on a phone-sized viewport the planner', () => {
    expect(resolveExperience({ standalone: true, width: 402 })).toBe('planner')
  })

  it('keeps a wall display and a desktop browser tab on the kiosk', () => {
    // Not installed: a plain browser tab on a phone is still the kiosk (there is no way
    // to tell it from a desktop window), which is the safe default.
    expect(resolveExperience({ standalone: false, width: 402 })).toBe('kiosk')
    // Installed, but on a counter/wall-sized screen.
    expect(resolveExperience({ standalone: true, width: 1280 })).toBe('kiosk')
  })

  it('treats 500pt as the last phone width', () => {
    expect(resolveExperience({ standalone: true, width: 500 })).toBe('planner')
    expect(resolveExperience({ standalone: true, width: 501 })).toBe('kiosk')
  })

  it('lets a stored preference beat the device heuristic', () => {
    expect(resolveExperience({ stored: 'planner', standalone: false, width: 1280 })).toBe('planner')
    expect(resolveExperience({ stored: 'kiosk', standalone: true, width: 402 })).toBe('kiosk')
  })

  it('lets the URL beat everything', () => {
    expect(resolveExperience({ stored: 'planner', search: '?experience=kiosk' })).toBe('kiosk')
    expect(resolveExperience({ stored: 'kiosk', search: '?experience=planner' })).toBe('planner')
  })

  it('ignores an unknown ?experience value rather than guessing', () => {
    expect(resolveExperience({ stored: 'planner', search: '?experience=tablet' })).toBe('planner')
    expect(experienceFromSearch('?experience=tablet')).toBeNull()
    expect(experienceFromSearch('?experience=planner')).toBe('planner')
  })
})

describe('planner mode — storage and detection', () => {
  beforeEach(() => {
    localStorage.clear()
    resetExperienceCache()
  })
  afterEach(() => {
    localStorage.clear()
    resetExperienceCache()
    vi.restoreAllMocks()
  })

  it('remembers a choice, and rejects a corrupt one', () => {
    rememberExperience('planner')
    expect(localStorage.getItem(EXPERIENCE_KEY)).toBe('planner')
    expect(readStoredExperience()).toBe('planner')
    localStorage.setItem(EXPERIENCE_KEY, 'sideways')
    expect(readStoredExperience()).toBeNull()
  })

  it('survives storage being unavailable (private mode)', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => rememberExperience('planner')).not.toThrow()
    setItem.mockRestore()
  })

  it('reads iOS Safari’s navigator.standalone as well as display-mode', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'matchMedia')
    // iOS never sets display-mode: standalone for a home-screen app.
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: false }) as MediaQueryList,
    })
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: true })
    expect(isStandalone()).toBe(true)
    delete (navigator as { standalone?: boolean }).standalone
    expect(isStandalone()).toBe(false)
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: original?.value })
  })

  it('remembers an explicit URL choice so a link can opt a phone in', () => {
    window.history.replaceState({}, '', '/?experience=planner')
    expect(currentExperience()).toBe('planner')
    expect(localStorage.getItem(EXPERIENCE_KEY)).toBe('planner')
    window.history.replaceState({}, '', '/')
    resetExperienceCache()
    expect(currentExperience()).toBe('planner')
    expect(PLANNER_HOME).toBe('/planner/today')
  })
})
