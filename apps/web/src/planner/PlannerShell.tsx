import { createContext, useContext, useMemo, useState } from 'react'
import { Outlet } from 'react-router'
import { CaptureBar } from '../kiosk/components/CaptureBar'
import { useHousehold } from '../lib/api'
import { PlannerTabBar } from './PlannerTabBar'
import '../styles/planner.css'

// The phone shell: one column of screen, the bottom tab bar with the raised capture
// button, and the capture composer itself. The composer is the *existing* kiosk
// CaptureBar (same parser, same server resolve, same commit path) — the planner only
// supplies its own trigger, so there is one capture implementation, not two.
const CaptureOpener = createContext<() => void>(() => {})

/** Opens the capture composer from anywhere in the planner (the header pill and the FAB). */
export function useCaptureOpener(): () => void {
  return useContext(CaptureOpener)
}

export function PlannerShell() {
  const { household } = useHousehold()
  const [captureSignal, setCaptureSignal] = useState(0)
  const openCapture = useMemo(() => () => setCaptureSignal((n) => n + 1), [])

  return (
    <CaptureOpener.Provider value={openCapture}>
      <div className="wf-planner wf">
        <main className="planner-screen">
          <Outlet />
        </main>
        <PlannerTabBar household={household} onCapture={openCapture} />
        <CaptureBar hideTrigger openSignal={captureSignal} />
      </div>
    </CaptureOpener.Provider>
  )
}
