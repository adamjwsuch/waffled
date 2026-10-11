import type { Household } from '../lib/api'
import { moduleEnabled, type ModuleKey } from '../lib/modules'
import type { IconName } from '../kiosk/icons'
import { PLANNER_ROOT } from './mode'

// The five planner slots, mirroring the iOS tab bar (App/AppRoot.swift): Today,
// Calendar, the raised capture button, a FLEX slot, and Family. The flex slot follows
// whichever module is on — Meals, else the first of Goals → Chores → Lists → Pantry —
// so the bar stays five wide and the capture button stays centred on a phone.

export type PlannerSurface = 'today' | 'calendar' | 'flex' | 'family'

export interface PlannerTab {
  surface: PlannerSurface
  label: string
  icon: IconName
  to: string
}

export interface FlexSlot {
  key: ModuleKey
  label: string
  icon: IconName
  to: string
}

const FLEX_ORDER: Array<{ key: ModuleKey; label: string; icon: IconName; to: string }> = [
  { key: 'meals', label: 'Meals', icon: 'meals', to: 'meals' },
  { key: 'goals', label: 'Goals', icon: 'goals', to: 'goals' },
  { key: 'chores', label: 'Chores', icon: 'tasks', to: 'tasks' },
  { key: 'lists', label: 'Lists', icon: 'lists', to: 'lists' },
  { key: 'pantry', label: 'Pantry', icon: 'pantry', to: 'pantry' },
]

/** The 4th slot: the first enabled module, or null when the household runs none of them. */
export function flexSlotFor(household: Household | null | undefined): FlexSlot | null {
  const hit = FLEX_ORDER.find((slot) => moduleEnabled(household, slot.key))
  return hit ?? null
}

export function plannerTabs(household: Household | null | undefined): PlannerTab[] {
  const flex = flexSlotFor(household)
  const tabs: PlannerTab[] = [
    { surface: 'today', label: 'Today', icon: 'home', to: `${PLANNER_ROOT}/today` },
    { surface: 'calendar', label: 'Calendar', icon: 'calendar', to: `${PLANNER_ROOT}/calendar` },
  ]
  if (flex) tabs.push({ surface: 'flex', label: flex.label, icon: flex.icon, to: `${PLANNER_ROOT}/${flex.to}` })
  tabs.push({ surface: 'family', label: 'Family', icon: 'family', to: `${PLANNER_ROOT}/family` })
  return tabs
}

/** Which tab a pathname belongs to (the bar's active pill). Deeper paths belong to the
 *  tab they were pushed from, so `/planner/meals/recipe/x` keeps Meals lit. */
export function activeTab(pathname: string, tabs: PlannerTab[]): PlannerSurface | null {
  const best = tabs
    .filter((tab) => pathname === tab.to || pathname.startsWith(`${tab.to}/`))
    .sort((a, b) => b.to.length - a.to.length)[0]
  return best?.surface ?? null
}
