import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PlannerShell } from './PlannerShell'
import { PlannerToday, dateLabel, greetingFor } from './PlannerToday'
import { EXPERIENCE_KEY, resetExperienceCache } from './mode'

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
}))

const modules = { meals: true, chores: true, goals: true, lists: true }
let householdModules: Record<string, boolean> = modules

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>()
  return {
    ...actual,
    useHousehold: () => ({
      household: { id: 'h', name: 'Home', timezone: 'Europe/London', weekStart: 'monday', location: null, ownerPersonId: null, settings: { modules: householdModules } },
      person: { id: 'p1', name: 'Alex', avatarEmoji: '🦊', colorHex: '#2F7FED' },
      loading: false,
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

  it('switches this device back to the kiosk and lands on its home', () => {
    renderPlanner()
    fireEvent.click(screen.getByRole('button', { name: /switch to the kiosk view/i }))
    expect(localStorage.getItem(EXPERIENCE_KEY)).toBe('kiosk')
    expect(screen.getByText('Kiosk home')).toBeInTheDocument()
  })

  it('sends the avatar to the family tab', () => {
    renderPlanner()
    expect(screen.getByTestId('planner-avatar')).toHaveAttribute('href', '/planner/family')
  })
})
