import { Fragment } from 'react'
import { useNavigate } from 'react-router'
import { CardHead, EmojiTile, Hair, PhoneAvatar, PhoneCard, ProgressBar } from './primitives'
import { useChoresToday, useCountdowns, useEventsToday, useGrocery, useMealsWeek } from '../../lib/api'
import { countdownsApi, type AgendaEvent } from '../../lib/api'
import { useEventColor } from '../../lib/event-color'
import { PLANNER_ROOT } from '../mode'

// The phone's Today cards — the React twin of TodayView.swift's card set, laid out the way
// the app lays them out rather than the way the kiosk does:
//   · the agenda is divider-separated rows with the event's colour bar and its owner's
//     avatar (EventRow.swift), not the kiosk's bordered tiles;
//   · countdowns use the 32pt tinted tile and the "N days" right-hand label;
//   · tonight's dinner is the split media card (104pt gradient block + serif title);
//   · chores and grocery are the two "small cards", side by side.
// Data comes from the hooks the kiosk already uses — nothing here fetches anything new.

function todayYmd(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

/** EventRow.swift: 4×30 colour bar · title+mark · time · owner's avatar, divider between. */
/** TodayView's row for one event — the phone agenda row. Exported because the calendar's
 *  day agenda is the same row: same 4×30 bar, same 15pt semibold title with its 12pt time
 *  beneath, same 30pt avatar, same hairline between rows and 50% fade once it's past. */
export function PhoneEventRow({ event, past, color, onClick }: { event: AgendaEvent; past: boolean; color: string; onClick: () => void }) {
  return (
    <button type="button" className={`p-event${past ? ' past' : ''}`} onClick={onClick}>
      <span className="p-event-bar" style={{ background: color }} />
      <span className="p-event-text">
        <span className="p-event-title">{event.title}</span>
        <span className="p-event-time">{event.allDay ? 'All day' : timeLabel(event)}</span>
      </span>
      <span className="p-event-spacer" />
      {event.personEmoji ? <PhoneAvatar emoji={event.personEmoji} colorHex={event.personColor} size={30} /> : null}
    </button>
  )
}

function timeLabel(e: AgendaEvent): string {
  if (!e.startsAt) return ''
  const d = new Date(e.startsAt)
  return `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** An event is past once its end (or start + 1h when open-ended) is behind now. All-day
 *  events aren't time-bound, so they never fade. Same rule as the kiosk agenda; kept local
 *  so the phone cards don't reach into a kiosk screen module for five lines of arithmetic. */
function isPast(e: AgendaEvent, now: Date): boolean {
  if (e.allDay || !e.startsAt) return false
  const end = e.endsAt ? new Date(e.endsAt) : new Date(new Date(e.startsAt).getTime() + 60 * 60000)
  return end.getTime() < now.getTime()
}

/** TodayView.todayCard — WaffledCard(padding 17), header "Today · N events ›". */
export function AgendaPhoneCard() {
  const { events } = useEventsToday()
  const colorOf = useEventColor()
  const navigate = useNavigate()
  const now = new Date()
  const count = events.length

  return (
    <PhoneCard padding={17} className="p-agenda">
      <CardHead
        title="Today"
        meta={`${count} event${count === 1 ? '' : 's'}`}
        chevron
        onClick={() => navigate(`${PLANNER_ROOT}/calendar`)}
      />
      {count === 0 ? (
        <button type="button" className="p-event-empty" onClick={() => navigate(`${PLANNER_ROOT}/calendar`)}>
          Nothing scheduled today.
        </button>
      ) : (
        events.map((e, i) => (
          <Fragment key={e.id}>
            <PhoneEventRow
              event={e}
              past={isPast(e, now)}
              color={colorOf(e)}
              onClick={() => navigate(`${PLANNER_ROOT}/calendar/event/${e.id}`)}
            />
            {i < count - 1 ? <Hair /> : null}
          </Fragment>
        ))
      )}
    </PhoneCard>
  )
}

/** Countdowns.swift — WaffledCard(padding 15), "Countdowns" 12.5 bold + violet "+ Add". */
export function CountdownsPhoneCard() {
  const { countdowns, sleeps } = useCountdowns()
  const navigate = useNavigate()
  const shown = countdowns.slice(0, 6)
  const more = countdowns.length - shown.length

  return (
    <PhoneCard padding={15}>
      <CardHead
        title="Countdowns"
        size="sm"
        action={
          <button type="button" className="p-add" onClick={() => navigate(`${PLANNER_ROOT}/calendar`)}>
            <svg viewBox="0 0 24 24" width="10" height="10" aria-hidden="true">
              <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" />
            </svg>
            Add
          </button>
        }
      />
      {shown.length === 0 ? (
        <div className="p-count-empty">Nothing to count down to yet — add a trip; birthdays are automatic.</div>
      ) : (
        <div className="p-count-rows">
          {shown.map((c) => (
            <div key={c.id} className="p-count-row">
              <EmojiTile emoji={c.emoji} colorHex={c.color} />
              <span className="p-count-text">
                <span className="p-count-title">{c.title}</span>
                <span className="p-count-date">{dateLabel(c.date)}</span>
              </span>
              <span className="p-event-spacer" />
              <span className={`p-count-days${c.daysLeft <= 7 ? ' soon' : ''}`}>{daysLabel(c.daysLeft, sleeps)}</span>
              {c.source === 'standalone' ? (
                <button
                  type="button"
                  className="p-count-x"
                  aria-label={`Remove ${c.title}`}
                  onClick={() => void countdownsApi.remove(c.id).catch(() => {})}
                >
                  {/* Struck as an outline (circle + cross) rather than the filled
                      x-in-circle glyph: at 15pt the filled path reads as a grey blob. */}
                  <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M9 9l6 6M15 9l-6 6" />
                  </svg>
                </button>
              ) : null}
            </div>
          ))}
          {more > 0 ? <div className="p-add-more">+{more} more</div> : null}
        </div>
      )}
    </PhoneCard>
  )
}

/** TodayView.tonightCard — the split card: 104pt gradient media block, then the text column. */
export function TonightPhoneCard() {
  const { entries } = useMealsWeek()
  const navigate = useNavigate()
  const dinner = entries.find((e) => e.date === todayYmd() && e.mealType === 'dinner')
  if (!dinner) return null

  const title = dinner.recipe?.title ?? dinner.meal?.name ?? dinner.title ?? 'Dinner'
  const emoji = dinner.recipe?.emoji ?? '🍽️'
  const parts: string[] = []
  if (dinner.meal) parts.push(`${dinner.meal.recipes.length} ${dinner.meal.recipes.length === 1 ? 'dish' : 'dishes'}`)
  if (dinner.recipe?.cookTimeMinutes) parts.push(`🕐 ${dinner.recipe.cookTimeMinutes} min`)
  const servings = dinner.recipe?.servings ?? dinner.meal?.servings
  if (servings) parts.push(`serves ${servings}`)

  const open = () => {
    if (dinner.recipeId) navigate(`${PLANNER_ROOT}/meals/recipe/${dinner.recipeId}`)
    else navigate(`${PLANNER_ROOT}/meals`)
  }

  return (
    <PhoneCard padding={0} className="p-tonight">
      <button
        type="button"
        onClick={open}
        style={{ display: 'flex', alignItems: 'stretch', width: '100%', padding: 0, border: 0, background: 'none', font: 'inherit', textAlign: 'left', cursor: 'pointer', color: 'inherit' }}
      >
        <span className="p-tonight-media" aria-hidden="true">
          {emoji}
        </span>
        <span className="p-tonight-text">
          <span className="p-tonight-kicker">TONIGHT · DINNER</span>
          <span className="p-tonight-title">{title}</span>
          {parts.length ? <span className="p-tonight-sub">{parts.join(' · ')}</span> : null}
        </span>
      </button>
    </PhoneCard>
  )
}

/** TodayView.choresCard — the left small card: overlapping avatars, progress, "N of M · ★ X". */
export function ChoresPhoneCard() {
  const { people } = useChoresToday()
  const navigate = useNavigate()
  const total = people.reduce((n, p) => n + p.total, 0)
  const done = people.reduce((n, p) => n + p.done, 0)
  const stars = people.reduce((n, p) => n + (p.stars ?? 0), 0)

  return (
    <PhoneCard padding={15} className="p-small" >
      <button
        type="button"
        onClick={() => navigate(`${PLANNER_ROOT}/tasks`)}
        style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', padding: 0, border: 0, background: 'none', font: 'inherit', textAlign: 'left', color: 'inherit', cursor: 'pointer' }}
      >
        <span className="p-small-label">Chores</span>
        <span className="p-chore-avs">
          {people.slice(0, 3).map((p) => (
            <PhoneAvatar key={p.id} emoji={p.avatarEmoji} colorHex={p.colorHex} size={30} />
          ))}
        </span>
        {total > 0 ? (
          <>
            <ProgressBar value={done / total} />
            <span className="p-chore-line">
              {done} of {total} · <span className="stars">★ {stars}</span>
            </span>
          </>
        ) : (
          <span className="p-chore-line">No chores today</span>
        )}
      </button>
    </PhoneCard>
  )
}

/** TodayView.groceryCard — the right small card: label, big count, "items to buy". */
export function GroceryPhoneCard() {
  const { items } = useGrocery()
  const navigate = useNavigate()
  const remaining = items.filter((i) => !i.checked).length

  return (
    <PhoneCard padding={15} className="p-small">
      <button
        type="button"
        onClick={() => navigate(`${PLANNER_ROOT}/lists`)}
        style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%', padding: 0, border: 0, background: 'none', font: 'inherit', textAlign: 'left', color: 'inherit', cursor: 'pointer' }}
      >
        <span className="p-small-label">Grocery</span>
        <span className="p-small-n">{remaining}</span>
        <span className="p-small-sub">{remaining === 1 ? 'item to buy' : 'items to buy'}</span>
      </button>
    </PhoneCard>
  )
}

/** CountdownFormat.dateLabel — "2026-08-03" → "Aug 3". */
export function dateLabel(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!m) return ymd
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** CountdownFormat.label — honours the household "sleeps" setting. */
export function daysLabel(daysLeft: number, sleeps: boolean): string {
  if (daysLeft <= 0) return 'Today!'
  if (daysLeft === 1) return sleeps ? '1 sleep' : 'Tomorrow'
  return `${daysLeft} ${sleeps ? 'sleeps' : 'days'}`
}
