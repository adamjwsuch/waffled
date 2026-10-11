import { Link, useLocation } from 'react-router'
import { Icon } from '../kiosk/icons'
import type { Household } from '../lib/api'
import { activeTab, plannerTabs } from './tabs'
import { PLANNER_ROOT } from './mode'

// The planner's bottom bar: two tabs, the raised capture button, then the remaining
// tabs — so the capture button always sits between the middle two slots (iOS:
// `captureButtonSize 54`, `barTopPadding 10`, raised ~9pt above the bar).
export function PlannerTabBar({ household, onCapture }: { household: Household | null; onCapture: () => void }) {
  const tabs = plannerTabs(household)
  const { pathname } = useLocation()
  const active = activeTab(pathname, tabs)
  const left = tabs.slice(0, 2)
  const right = tabs.slice(2)

  const tabButton = (tab: (typeof tabs)[number]) => (
    <Link
      key={tab.surface}
      to={tab.to}
      className={`planner-tab${active === tab.surface ? ' on' : ''}`}
      aria-current={active === tab.surface ? 'page' : undefined}
    >
      <Icon name={tab.icon} />
      <span className="planner-tab-label">{tab.label}</span>
    </Link>
  )

  return (
    <nav className="planner-tabbar" aria-label="Planner">
      {left.map(tabButton)}
      <button
        type="button"
        className="planner-fab"
        onClick={onCapture}
        aria-label="Add anything"
        data-testid="planner-fab"
      >
        <Icon name="spark" />
      </button>
      {right.map(tabButton)}
      {tabs.length <= 3 && (
        // Keeps the capture button between slots when a household runs no optional
        // module, so the bar never looks lopsided.
        <span className="planner-tab planner-tab-spacer" aria-hidden="true" />
      )}
    </nav>
  )
}

export { PLANNER_ROOT }
