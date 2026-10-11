import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { ExperienceGate } from './ExperienceGate'
import { EXPERIENCE_KEY, resetExperienceCache } from './mode'
import { setExperience } from './mode'

// The gate is what stops a phone sitting in kiosk chrome it cannot navigate, and what
// puts an installed PWA's opening URL (/ or a shared link) on the planner's Today.

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ExperienceGate>
        <Routes>
          <Route path="/" element={<div>Kiosk home</div>} />
          <Route path="/planner/today" element={<div>Planner today</div>} />
        </Routes>
      </ExperienceGate>
    </MemoryRouter>
  )
}

describe('ExperienceGate', () => {
  beforeEach(() => {
    localStorage.clear()
    resetExperienceCache()
  })

  it('leaves the kiosk alone by default', () => {
    renderAt('/')
    expect(screen.getByText('Kiosk home')).toBeInTheDocument()
  })

  it('sends a planner device that opens / to the phone Today', () => {
    setExperience('planner')
    renderAt('/')
    expect(screen.getByText('Planner today')).toBeInTheDocument()
  })

  it('keeps a kiosk device out of planner routes', () => {
    setExperience('kiosk')
    renderAt('/planner/today')
    expect(screen.getByText('Kiosk home')).toBeInTheDocument()
  })

  it('leaves a planner device on its own routes', () => {
    localStorage.setItem(EXPERIENCE_KEY, 'planner')
    resetExperienceCache()
    renderAt('/planner/today')
    expect(screen.getByText('Planner today')).toBeInTheDocument()
  })
})
