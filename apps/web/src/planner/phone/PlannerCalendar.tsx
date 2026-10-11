import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useEventsRange, useHousehold } from '../../lib/api'
import type { AgendaEvent } from '../../lib/api'
import { useEventColor } from '../../lib/event-color'
import { Icon } from '../../kiosk/icons'
import '../../styles/planner-screens.css'
import { PhoneCard } from './primitives'
import { PhoneEventRow } from './TodayCards'
import { useCaptureOpener } from '../PlannerShell'
import { PLANNER_ROOT } from '../mode'

/** PhoneCalendarViews.PhoneMonthGrid, in React: a week-number gutter, a 20pt weekday band
 *  under a hairline, and six rows of day cells carrying up to four 16pt event chips. The
 *  numbers are the ones in PhoneCalendarLayout (chipHeight 16, chipGap 2, day number 12
 *  bold in a 22×18 box, cell top padding 3, grid inset 8). Below the grid sits the selected
 *  day's agenda — the same rows Today uses. Everything it reads comes from hooks the kiosk
 *  already calls (useEventsRange over the visible window). */

const WEEKDAYS_MON = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const WEEKDAYS_SUN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MAX_CHIPS = 4

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function parseDay(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** ISO week number of the Monday of a row, so a Sunday-first row still reads "week 38". */
export function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - dayNum)
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1)
  return Math.ceil(((t.getTime() - yearStart) / 86400000 + 1) / 7)
}

export interface MonthDay {
  key: string
  day: number
  inMonth: boolean
}
export interface MonthRow {
  weekNumber: number
  days: MonthDay[]
}

/** The 5 or 6 rows the month needs, cut on the household's first day of the week
 *  (PhoneCalendar.monthRows). */
export function monthRows(anchor: Date, firstDay: 'monday' | 'sunday'): MonthRow[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const month = first.getMonth()
  const length = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate()
  // 0 = Sunday in JS; a Monday-first week starts one day earlier.
  const lead = firstDay === 'monday' ? (first.getDay() + 6) % 7 : first.getDay()
  const start = new Date(first)
  start.setDate(first.getDate() - lead)
  const rowCount = Math.ceil((lead + length) / 7)
  const mondayOffset = firstDay === 'monday' ? 0 : 1

  return Array.from({ length: rowCount }, (_, row) => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start)
      d.setDate(start.getDate() + row * 7 + i)
      return { key: dayKey(d), day: d.getDate(), inMonth: d.getMonth() === month }
    })
    const monday = new Date(start)
    monday.setDate(start.getDate() + row * 7 + mondayOffset)
    return { weekNumber: isoWeek(monday), days }
  })
}

function relativeLabel(key: string, now: Date): string {
  const today = dayKey(now)
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  if (key === today) return 'Today'
  if (key === dayKey(tomorrow)) return 'Tomorrow'
  return parseDay(key).toLocaleDateString('en-US', { weekday: 'long' })
}

function shortDate(key: string): string {
  return parseDay(key).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function timeLabel(iso: string): string {
  const d = new Date(iso)
  return `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function PlannerCalendar() {
  const { household } = useHousehold()
  const firstDay = (household?.weekStart as 'monday' | 'sunday') ?? 'monday'
  const colorOf = useEventColor()
  const openCapture = useCaptureOpener()
  const navigate = useNavigate()
  const now = new Date()

  const [anchor, setAnchor] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1))
  const [selected, setSelected] = useState(() => dayKey(now))

  const rows = useMemo(() => monthRows(anchor, firstDay), [anchor, firstDay])
  const from = rows[0]?.days[0].key ?? dayKey(anchor)
  const to = rows[rows.length - 1]?.days[6].key ?? dayKey(anchor)
  const { events } = useEventsRange(from, to)

  const byDay = useMemo(() => {
    const map = new Map<string, AgendaEvent[]>()
    for (const e of events) {
      if (!e.startsAt) continue
      const key = dayKey(new Date(e.startsAt))
      const list = map.get(key)
      if (list) list.push(e)
      else map.set(key, [e])
    }
    return map
  }, [events])

  const weekdays = firstDay === 'monday' ? WEEKDAYS_MON : WEEKDAYS_SUN
  const todayKey = dayKey(now)
  const dayEvents = byDay.get(selected) ?? []

  const shift = (months: number) => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + months, 1))

  return (
    <div className="planner-screen-body">
      <div className="p-cal-head">
        <div className="p-cal-title">
          <h1>{anchor.toLocaleDateString('en-US', { month: 'long' })}</h1>
          <span>{anchor.getFullYear()}</span>
        </div>
        <div className="p-cal-nav">
          <button type="button" aria-label="Previous month" onClick={() => shift(-1)}>
            <Icon name="cl" />
          </button>
          <button type="button" aria-label="Next month" onClick={() => shift(1)}>
            <Icon name="cr" />
          </button>
          <button type="button" className="p-cal-add" aria-label="Add to the calendar" onClick={openCapture}>
            <Icon name="plus" />
          </button>
        </div>
      </div>

      <section className="p-cal-grid" aria-label="Month">
        <div className="p-cal-band">
          <span className="p-cal-gutter" />
          {weekdays.map((d) => (
            <span key={d} className="p-cal-weekday">
              {d}
            </span>
          ))}
        </div>
        {rows.map((row) => (
          <div key={row.weekNumber + row.days[0].key} className="p-cal-row">
            <span className="p-cal-gutter">{row.weekNumber}</span>
            {row.days.map((d) => {
              const items = byDay.get(d.key) ?? []
              // Lanes are budgeted the way PhoneMonthGrid budgets them: the cell fits at
              // most four chip lanes, and a "+N more" line takes the place of the last one.
              const overflow = items.length > MAX_CHIPS
              const lanes = overflow ? MAX_CHIPS - 1 : items.length
              const shown = items.slice(0, lanes)
              const more = items.length - lanes
              return (
                <button
                  type="button"
                  key={d.key}
                  className={`p-cal-cell${d.inMonth ? '' : ' out'}${d.key === todayKey ? ' today' : ''}${d.key === selected ? ' sel' : ''}`}
                  onClick={() => setSelected(d.key)}
                  aria-label={d.key}
                >
                  <span className="p-cal-day">{d.day}</span>
                  {shown.map((e) => (
                    <span
                      key={e.id}
                      className="p-cal-chip"
                      style={{ background: colorOf(e) }}
                      onClick={(ev) => {
                        ev.stopPropagation()
                        navigate(`${PLANNER_ROOT}/calendar/event/${e.id}`)
                      }}
                    >
                      {e.title}
                    </span>
                  ))}
                  {more > 0 && <span className="p-cal-more">+{more} more</span>}
                </button>
              )
            })}
          </div>
        ))}
      </section>

      <div className="p-cal-agenda">
        <div className="p-cal-agenda-head">
          <span className="p-cal-agenda-rel">{relativeLabel(selected, now)}</span>
          <span className="p-cal-agenda-date">{shortDate(selected)}</span>
        </div>
        <PhoneCard padding={17}>
          {dayEvents.length === 0 ? (
            <p className="p-empty">Nothing scheduled.</p>
          ) : (
            dayEvents.map((e, i) => (
              <div key={e.id}>
                {i > 0 && <span className="p-hair" />}
                <PhoneEventRow
                  event={e}
                  past={!!e.endsAt && new Date(e.endsAt).getTime() < now.getTime() && !e.allDay}
                  color={colorOf(e)}
                  onClick={() => navigate(`${PLANNER_ROOT}/calendar/event/${e.id}`)}
                />
              </div>
            ))
          )}
        </PhoneCard>
      </div>
    </div>
  )
}

export { relativeLabel as calendarRelativeLabel, timeLabel as calendarTimeLabel }
