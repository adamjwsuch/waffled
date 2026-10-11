import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PlannerShell } from './PlannerShell'
import { PlannerToday, dateLabel, greetingFor } from './PlannerToday'
import { EXPERIENCE_KEY, resetExperienceCache } from './mode'

// Today is the screen the planner exists for, so these tests hold the phone shape in
// place: the greeting header with a way back to the kiosk, the capture pill, and one
// column of the *same* cards the kiosk uses (stubbed here — their data has its own
// suite) with the module gates respected.

vi.mock('../kiosk/components/CaptureBar', () => ({
  CaptureBar: ({ openSignal }: { openSignal?: number }) => <div data-testid="composer" data-signal={openSignal} />,
}))

vi.mock('../kiosk/components/AgendaCard', () => ({ AgendaCard: () => <div data-testid="card-agenda" /> }))
vi.mock('../kiosk/components/CountdownsCard', () => ({ CountdownsCard: () => <div data-testid="card-countdowns" /> }))
vi.mock('../kiosk/components/ChoresCard', () => ({ ChoresCard: () => <div data-testid="card-chores" /> }))
vi.mock('../kiosk/components/MealsColumn', () => ({ TonightCardSlot: () => <div data-testid="card-tonight" /> }))

const modules = { meals: true, chores: true, goals: true, lists: true }
let householdModules: Record<string, boolean> = modules

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>()
  return {
    ...actual,
    useHousehold: () => ({
      household: { id: 'h', name: 'Home', timezone: 'Europe/London', weekStart: 'monday', location: null, ownerPersonId: null, settings: { modules: householdModules } },
      person: { id: 'p1', name: 'Alex', avatarEmoji: '🦊' },
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

  it('shows the date, the greeting and one column of the kiosk cards', () => {
    renderPlanner()
    expect(screen.getByText(dateLabel(new Date()))).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/good (morning|afternoon|evening)/i)
    expect(screen.getByTestId('card-agenda')).toBeInTheDocument()
    expect(screen.getByTestId('card-countdowns')).toBeInTheDocument()
    expect(screen.getByTestId('card-tonight')).toBeInTheDocument()
    expect(screen.getByTestId('card-chores')).toBeInTheDocument()
  })

  it('drops the cards whose module is off', () => {
    householdModules = { meals: false, chores: false, goals: true, lists: true }
    renderPlanner()
    expect(screen.getByTestId('card-agenda')).toBeInTheDocument()
    expect(screen.queryByTestId('card-tonight')).not.toBeInTheDocument()
    expect(screen.queryByTestId('card-chores')).not.toBeInTheDocument()
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
