import type { Household } from '../../lib/api'
import { MOBILE_TODAY_CARDS, MOBILE_TODAY_CARD_LABELS } from '../../lib/api/today-layout-mobile'
import { moduleEnabled, type ModuleKey } from '../../lib/modules'

/** The phone Today list, ordered the way the app orders it.
 *
 * The keys and labels come from the layout module (`lib/api/today-layout-mobile.ts`, itself
 * a mirror of the server's MOBILE_TODAY_CARDS and of TodayView.swift's wording), so the
 * Customize sheet reads the same on the phone as in the app. Nothing here renders: it
 * decides what Today shows and how it is stacked, which is what makes it testable. */

export const MOBILE_CARDS = MOBILE_TODAY_CARDS

export type MobileCard = (typeof MOBILE_CARDS)[number]

const KNOWN = new Set<string>(MOBILE_CARDS)

export const MOBILE_CARD_LABELS: Record<string, string> = MOBILE_TODAY_CARD_LABELS

/** The two cards that share a row. Everything else is a full-width card. */
export const SMALL_CARDS = new Set<string>(['chores', 'grocery'])

// Which optional module a card belongs to. A card with no entry is never gated:
// the agenda is calendar-backed and the countdowns are always available.
const CARD_MODULE: Record<string, ModuleKey> = {
  tonight: 'meals',
  chores: 'chores',
  grocery: 'lists',
  lists: 'lists',
  goals: 'goals',
  pantry: 'pantry',
  familyNight: 'familyNight',
  rhythms: 'rhythms',
}

export function moduleAllows(key: string, household: Household | null | undefined): boolean {
  const mod = CARD_MODULE[key]
  return !mod || moduleEnabled(household, mod)
}

/** The cards Today shows, in the saved order. Unknown keys are dropped and any card the
 *  saved order lacks is appended in canonical order — the same reconcile the server does,
 *  so a card added by a later release cannot go missing for someone with a saved layout. */
export function visibleCards(order: string[], hidden: string[], household: Household | null | undefined): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const key of order) {
    if (KNOWN.has(key) && !seen.has(key)) {
      seen.add(key)
      out.push(key)
    }
  }
  for (const key of MOBILE_CARDS) if (!seen.has(key)) out.push(key)
  return out.filter((key) => !hidden.includes(key) && moduleAllows(key, household))
}

/** The cards grouped into rows: two small cards share a row when they land next to each
 *  other, everything else is a row of its own (TodayView.cardRows). */
export function cardRows(visible: string[]): string[][] {
  const rows: string[][] = []
  let i = 0
  while (i < visible.length) {
    const key = visible[i]
    if (SMALL_CARDS.has(key) && i + 1 < visible.length && SMALL_CARDS.has(visible[i + 1])) {
      rows.push([key, visible[i + 1]])
      i += 2
    } else {
      rows.push([key])
      i += 1
    }
  }
  return rows
}

/** Move one card to another position, the operation the Customize sheet's drag performs. */
export function moveCard(order: string[], from: number, to: number): string[] {
  if (from === to || from < 0 || from >= order.length) return order
  const out = order.slice()
  const [card] = out.splice(from, 1)
  out.splice(Math.max(0, Math.min(out.length, to)), 0, card)
  return out
}

/** Fold an arrangement of the cards this screen can actually draw back into the full saved
 *  order. The phone knows five of the server's ten cards; the others (Lists, Pantry, Goals,
 *  Family Night, Rhythms) stay exactly where the app put them, so reordering on the phone
 *  never rearranges a card the phone is not showing. */
export function mergeOrder(next: string[], saved: string[], supported: Set<string>): string[] {
  const queue = next.filter((k) => supported.has(k))
  const out: string[] = []
  for (const key of saved) out.push(supported.has(key) ? (queue.shift() ?? key) : key)
  out.push(...queue)
  return out
}

/** Same idea for the hidden list: what the sheet toggled, plus whatever was hidden on the
 *  cards the phone does not show (set from the app, and none of our business here). */
export function mergeHidden(nextHidden: string[], savedHidden: string[], supported: Set<string>): string[] {
  const kept = savedHidden.filter((k) => !supported.has(k))
  const out = [...nextHidden.filter((k) => supported.has(k)), ...kept]
  return [...new Set(out)]
}
