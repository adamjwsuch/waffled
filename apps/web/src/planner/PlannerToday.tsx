import { useState, type ComponentType } from 'react'
import { Link } from 'react-router'
import { Icon } from '../kiosk/icons'
import { useHousehold, useMobileTodayLayout } from '../lib/api'
import { useCaptureOpener } from './PlannerShell'
import { PLANNER_ROOT } from './mode'
import { CustomizeSheet } from './phone/CustomizeSheet'
import {
  AgendaPhoneCard,
  ChoresPhoneCard,
  CountdownsPhoneCard,
  GroceryPhoneCard,
  TonightPhoneCard,
} from './phone/TodayCards'
import { cardRows, mergeHidden, mergeOrder, visibleCards } from './phone/todayOrder'

/** Phone Today, laid out the way TodayView.swift lays it out: a pinned greeting row and
 *  capture bar, then one column of the app's own cards — the agenda as divider rows, the
 *  split tonight card, countdowns, and chores + grocery as the two small cards. Which cards
 *  show, and in what order, comes from the layout the app itself saves
 *  (`/api/today-layout/mobile`), edited by the sheet behind the header's slider button.
 *  The shell (tab bar, FAB, composer) lives in PlannerShell; the card kit lives in ./phone. */
export function greetingFor(now: Date): string {
  const h = now.getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export function dateLabel(now: Date): string {
  return now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

/** The cards this screen can draw. The server knows ten; the other five (Lists, Pantry,
 *  Goals, Family Night, Rhythms) are cards the phone has not been given yet, so they are
 *  skipped here rather than faked, and the sheet offers only what Today can actually show. */
const PHONE_CARDS: Record<string, ComponentType> = {
  agenda: AgendaPhoneCard,
  countdowns: CountdownsPhoneCard,
  tonight: TonightPhoneCard,
  chores: ChoresPhoneCard,
  grocery: GroceryPhoneCard,
}

const SUPPORTED = new Set(Object.keys(PHONE_CARDS))

export function PlannerToday() {
  const { household, person } = useHousehold()
  const layout = useMobileTodayLayout()
  const openCapture = useCaptureOpener()
  const [sheet, setSheet] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const now = new Date()

  const visible = visibleCards(layout.resolved.order, layout.resolved.hidden, household)
  // The sheet lists every card the phone can draw that the household's modules allow —
  // including the ones currently switched off, or there would be no way to switch them back on.
  const editable = visibleCards(layout.resolved.order, [], household).filter((key) => SUPPORTED.has(key))
  const rows = cardRows(visible)
    .map((row) => row.filter((key) => key in PHONE_CARDS))
    .filter((row) => row.length > 0)

  async function save(scope: 'family' | 'user', order: string[], hidden: string[]) {
    setBusy(true)
    setSaveFailed(false)
    try {
      await layout.save(scope, {
        order: mergeOrder(order, layout.resolved.order, SUPPORTED),
        hidden: mergeHidden(hidden, layout.resolved.hidden, SUPPORTED),
      })
      setSheet(false)
    } catch {
      setSaveFailed(true)
    } finally {
      setBusy(false)
    }
  }

  async function reset(scope: 'family' | 'user') {
    setBusy(true)
    setSaveFailed(false)
    try {
      await layout.reset(scope)
      setSheet(false)
    } catch {
      setSaveFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="planner-today">
      {/* Pinned: the greeting and the capture bar, with the cards scrolling under them. */}
      <div className="planner-top">
        <header className="planner-header">
          <div className="planner-h-text">
            <div className="planner-date">{dateLabel(now)}</div>
            <h1 className="planner-greet">{greetingFor(now)}</h1>
          </div>
          {/* The app's second circle customizes Today; so does the planner's — the same 40pt
              panel circle and the same glyph as slider.horizontal.3, with a label a screen
              reader can announce. (The way back to this device's kiosk view lives on the
              Family tab now, next to the other device-level things.) */}
          <button
            type="button"
            className="planner-circle"
            aria-label="Customize Today"
            title="Customize Today"
            data-testid="planner-customize"
            onClick={() => setSheet(true)}
          >
            <Icon name="sliders" />
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

      <div className="planner-cards" data-testid="planner-cards">
        {rows.map((row) => {
          if (row.length === 2) {
            return (
              <div key={row.join('+')} className="p-2up" data-testid="planner-small-cards">
                {row.map((key) => {
                  const Paired = PHONE_CARDS[key]
                  return <Paired key={key} />
                })}
              </div>
            )
          }
          const Single = PHONE_CARDS[row[0]]
          return <Single key={row[0]} />
        })}
      </div>

      {sheet && (
        <CustomizeSheet
          order={editable}
          hidden={layout.resolved.hidden}
          canEditFamily={layout.canEditFamily}
          source={layout.source}
          busy={busy}
          error={saveFailed}
          onSave={save}
          onReset={reset}
          onClose={() => setSheet(false)}
        />
      )}
    </div>
  )
}
