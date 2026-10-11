import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PlannerShell } from './PlannerShell'
import { resetExperienceCache } from './mode'

// The shell is where the phone layout is actually made: the tab bar with its raised
// capture button, and the *existing* kiosk capture composer mounted once behind it.
// The composer is stubbed here (it has its own suite) so this test can assert the two
// things the planner has to get right — that the trigger is the planner's own, and
// that pressing the button opens the composer rather than navigating anywhere.

vi.mock('../kiosk/components/CaptureBar', () => ({
  CaptureBar: ({ hideTrigger, openSignal }: { hideTrigger?: boolean; openSignal?: number }) => (
    <div data-testid="composer" data-hide-trigger={String(!!hideTrigger)} data-signal={openSignal} />
  ),
}))

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>()
  return {
    ...actual,
    useHousehold: () => ({
      household: { id: 'h', name: 'Home', timezone: 'Europe/London', weekStart: 'monday', location: null, ownerPersonId: null, settings: { modules: { meals: true, chores: true, goals: true, lists: true } } },
      person: { id: 'p1', name: 'Alex', avatarEmoji: '🦊' },
      loading: false,
    }),
  }
})

function renderShell(path = '/planner/today') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/planner" element={<PlannerShell />}>
          <Route path="today" element={<div>Screens go here</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

describe('PlannerShell', () => {
  beforeEach(() => {
    localStorage.clear()
    resetExperienceCache()
  })

  it('renders the screen inside the planner frame with the tab bar around it', () => {
    renderShell()
    expect(screen.getByText('Screens go here')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Planner' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /today/i })).toHaveAttribute('href', '/planner/today')
    expect(screen.getByRole('link', { name: /calendar/i })).toHaveAttribute('href', '/planner/calendar')
  })

  it('labels the flex slot with the enabled module and routes it inside /planner', () => {
    renderShell()
    expect(screen.getByRole('link', { name: /meals/i })).toHaveAttribute('href', '/planner/meals')
    expect(screen.getByRole('link', { name: /family/i })).toHaveAttribute('href', '/planner/family')
  })

  it('mounts the capture composer hidden, so the planner supplies its own triggers', () => {
    renderShell()
    expect(screen.getByTestId('composer')).toHaveAttribute('data-hide-trigger', 'true')
    expect(screen.getByTestId('composer')).toHaveAttribute('data-signal', '0')
  })

  it('opens the composer from the raised capture button', () => {
    renderShell()
    fireEvent.click(screen.getByTestId('planner-fab'))
    expect(screen.getByTestId('composer')).toHaveAttribute('data-signal', '1')
    fireEvent.click(screen.getByTestId('planner-fab'))
    expect(screen.getByTestId('composer')).toHaveAttribute('data-signal', '2')
  })

  it('puts the capture button between the middle two slots', () => {
    renderShell()
    const bar = screen.getByRole('navigation', { name: 'Planner' })
    const slots = [...bar.children].map((el) => el.getAttribute('data-testid') ?? el.textContent)
    // Today, Calendar, [capture], Meals, Family — the button keeps the centre.
    expect(slots).toEqual(['Today', 'Calendar', 'planner-fab', 'Meals', 'Family'])
  })
})
