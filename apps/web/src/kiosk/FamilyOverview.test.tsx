import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FamilyOverview } from './FamilyOverview'
import { resetExperienceCache } from '../planner/mode'

// The kiosk's "Family" page gets an "App view" switch mirroring the planner's own
// "Web view" tile (PlannerFamily) — same mode.ts mechanism, opposite direction.

const people = [
  { personId: 'p1', name: 'Alex', avatarEmoji: '🦊', colorHex: '#2F7FED', age: 9, topStreak: 3, activeGoals: 2, avgProgressPct: 60, stars: 40 },
]

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>()
  return {
    ...actual,
    useFamilyOverview: () => ({ people, loading: false, error: false }),
  }
})

const wrap = () =>
  render(
    <MemoryRouter initialEntries={['/family']}>
      <Routes>
        <Route path="/family" element={<FamilyOverview />} />
        <Route path="/planner/today" element={<div>Planner Today screen</div>} />
      </Routes>
    </MemoryRouter>
  )

describe('FamilyOverview', () => {
  beforeEach(() => {
    localStorage.clear()
    resetExperienceCache()
  })

  it('lists family members', () => {
    wrap()
    expect(screen.getByText('Alex')).toBeInTheDocument()
  })

  it('switches to the phone App view and remembers the choice', () => {
    wrap()
    fireEvent.click(screen.getByText('📱 App view'))
    expect(localStorage.getItem('waffled.experience')).toBe('planner')
    expect(screen.getByText('Planner Today screen')).toBeInTheDocument()
  })
})
