import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useExperience } from './useExperience'
import { PLANNER_HOME, PLANNER_ROOT } from './mode'

// Keeps a device inside the experience it chose: a planner device that opens `/` (the
// installed-PWA start URL, a bookmark, a shared link) lands on the phone Today, and a
// kiosk device can never sit in a planner route it has no chrome for. Mounted high in
// the tree so the handoff happens before either shell renders.
export function ExperienceGate({ children }: { children: ReactNode }) {
  const experience = useExperience()
  const { pathname } = useLocation()

  if (experience === 'planner' && pathname === '/') return <Navigate to={PLANNER_HOME} replace />
  if (experience === 'kiosk' && (pathname === PLANNER_ROOT || pathname.startsWith(`${PLANNER_ROOT}/`))) {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}
