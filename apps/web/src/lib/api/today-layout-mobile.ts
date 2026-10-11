// The phone's own Today layout — `/api/today-layout/mobile`.
//
// The kiosk keeps a 3-column grid (`today-layout.ts`); the phone and the iOS app keep a
// single ordered list plus the cards that are turned off, which is why the server has a
// second module for it. Same shape as the kiosk client: a saved layout per scope
// ('user' overrides 'family'), server-reconciled, and `canEditFamily` gates whether this
// account may change what the whole household sees.
import { useEffect, useState } from 'react'
import { apiDelete, apiGet, apiSend } from './client'

export type MobileLayoutScope = 'family' | 'user'

export interface MobileLayout {
  order: string[]
  hidden: string[]
}

/** Canonical card order — mirror of MOBILE_TODAY_CARDS in
 *  apps/api/src/modules/layout/mobile-today-layout.ts. */
export const MOBILE_TODAY_CARDS = [
  'agenda', 'countdowns', 'tonight', 'chores', 'grocery', 'lists', 'pantry', 'goals', 'familyNight', 'rhythms',
] as const

export type MobileTodayCard = (typeof MOBILE_TODAY_CARDS)[number]

/** Card names, worded as the app words them (TodayView.swift). */
export const MOBILE_TODAY_CARD_LABELS: Record<string, string> = {
  agenda: 'Agenda',
  countdowns: 'Countdowns',
  tonight: "Tonight's dinner",
  chores: 'Chores',
  grocery: 'Grocery',
  lists: 'Lists',
  goals: 'Goals',
  pantry: 'Pantry',
  familyNight: 'Family Night',
  rhythms: 'Rhythms',
}

export interface MobileTodayLayoutResponse {
  resolved: MobileLayout
  family: MobileLayout | null
  user: MobileLayout | null
  source: MobileLayoutScope | 'default'
  cards: string[]
  canEditFamily: boolean
}

const FALLBACK: MobileLayout = { order: [...MOBILE_TODAY_CARDS], hidden: [] }

export const mobileTodayLayoutApi = {
  get: () => apiGet<MobileTodayLayoutResponse>('/api/today-layout/mobile'),
  save: (scope: MobileLayoutScope, layout: MobileLayout) =>
    apiSend<{ ok: boolean; layout: MobileLayout }>('PUT', '/api/today-layout/mobile', { scope, layout }),
  reset: (scope: MobileLayoutScope) => apiDelete(`/api/today-layout/mobile?scope=${scope}`),
}

export interface MobileTodayLayoutState {
  resolved: MobileLayout
  source: MobileLayoutScope | 'default'
  canEditFamily: boolean
  loading: boolean
  error: boolean
  save: (scope: MobileLayoutScope, layout: MobileLayout) => Promise<void>
  reset: (scope: MobileLayoutScope) => Promise<void>
  refetch: () => void
}

export function useMobileTodayLayout(): MobileTodayLayoutState {
  const [data, setData] = useState<MobileTodayLayoutResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let alive = true
    mobileTodayLayoutApi
      .get()
      .then((d) => alive && (setData(d), setError(false), setLoading(false)))
      .catch(() => alive && (setError(true), setLoading(false)))
    return () => {
      alive = false
    }
  }, [nonce])

  const refetch = () => setNonce((n) => n + 1)

  async function save(scope: MobileLayoutScope, layout: MobileLayout): Promise<void> {
    await mobileTodayLayoutApi.save(scope, layout)
    refetch()
  }

  async function reset(scope: MobileLayoutScope): Promise<void> {
    await mobileTodayLayoutApi.reset(scope)
    refetch()
  }

  return {
    resolved: data?.resolved ?? FALLBACK,
    source: data?.source ?? 'default',
    canEditFamily: data?.canEditFamily ?? false,
    loading,
    error,
    save,
    reset,
    refetch,
  }
}
