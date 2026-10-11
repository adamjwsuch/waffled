import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PlannerShell } from './PlannerShell'
import { PlannerToday, dateLabel, greetingFor } from './PlannerToday'
import { resetExperienceCache } from './mode'

// Today is the screen the planner exists for, so these tests hold the phone shape in
// place: the greeting header with a way back to the kiosk, the capture pill, and one
// column of the app's cards — including the chores + grocery pair, which the phone puts
// side by side where the kiosk stacks them. The cards themselves are stubbed here (they
// call the app's data hooks and have their own suite in ./phone); what is asserted is
// which cards Today shows and that the module gates are respected.

vi.mock('../kiosk/components/CaptureBar', () => ({
  CaptureBar: ({ openSignal }: { openSignal?: number }) => <div data-testid="composer" data-signal={openSignal} />,
}))

vi.mock('./phone/TodayCards', () => ({
  AgendaPhoneCard: () => <div data-testid="card-agenda" />,
  CountdownsPhoneCard: () => <div data-testid="card-countdowns" />,
  TonightPhoneCard: () => <div data-testid="card-tonight" />,
  ChoresPhoneCard: () => <div data-testid="card-chores" />,
  GroceryPhoneCard: () => <div data-testid="card-grocery" />,
  ListsPhoneCard: () => <div data-testid="card-lists" />,
  GoalsPhoneCard: () => <div data-testid="card-goals" />,
  RhythmsPhoneCard: () => <div data-testid="card-rhythms" />,
}))

const modules = { meals: true, chores: true, goals: true, lists: true, rhythms: true }
let householdModules: Record<string, boolean> = modules

// The saved phone layout: the order and the cards switched off. Default = the server's
// canonical order with nothing hidden; a test can move/hide cards before rendering.
const saveSpy = vi.fn(async () => {})
const resetSpy = vi.fn(async () => {})
let layoutOrder: string[] = ['agenda', 'countdowns', 'tonight', 'chores', 'grocery', 'lists', 'pantry', 'goals', 'familyNight', 'rhythms']
let layoutHidden: string[] = []
let canEditFamily = false
let layoutSource: 'family' | 'user' | 'default' = 'default'

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>()
  return {
    ...actual,
    useHousehold: () => ({
      household: { id: 'h', name: 'Home', timezone: 'Europe/London', weekStart: 'monday', location: null, ownerPersonId: null, settings: { modules: householdModules } },
      person: { id: 'p1', name: 'Alex', avatarEmoji: '🦊', colorHex: '#2F7FED' },
      loading: false,
    }),
    useMobileTodayLayout: () => ({
      resolved: { order: layoutOrder, hidden: layoutHidden },
      source: layoutSource,
      canEditFamily,
      loading: false,
      error: false,
      save: saveSpy,
      reset: resetSpy,
      refetch: () => {},
    }),
  }
})

function renderPlanner() {
  return render(
    <MemoryRouter initialEntries={['/planner/today']}>
      <Routes>
        <Route path="/planner" element={<PlannerShell />}>
          <Route path="today" element={<PlannerToday />} />
          <Route path="family" element={<div>Family screen</div>} />
        </Route>
        <Route path="/" element={<div>Kiosk home</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('planner greeting', () => {
  it('greets by the time of day', () => {
    expect(greetingFor(new Date('2026-10-11T08:30:00'))).toBe('Good morning')
    expect(greetingFor(new Date('2026-10-11T12:00:00'))).toBe('Good afternoon')
    expect(greetingFor(new Date('2026-10-11T17:59:00'))).toBe('Good afternoon')
    expect(greetingFor(new Date('2026-10-11T18:00:00'))).toBe('Good evening')
    expect(greetingFor(new Date('2026-10-11T23:59:00'))).toBe('Good evening')
  })

  it('dates the header the way the phone app does', () => {
    expect(dateLabel(new Date('2026-10-11T09:00:00'))).toBe('Sunday, Oct 11')
  })
})

describe('PlannerToday', () => {
  beforeEach(() => {
    localStorage.clear()
    resetExperienceCache()
    householdModules = modules
    layoutOrder = ['agenda', 'countdowns', 'tonight', 'chores', 'grocery', 'lists', 'pantry', 'goals', 'familyNight', 'rhythms']
    layoutHidden = []
    canEditFamily = false
    layoutSource = 'default'
    saveSpy.mockClear()
    resetSpy.mockClear()
  })

  it('shows the date, the greeting and the phone cards', () => {
    renderPlanner()
    expect(screen.getByText(dateLabel(new Date()))).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/good (morning|afternoon|evening)/i)
    expect(screen.getByTestId('card-agenda')).toBeInTheDocument()
    expect(screen.getByTestId('card-countdowns')).toBeInTheDocument()
    expect(screen.getByTestId('card-tonight')).toBeInTheDocument()
    expect(screen.getByTestId('card-chores')).toBeInTheDocument()
    expect(screen.getByTestId('card-grocery')).toBeInTheDocument()
  })

  it('pairs chores and grocery on one row, the way the app does', () => {
    renderPlanner()
    const row = screen.getByTestId('planner-small-cards')
    expect(row.children).toHaveLength(2)
    expect(screen.getByTestId('card-chores').parentElement).toBe(row)
    expect(screen.getByTestId('card-grocery').parentElement).toBe(row)
  })

  it('drops the cards whose module is off', () => {
    householdModules = { meals: false, chores: false, goals: true, lists: false }
    renderPlanner()
    expect(screen.getByTestId('card-agenda')).toBeInTheDocument()
    expect(screen.getByTestId('card-countdowns')).toBeInTheDocument()
    expect(screen.queryByTestId('card-tonight')).not.toBeInTheDocument()
    expect(screen.queryByTestId('planner-small-cards')).not.toBeInTheDocument()
  })

  it('opens the shared capture composer from the pill', () => {
    renderPlanner()
    fireEvent.click(screen.getByTestId('planner-capture'))
    expect(screen.getByTestId('composer')).toHaveAttribute('data-signal', '1')
  })

  it('orders the cards the way the saved layout orders them', () => {
    layoutOrder = ['tonight', 'agenda', 'countdowns', 'chores', 'grocery', 'lists', 'pantry', 'goals', 'familyNight', 'rhythms']
    renderPlanner()
    const cards = screen.getByTestId('planner-cards')
    const keys = [...cards.querySelectorAll('[data-testid^="card-"]')].map((el) => el.getAttribute('data-testid'))
    // Pantry and Family Night stay off (this household has neither module on); the other
    // nine of the ten server cards, including the three built this pass, all render.
    expect(keys).toEqual(['card-tonight', 'card-agenda', 'card-countdowns', 'card-chores', 'card-grocery', 'card-lists', 'card-goals', 'card-rhythms'])
  })

  it('drops a card the layout hides', () => {
    layoutHidden = ['tonight']
    renderPlanner()
    expect(screen.queryByTestId('card-tonight')).not.toBeInTheDocument()
    expect(screen.getByTestId('card-agenda')).toBeInTheDocument()
  })

  it('gives a hidden small card the full width rather than an empty half row', () => {
    layoutHidden = ['chores']
    renderPlanner()
    expect(screen.queryByTestId('planner-small-cards')).not.toBeInTheDocument()
    expect(screen.getByTestId('card-grocery')).toBeInTheDocument()
  })

  it('opens Customize Today from the header circle', () => {
    renderPlanner()
    fireEvent.click(screen.getByTestId('planner-customize'))
    expect(screen.getByRole('dialog', { name: 'Customize Today' })).toBeInTheDocument()
    // Only the cards the phone can actually draw are offered.
    expect(screen.getByText("Tonight's dinner")).toBeInTheDocument()
    expect(screen.queryByText('Pantry')).not.toBeInTheDocument()
  })

  it('saves the arrangement back into the full card order, leaving the rest in place', async () => {
    renderPlanner()
    fireEvent.click(screen.getByTestId('planner-customize'))
    // Move Agenda below Countdowns with the grabber's keyboard affordance.
    fireEvent.keyDown(screen.getByRole('button', { name: 'Reorder Agenda' }), { key: 'ArrowDown' })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByTestId('planner-capture')
    expect(saveSpy).toHaveBeenCalledWith('user', {
      order: ['countdowns', 'agenda', 'tonight', 'chores', 'grocery', 'lists', 'pantry', 'goals', 'familyNight', 'rhythms'],
      hidden: [],
    })
  })

  it('hides a card that was switched off in the sheet', async () => {
    renderPlanner()
    fireEvent.click(screen.getByTestId('planner-customize'))
    fireEvent.click(screen.getByRole('switch', { name: 'Countdowns' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByTestId('planner-capture')
    expect(saveSpy).toHaveBeenCalledWith('user', { order: expect.any(Array), hidden: ['countdowns'] })
  })

  it('lists a card that is switched off, so it can be switched back on', () => {
    layoutHidden = ['tonight']
    renderPlanner()
    fireEvent.click(screen.getByTestId('planner-customize'))
    expect(screen.getByRole('switch', { name: "Tonight's dinner" })).toHaveAttribute('aria-checked', 'false')
  })

  it('resets the layout from the sheet', async () => {
    renderPlanner()
    fireEvent.click(screen.getByTestId('planner-customize'))
    fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }))
    await screen.findByTestId('planner-capture')
    expect(resetSpy).toHaveBeenCalledWith('user')
  })

  it('sends the avatar to the family tab', () => {
    renderPlanner()
    expect(screen.getByTestId('planner-avatar')).toHaveAttribute('href', '/planner/family')
  })
})
