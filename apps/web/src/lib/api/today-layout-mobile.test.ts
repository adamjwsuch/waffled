import { afterEach, describe, expect, it, vi } from 'vitest'
import { MOBILE_TODAY_CARDS, mobileTodayLayoutApi } from './today-layout-mobile'

// The phone layout is saved, not just read: the app's Customize Today sheet writes an
// order and a hidden list per scope, and the phone must speak exactly that contract.

function stubFetch(body: unknown, ok = true) {
  const calls: { url: string; init?: RequestInit }[] = []
  globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    return {
      ok,
      status: ok ? 200 : 500,
      headers: { get: () => 'application/json' },
      json: async () => body,
      text: async () => JSON.stringify(body),
    }
  }) as unknown as typeof fetch
  return calls
}

afterEach(() => vi.restoreAllMocks())

describe('mobileTodayLayoutApi', () => {
  it('reads the resolved layout for this account', async () => {
    const calls = stubFetch({ resolved: { order: ['agenda', 'tonight'], hidden: ['grocery'] } })
    const r = await mobileTodayLayoutApi.get()
    expect(calls[0].url).toBe('/api/today-layout/mobile')
    expect(r.resolved.hidden).toEqual(['grocery'])
  })

  it('saves an order and a hidden list for a scope', async () => {
    const calls = stubFetch({ ok: true, layout: { order: ['tonight', 'agenda'], hidden: [] } })
    const layout = { order: ['tonight', 'agenda'], hidden: [] }
    const r = await mobileTodayLayoutApi.save('user', layout)
    expect(calls[0].url).toBe('/api/today-layout/mobile')
    expect(calls[0].init?.method).toBe('PUT')
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ scope: 'user', layout })
    expect(r.layout.order).toEqual(['tonight', 'agenda'])
  })

  it('defaults a household to the whole card set, in the app order', async () => {
    stubFetch({
      resolved: { order: [...MOBILE_TODAY_CARDS], hidden: [] },
      family: null,
      user: null,
      source: 'default',
      cards: [...MOBILE_TODAY_CARDS],
      canEditFamily: false,
    })
    const r = await mobileTodayLayoutApi.get()
    expect(r.resolved.order).toEqual([...MOBILE_TODAY_CARDS])
    expect(r.resolved.order[0]).toBe('agenda')
  })

  it('resets one scope and leaves the other alone', async () => {
    const calls = stubFetch(undefined)
    await mobileTodayLayoutApi.reset('family')
    expect(calls[0].url).toBe('/api/today-layout/mobile?scope=family')
    expect(calls[0].init?.method).toBe('DELETE')
  })
})
