import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GoalsPhoneCard, ListsPhoneCard, RhythmsPhoneCard } from './TodayCards'

// Lists, Goals and Rhythms — the three Today cards built this pass, mirroring
// TodayListCard.swift, GoalHeroCard.swift and RhythmsTodayCard.swift. Same rule as
// screens.test.tsx: nothing new is fetched, so these mock the hooks the kiosk's own
// versions of these cards already use.

const person = { id: 'p1', name: 'Alex', avatarEmoji: '🦊', colorHex: '#2F7FED', capabilities: ['goal.manage'] }
const jenn = { id: 'p2', name: 'Jenn', avatarEmoji: '👩🏻', colorHex: '#E0548B', capabilities: [] }

let lists: Array<{ id: string; name: string; emoji: string | null; listType: string; isAutoBuilt: boolean; sortMode: string; itemCount: number }> = []
let listItems: Record<string, Array<{ id: string; name: string; quantity: string | null; checked: boolean }>> = {}
let goals: Array<Record<string, unknown>> = []
let attention: Array<Record<string, unknown>> = []
let rhythmsTotal: Array<Record<string, unknown>> = []
let checkedIds: string[] = []
let completedIds: string[] = []

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>()
  return {
    ...actual,
    useLists: () => ({ lists, loading: false, error: false, refetch: () => {} }),
    useListDetail: (id: string | null) => ({ items: id ? listItems[id] ?? [] : [], loading: false, error: false }),
    groceryApi: { ...actual.groceryApi, setItemChecked: (id: string) => { checkedIds.push(id); return Promise.resolve({} as never) } },
    useGoals: () => ({ goals, loading: false, error: false, refetch: () => {} }),
    useHousehold: () => ({ household: { id: 'h', settings: { modules: {} } }, person, loading: false }),
    usePersons: () => ({ persons: [person, jenn], loading: false, refetch: () => {} }),
    useRhythmAttention: () => ({ items: attention, loading: false, error: false, refetch: () => {} }),
    useRhythms: () => ({ rhythms: rhythmsTotal, loading: false, error: false, refetch: () => {} }),
    rhythmsApi: { ...actual.rhythmsApi, complete: (id: string) => { completedIds.push(id); return Promise.resolve({} as never) } },
  }
})

const wrap = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>)

beforeEach(() => {
  localStorage.clear()
  lists = []
  listItems = {}
  goals = []
  attention = []
  rhythmsTotal = []
  checkedIds = []
  completedIds = []
})

describe('ListsPhoneCard', () => {
  it('shows the open items on the pinned list and lets you check one off', () => {
    lists = [{ id: 'l1', name: 'Hardware run', emoji: '🔧', listType: 'custom', isAutoBuilt: false, sortMode: 'manual', itemCount: 2 }]
    listItems.l1 = [
      { id: 'i1', name: 'Wood screws', quantity: '20', checked: false },
      { id: 'i2', name: 'Sandpaper', quantity: null, checked: false },
    ]
    wrap(<ListsPhoneCard />)
    expect(screen.getByText('🔧 Hardware run')).toBeTruthy()
    expect(screen.getByText('Wood screws')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Check off Wood screws'))
    expect(checkedIds).toEqual(['i1'])
  })

  it('offers a picker once there is more than one list', () => {
    lists = [
      { id: 'l1', name: 'Hardware run', emoji: null, listType: 'custom', isAutoBuilt: false, sortMode: 'manual', itemCount: 0 },
      { id: 'l2', name: 'Packing', emoji: null, listType: 'custom', isAutoBuilt: false, sortMode: 'manual', itemCount: 0 },
    ]
    wrap(<ListsPhoneCard />)
    expect(screen.getByLabelText('Which list')).toBeTruthy()
  })

  it('says so when every item is checked', () => {
    lists = [{ id: 'l1', name: 'Hardware run', emoji: null, listType: 'custom', isAutoBuilt: false, sortMode: 'manual', itemCount: 0 }]
    listItems.l1 = [{ id: 'i1', name: 'Wood screws', quantity: null, checked: true }]
    wrap(<ListsPhoneCard />)
    expect(screen.getByText('All done here. 🎉')).toBeTruthy()
  })

  it('excludes the grocery board and templates from the pick', () => {
    lists = [
      { id: 'l1', name: 'Groceries', emoji: null, listType: 'grocery', isAutoBuilt: true, sortMode: 'manual', itemCount: 0 },
      { id: 'l2', name: 'A template', emoji: null, listType: 'template', isAutoBuilt: false, sortMode: 'manual', itemCount: 0 },
    ]
    wrap(<ListsPhoneCard />)
    expect(screen.getByText(/No lists yet/)).toBeTruthy()
  })
})

function goal(overrides: Record<string, unknown> = {}) {
  return {
    id: 'g1', goalListId: null, title: 'Read 12 books', emoji: '📚', category: null,
    goalType: 'count', unit: 'books', habitPeriod: null, habitTargetPerPeriod: null,
    trackingMode: 'manual', participantMode: 'count_once', targetBasis: 'family',
    logMethod: 'manual', autoFromCalendar: false, deadline: null,
    isFeatured: false, isSpotlight: true, hasRewards: false,
    target: 12, totalProgress: 5, milestoneTotal: 0, milestoneReached: 0,
    periodDone: 0, stepTotal: 0, stepDone: 0, streakDays: 3, loggedTodayBy: [],
    participants: [{ personId: 'p1', name: 'Alex', colorHex: '#2F7FED', avatarEmoji: '🦊', target: null, progress: 5 }],
    ...overrides,
  }
}

describe('GoalsPhoneCard', () => {
  it('shows the resolved goal: ring, title, streak and a log button', () => {
    goals = [goal()]
    wrap(<GoalsPhoneCard />)
    expect(screen.getByText('📚 Read 12 books')).toBeTruthy()
    expect(screen.getByText('5')).toBeTruthy()
    expect(screen.getByText('🔥 3-day streak')).toBeTruthy()
    expect(screen.getByText('+ Log books')).toBeTruthy()
  })

  it('says to set a goal when the household has none', () => {
    goals = []
    wrap(<GoalsPhoneCard />)
    expect(screen.getByText('Set a family goal →')).toBeTruthy()
  })

  it('offers a switcher once there is more than one goal', () => {
    goals = [goal(), goal({ id: 'g2', title: 'Run a 10k', isSpotlight: false })]
    wrap(<GoalsPhoneCard />)
    expect(screen.getByLabelText('Show on Today')).toBeTruthy()
  })

  it('opens the log sheet from the card', () => {
    goals = [goal()]
    wrap(<GoalsPhoneCard />)
    fireEvent.click(screen.getByText('+ Log books'))
    expect(screen.getByText('Log 1 books')).toBeTruthy()
  })
})

function dueItem(overrides: Record<string, unknown> = {}) {
  return { kind: 'due', rhythm: { id: 'r1', title: 'Water the plants', emoji: '🪴', every: '7 days', satisfiedBy: 'completion', autoSchedule: false }, dueAt: '2026-10-09T00:00:00Z', overdue: true, ...overrides }
}

describe('RhythmsPhoneCard', () => {
  it('renders nothing when the register is quiet', () => {
    attention = []
    const { container } = wrap(<RhythmsPhoneCard />)
    expect(container.textContent).toBe('')
  })

  it('shows an overdue row with its action', async () => {
    attention = [dueItem()]
    rhythmsTotal = [{ id: 'r1' }, { id: 'r2' }]
    wrap(<RhythmsPhoneCard />)
    expect(screen.getByText('Water the plants')).toBeTruthy()
    expect(screen.getByText('All 2')).toBeTruthy()
    fireEvent.click(screen.getByText('I did it'))
    await waitFor(() => expect(completedIds).toEqual(['r1']))
  })
})
