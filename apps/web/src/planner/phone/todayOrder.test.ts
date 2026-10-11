import { describe, expect, it } from 'vitest'
import type { Household } from '../../lib/api'
import { MOBILE_CARD_LABELS, SMALL_CARDS, cardRows, mergeHidden, mergeOrder, moduleAllows, moveCard, visibleCards } from './todayOrder'

// The phone Today screen is the app's Today list: one column, the order saved in the
// layout API, cards turned off by `hidden`, optional modules gated, and the two small
// cards (chores/grocery) paired into a 2-up row *only when they end up adjacent* — the
// same rule TodayView.swift uses, so a default layout keeps the look the app has.

const household = (over: Record<string, boolean> = {}): Household =>
  ({
    settings: { modules: { meals: true, chores: true, goals: true, lists: true, pantry: false, familyNight: false, rhythms: false, ...over } },
  }) as unknown as Household

const DEFAULT_ORDER = ['agenda', 'countdowns', 'tonight', 'chores', 'grocery', 'lists', 'pantry', 'goals', 'familyNight', 'rhythms']

describe('moduleAllows', () => {
  it('gates the optional cards the way the app does', () => {
    const h = household()
    expect(moduleAllows('tonight', h)).toBe(true)
    expect(moduleAllows('chores', h)).toBe(true)
    expect(moduleAllows('grocery', h)).toBe(true)
    expect(moduleAllows('lists', h)).toBe(true)
    expect(moduleAllows('goals', h)).toBe(true)
    expect(moduleAllows('pantry', h)).toBe(false)
    expect(moduleAllows('familyNight', h)).toBe(false)
    expect(moduleAllows('rhythms', h)).toBe(false)
  })

  it('never gates the agenda or the countdowns', () => {
    const h = household({ meals: false, chores: false, lists: false, goals: false })
    expect(moduleAllows('agenda', h)).toBe(true)
    expect(moduleAllows('countdowns', h)).toBe(true)
  })

  it('falls back to the catalog default before the household has loaded', () => {
    // The on-by-default core cards still render; the opt-in ones wait (the catalogue says off).
    expect(moduleAllows('agenda', null)).toBe(true)
    expect(moduleAllows('chores', null)).toBe(true)
    expect(moduleAllows('pantry', null)).toBe(false)
    expect(moduleAllows('familyNight', undefined)).toBe(false)
  })
})

describe('visibleCards', () => {
  it('keeps the saved order, drops hidden cards and gated modules', () => {
    const h = household({ goals: false })
    const order = ['grocery', 'agenda', 'countdowns', 'tonight', 'chores', 'goals', 'pantry']
    // lists is not in the saved order, so it is appended; goals/pantry/familyNight/rhythms
    // are filtered out (module off), tonight is hidden.
    expect(visibleCards(order, ['tonight'], h)).toEqual(['grocery', 'agenda', 'countdowns', 'chores', 'lists'])
  })

  it('appends a card the saved order has never heard of, so a new card cannot be lost', () => {
    const h = household()
    const visible = visibleCards(['agenda', 'countdowns'], [], h)
    expect(visible.slice(0, 2)).toEqual(['agenda', 'countdowns'])
    expect(visible).toContain('tonight')
    expect(visible).toContain('grocery')
  })

  it('ignores unknown keys in the saved order', () => {
    const h = household()
    expect(visibleCards(['bogus', 'agenda'], [], h)[0]).toBe('agenda')
  })
})

describe('cardRows', () => {
  it('pairs the two small cards when they are adjacent', () => {
    expect(cardRows(['agenda', 'chores', 'grocery', 'countdowns'])).toEqual([
      ['agenda'], ['chores', 'grocery'], ['countdowns'],
    ])
  })

  it('leaves them single when something sits between them', () => {
    expect(cardRows(['chores', 'agenda', 'grocery'])).toEqual([['chores'], ['agenda'], ['grocery']])
  })

  it('does not pair any other two cards', () => {
    expect(cardRows(['lists', 'agenda'])).toEqual([['lists'], ['agenda']])
  })

  it('handles a small card at the end of the list', () => {
    expect(cardRows(['agenda', 'chores'])).toEqual([['agenda'], ['chores']])
  })
})

describe('the card vocabulary', () => {
  it('labels every card the server knows about', () => {
    for (const key of DEFAULT_ORDER) expect(MOBILE_CARD_LABELS[key]).toBeTruthy()
    expect(MOBILE_CARD_LABELS.tonight).toBe("Tonight's dinner")
  })

  it('calls exactly chores and grocery small', () => {
    expect([...SMALL_CARDS].sort()).toEqual(['chores', 'grocery'])
  })
})

// The phone draws five of the server's ten cards. Saving an arrangement must leave the
// other five alone — a reorder on the phone must not shuffle a card the phone never showed.
const SUPPORTED = new Set(['agenda', 'countdowns', 'tonight', 'chores', 'grocery'])

describe('moveCard', () => {
  it('moves a card down and keeps the rest in order', () => {
    expect(moveCard(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
  })

  it('moves a card to the end of the list', () => {
    expect(moveCard(['a', 'b', 'c'], 0, 3)).toEqual(['b', 'c', 'a'])
  })

  it('returns the same list when nothing moves', () => {
    const order = ['a', 'b']
    expect(moveCard(order, 1, 1)).toBe(order)
    expect(moveCard(order, 5, 0)).toBe(order)
  })
})

describe('mergeOrder', () => {
  it('permutes the cards the phone shows and leaves the rest in their slots', () => {
    const next = ['tonight', 'agenda', 'countdowns', 'chores', 'grocery']
    const merged = mergeOrder(next, DEFAULT_ORDER, SUPPORTED)
    expect(merged).toEqual(['tonight', 'agenda', 'countdowns', 'chores', 'grocery', 'lists', 'pantry', 'goals', 'familyNight', 'rhythms'])
  })

  it('leaves an unsupported card in its slot', () => {
    const merged = mergeOrder(['grocery', 'agenda'], ['agenda', 'tonight', 'lists'], SUPPORTED)
    expect(merged).toEqual(['grocery', 'agenda', 'lists'])
  })

  it('keeps a supported card in its slot once the arrangement runs out', () => {
    expect(mergeOrder(['grocery'], ['agenda', 'tonight', 'lists'], SUPPORTED)).toEqual(['grocery', 'tonight', 'lists'])
  })
})

describe('mergeHidden', () => {
  it('saves the phone toggles and preserves a hidden card set elsewhere', () => {
    expect(mergeHidden(['grocery'], ['pantry'], SUPPORTED)).toEqual(['grocery', 'pantry'])
  })

  it('unhides a card the sheet turned back on, without dropping the others', () => {
    expect(mergeHidden([], ['tonight', 'rhythms'], SUPPORTED)).toEqual(['rhythms'])
  })
})
