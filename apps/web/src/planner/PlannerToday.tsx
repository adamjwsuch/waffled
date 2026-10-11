import { Link, useNavigate } from 'react-router'
import { Icon } from '../kiosk/icons'
import { AgendaCard } from '../kiosk/components/AgendaCard'
import { CountdownsCard } from '../kiosk/components/CountdownsCard'
import { ChoresCard } from '../kiosk/components/ChoresCard'
import { TonightCardSlot } from '../kiosk/components/MealsColumn'
import { useHousehold } from '../lib/api'
import { moduleEnabled } from '../lib/modules'
import { useCaptureOpener } from './PlannerShell'
import { useSwitchExperience } from './useExperience'
import { PLANNER_ROOT } from './mode'

/** Phone Today: date + greeting, the capture pill, then one column of the same cards
 *  the kiosk uses. The layout is the phone's; the data, components and tokens are the
 *  app's — nothing here fetches or formats anything the kiosk does not already own. */
export function greetingFor(now: Date): string {
  const h = now.getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export function dateLabel(now: Date): string {
  return now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

export function PlannerToday() {
  const { household, person } = useHousehold()
  const openCapture = useCaptureOpener()
  const switchExperience = useSwitchExperience()
  const navigate = useNavigate()
  const now = new Date()

  const showChores = moduleEnabled(household, 'chores')
  const showMeals = moduleEnabled(household, 'meals')

  return (
    <div className="planner-today">
      <header className="planner-header">
        <div className="planner-h-text">
          <div className="planner-date">{dateLabel(now)}</div>
          <h1 className="planner-greet">{greetingFor(now)}</h1>
        </div>
        <button
          type="button"
          className="planner-circle"
          aria-label="Switch to the kiosk view"
          title="Switch to the kiosk view"
          onClick={() => {
            switchExperience('kiosk')
            navigate('/', { replace: true })
          }}
        >
          <Icon name="display" />
        </button>
        <Link
          to={`${PLANNER_ROOT}/family`}
          className="planner-avatar"
          aria-label="You and your family"
          data-testid="planner-avatar"
        >
          {person?.avatarEmoji ?? '🙂'}
        </Link>
      </header>

      <button type="button" className="planner-capture" onClick={openCapture} data-testid="planner-capture">
        <span className="planner-cap-btn">
          <Icon name="spark" />
        </span>
        <span className="planner-cap-ph">Add anything…</span>
        <span className="planner-cap-mic">
          <Icon name="mic" />
        </span>
      </button>

      <div className="planner-cards">
        <AgendaCard />
        <CountdownsCard />
        {showMeals && <TonightCardSlot />}
        {showChores && <ChoresCard />}
      </div>
    </div>
  )
}
