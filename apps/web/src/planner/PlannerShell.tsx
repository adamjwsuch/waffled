import { Suspense, createContext, useContext, useMemo, useState } from 'react'
import { Outlet, useLocation } from 'react-router'
import { CaptureBar } from '../kiosk/components/CaptureBar'
import { ScreenBoundary } from '../kiosk/components/ScreenBoundary'
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
  const { pathname } = useLocation()

  return (
    <CaptureOpener.Provider value={openCapture}>
      <div className="wf-planner wf">
        <main className="planner-screen">
          {/* Every tab is a code-split screen, and most of them are the kiosk's own.
              Keep the same pair the kiosk uses, inside the chrome: a chunk that never
              arrives (offline after a deploy is the usual way) shows the placeholder
              instead of unmounting the phone down to a white screen. The fallback is
              empty for the same reason it is in KioskLayout — over LAN the chunk lands
              within a frame or two. */}
          <ScreenBoundary key={pathname}>
            <Suspense fallback={null}>
              <Outlet />
            </Suspense>
          </ScreenBoundary>
        </main>
        <PlannerTabBar household={household} onCapture={openCapture} />
        <CaptureBar hideTrigger openSignal={captureSignal} />
      </div>
    </CaptureOpener.Provider>
  )
}
