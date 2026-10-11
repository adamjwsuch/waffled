import { Link, useNavigate } from 'react-router'
import { Icon } from '../kiosk/icons'
import { useHousehold } from '../lib/api'
import { moduleEnabled } from '../lib/modules'
import { useCaptureOpener } from './PlannerShell'
import { useSwitchExperience } from './useExperience'
import { PLANNER_ROOT } from './mode'
import {
  AgendaPhoneCard,
  ChoresPhoneCard,
  CountdownsPhoneCard,
  GroceryPhoneCard,
  TonightPhoneCard,
} from './phone/TodayCards'

/** Phone Today, laid out the way TodayView.swift lays it out: a pinned greeting row and
 *  capture bar, then one column of the app's own cards — the agenda as divider rows, the
 *  split tonight card, countdowns, and chores + grocery as the two small cards. The shell
 *  (tab bar, FAB, composer) lives in PlannerShell; the card kit lives in ./phone. Nothing
 *  here fetches anything the kiosk does not already fetch: same hooks, same endpoints. */
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
  const showLists = moduleEnabled(household, 'lists')

  return (
    <div className="planner-today">
      {/* Pinned: the greeting and the capture bar, with the cards scrolling under them. */}
      <div className="planner-top">
        <header className="planner-header">
          <div className="planner-h-text">
            <div className="planner-date">{dateLabel(now)}</div>
            <h1 className="planner-greet">{greetingFor(now)}</h1>
          </div>
          {/* The app's second circle customises Today; the planner's is the way back to this
              device's kiosk view, so it wears the same chrome (40pt, panel fill, ink-3 glyph)
              rather than inventing a third kind of button for the header. */}
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
            style={person?.colorHex ? { background: `${person.colorHex}29` } : undefined}
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
      </div>

      <div className="planner-cards">
        <AgendaPhoneCard />
        <CountdownsPhoneCard />
        {showMeals && <TonightPhoneCard />}
        {(showChores || showLists) && (
          <div className="p-2up" data-testid="planner-small-cards">
            {showChores && <ChoresPhoneCard />}
            {showLists && <GroceryPhoneCard />}
          </div>
        )}
      </div>
    </div>
  )
}
