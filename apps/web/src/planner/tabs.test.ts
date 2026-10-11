import { describe, expect, it } from 'vitest'
import type { Household } from '../lib/api'
import { activeTab, flexSlotFor, plannerTabs } from './tabs'

// The tab bar is five slots wide on the phone, so the 4th is a *flex* slot: whichever
// module is on, in a fixed order. These tests pin the order and the fallbacks, because
// getting it wrong silently hides a household's main surface from the bar.

const household = (modules: Record<string, boolean>): Household =>
  ({ id: 'h', name: 'Home', timezone: 'Europe/London', weekStart: 'monday', location: null, ownerPersonId: null, settings: { modules } }) as Household

describe('planner tabs', () => {
  it('fills the flex slot with meals when meals is on', () => {
    expect(flexSlotFor(household({ meals: true, goals: true, chores: true }))?.key).toBe('meals')
    expect(flexSlotFor(household({ meals: true, goals: true, chores: true }))?.to).toBe('meals')
  })

  it('falls back in order: goals, then chores, then lists, then pantry', () => {
    expect(flexSlotFor(household({ meals: false, goals: true, chores: true }))?.key).toBe('goals')
    expect(flexSlotFor(household({ meals: false, goals: false, chores: true }))?.key).toBe('chores')
    expect(flexSlotFor(household({ meals: false, goals: false, chores: false, lists: true }))?.key).toBe('lists')
    expect(flexSlotFor(household({ meals: false, goals: false, chores: false, lists: false, pantry: true }))?.key).toBe('pantry')
  })

  it('falls back to the catalog default while the household is still loading', () => {
    // modules default on for meals/goals/chores/lists, off for pantry (lib/modules.ts).
    expect(flexSlotFor(null)?.key).toBe('meals')
    expect(flexSlotFor(undefined)?.key).toBe('meals')
  })

  it('has no flex slot when every optional module is off', () => {
    const off = household({ meals: false, goals: false, chores: false, lists: false, pantry: false })
    expect(flexSlotFor(off)).toBeNull()
    // Today, Calendar, Family — and the capture button keeps the centre.
    expect(plannerTabs(off).map((t) => t.surface)).toEqual(['today', 'calendar', 'family'])
  })

  it('routes every tab inside /planner so the shell survives navigation', () => {
    const tabs = plannerTabs(household({ meals: true }))
    expect(tabs.map((t) => t.to)).toEqual(['/planner/today', '/planner/calendar', '/planner/meals', '/planner/family'])
  })

  it('keeps a tab lit on its deeper screens', () => {
    const tabs = plannerTabs(household({ meals: true }))
    expect(activeTab('/planner/today', tabs)).toBe('today')
    expect(activeTab('/planner/meals/recipe/r1', tabs)).toBe('flex')
    expect(activeTab('/planner/family', tabs)).toBe('family')
    expect(activeTab('/planner', tabs)).toBeNull()
  })
})
