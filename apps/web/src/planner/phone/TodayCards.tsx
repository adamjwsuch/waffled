import { Fragment, useState } from 'react'
import { useNavigate } from 'react-router'
import { CardHead, EmojiTile, GoalRing, Hair, PhoneAvatar, PhoneCard, ProgressBar } from './primitives'
import {
  useChoresToday, useCountdowns, useEventsToday, useGrocery, useMealsWeek,
  useLists, useListDetail, groceryApi, type ListItem, type ListSummary,
  useGoals, usePersons, useHousehold, can,
  goalDisplayProgress, goalDisplayTarget, goalFraction, goalWeekTargetLabel, fmtGoalNum,
  type Goal,
  useRhythms, useRhythmAttention, rhythmsApi, cadenceLabel, dueLabel, periodLabel, type AttentionItem,
} from '../../lib/api'
import { countdownsApi, type AgendaEvent } from '../../lib/api'
import { useEventColor } from '../../lib/event-color'
import { TODAY_LIST_PICK_KEY } from '../../kiosk/components/ListCard'
import { LogModal } from '../../kiosk/components/LogModal'
import { BookRhythmModal } from '../../kiosk/components/BookRhythmModal'
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

/** TodayView.groceryCard — the right small card: label, big count, "items to buy".
 *  Opens the grocery list's own board directly (its id, not the Lists index) — the
 *  same one-tap shortcut the kiosk's auto-select used to give you by accident of
 *  being the only list on screen; now it is the card's own target instead. */
export function GroceryPhoneCard() {
  const { items } = useGrocery()
  const { lists } = useLists()
  const navigate = useNavigate()
  const remaining = items.filter((i) => !i.checked).length
  const groceryId = lists.find((l) => l.listType === 'grocery')?.id

  return (
    <PhoneCard padding={15} className="p-small">
      <button
        type="button"
        onClick={() => navigate(groceryId ? `${PLANNER_ROOT}/lists/${groceryId}` : `${PLANNER_ROOT}/lists`)}
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

// ── Lists ─────────────────────────────────────────────────────────────────────────
//
// TodayListCard.swift — pins ONE of the household's custom lists so the hardware
// run / packing list sits on Today next to everything else. Which list is pinned is
// a per-DEVICE choice, not household config, so it is read from the same localStorage
// key the kiosk's ListCard uses: the phone and the kiosk board on one device should
// agree on which list Today shows, and a separate key would just make them drift.

/** The list card only ever shows unfinished items, so there's nothing to check against
 *  "lists the phone shouldn't offer" beyond what the kiosk's own card excludes: the
 *  auto-built grocery board (that has its own card) and saved templates (not real lists). */
function pickableLists(lists: ListSummary[]): ListSummary[] {
  return lists.filter((l) => l.listType !== 'grocery' && l.listType !== 'template' && !l.isAutoBuilt)
}

export function ListsPhoneCard() {
  const navigate = useNavigate()
  const { lists, loading: listsLoading, error: listsError } = useLists()
  const [pick, setPick] = useState<string | null>(
    () => (typeof localStorage !== 'undefined' ? localStorage.getItem(TODAY_LIST_PICK_KEY) : null)
  )
  const pickable = pickableLists(lists)
  const active = pickable.find((l) => l.id === pick) ?? pickable[0] ?? null
  const { items, loading, error } = useListDetail(active?.id ?? null)

  const [done, setDone] = useState<Set<string>>(new Set())

  function choose(id: string) {
    setPick(id)
    try {
      localStorage.setItem(TODAY_LIST_PICK_KEY, id)
    } catch {
      // private mode / storage disabled — the choice just won't persist
    }
    setDone(new Set())
  }

  async function check(item: ListItem) {
    setDone((prev) => new Set(prev).add(item.id))
    try {
      await groceryApi.setItemChecked(item.id, true)
    } catch {
      setDone((prev) => {
        const next = new Set(prev)
        next.delete(item.id)
        return next
      })
    }
  }

  const open = items.filter((i) => !i.checked && !done.has(i.id))

  return (
    <PhoneCard padding={16} className="p-list">
      <div className="p-list-head">
        <button
          type="button"
          className="p-list-title"
          disabled={!active}
          onClick={() => active && navigate(`${PLANNER_ROOT}/lists/${active.id}`)}
        >
          <span className="p-head-title">{active ? `${active.emoji ?? '📝'} ${active.name}` : 'Lists'}</span>
          {active ? (
            <svg viewBox="0 0 24 24" className="p-chev" aria-hidden="true">
              <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : null}
        </button>
        {pickable.length > 1 ? (
          <select
            className="p-list-pick"
            aria-label="Which list"
            value={active?.id ?? ''}
            onChange={(e) => choose(e.target.value)}
          >
            {pickable.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        ) : null}
      </div>

      {pickable.length === 0 ? (
        <div className="p-list-empty">
          {listsError ? "Couldn't load your lists — pull to refresh or sign in again."
            : listsLoading ? 'Loading…'
              : "No lists yet — make one in Lists and it'll show up here."}
        </div>
      ) : active && loading ? (
        <div className="p-list-empty">Loading…</div>
      ) : active && error ? (
        <div className="p-list-empty">Couldn't load the list — pull to refresh or sign in again.</div>
      ) : open.length === 0 ? (
        <div className="p-list-empty">All done here. 🎉</div>
      ) : (
        open.map((item, i) => (
          <Fragment key={item.id}>
            <button type="button" className="p-list-row" onClick={() => check(item)} aria-label={`Check off ${item.name}`}>
              <span className="p-list-check" aria-hidden="true" />
              <span className="p-list-name">
                {item.name}
                {item.quantity ? <span className="p-list-qty"> ({item.quantity})</span> : null}
              </span>
            </button>
            {i < open.length - 1 ? <Hair /> : null}
          </Fragment>
        ))
      )}
    </PhoneCard>
  )
}

// ── Goals ─────────────────────────────────────────────────────────────────────────
//
// GoalHeroCard.swift — one featured goal, big: a ring, the title, this week's target,
// a streak, a contribution row per participant, and a "Log" button. Same pick key as
// the kiosk's GoalSpotlightCard so the phone and the kiosk board agree which goal
// Today shows on this device, and the same resolve order: an explicit pick, else the
// scope's spotlight, else its featured, else the first goal in scope, else any goal.
const GOAL_PICK_KEY = 'waffled.todayGoalPick'

/** GoalHeroCard.scopeLabel — who the goal belongs to, not always "Family". */
function scopeLabel(g: Goal, myPersonId: string | undefined, everyone: Set<string>): string {
  const parts = new Set(g.participants.map((p) => p.personId))
  if (everyone.size > 1 && [...everyone].every((id) => parts.has(id))) return 'Family Goal'
  if (parts.size === 1) {
    const only = g.participants[0]
    if (myPersonId && only.personId === myPersonId) return 'My Goal'
    if (only) return `${only.name}'s Goal`
  }
  return parts.size === 0 ? 'Goal' : 'Group Goal'
}

function resolveGoal(goals: Goal[], pick: string, me: string | undefined, everyone: Set<string>): Goal | null {
  if (pick !== 'mine' && pick !== 'family') {
    const chosen = goals.find((g) => g.id === pick)
    if (chosen) return chosen
  }
  const mine = (g: Goal) => !!me && g.participants.length > 0 && new Set(g.participants.map((p) => p.personId)).size === 1 && g.participants[0].personId === me
  const family = (g: Goal) => everyone.size > 1 && [...everyone].every((id) => g.participants.some((p) => p.personId === id))
  const inScope = pick === 'family' ? family : mine
  return (
    goals.find((g) => inScope(g) && g.isSpotlight) ??
    goals.find((g) => inScope(g) && g.isFeatured) ??
    goals.find(inScope) ??
    goals.find((g) => g.isSpotlight) ??
    goals.find((g) => g.isFeatured) ??
    goals[0] ??
    null
  )
}

export function GoalsPhoneCard() {
  const navigate = useNavigate()
  const { goals, loading, refetch } = useGoals(null)
  const { person } = useHousehold()
  const { persons } = usePersons()
  const me = person?.id
  const everyone = new Set(persons.map((p) => p.id))
  const [pick, setPick] = useState<string>(() => (typeof localStorage !== 'undefined' && localStorage.getItem(GOAL_PICK_KEY)) || 'mine')
  const [logging, setLogging] = useState<Goal | null>(null)
  const canManageGoals = can(person, 'goal.manage')

  function choose(v: string) {
    setPick(v)
    try {
      localStorage.setItem(GOAL_PICK_KEY, v)
    } catch {
      // private mode / storage disabled
    }
  }

  const g = resolveGoal(goals, pick, me, everyone)

  if (!g) {
    return (
      <PhoneCard padding={15}>
        <CardHead title="Goals" chevron onClick={() => navigate(`${PLANNER_ROOT}/goals`)} />
        <div className="p-goal-empty">{loading ? 'Loading…' : 'Set a family goal →'}</div>
      </PhoneCard>
    )
  }

  const tag = g.isSpotlight ? '🌟 Spotlight' : g.isFeatured ? '📌 Pinned' : scopeLabel(g, me, everyone)
  const frac = goalFraction(g)
  const target = goalDisplayTarget(g)
  const progressLabel = fmtGoalNum(goalDisplayProgress(g))
  const maxProg = Math.max(1, ...g.participants.map((p) => p.progress), 1)

  return (
    <PhoneCard padding={15} className="p-goal-hero">
      <div className="p-goal-top">
        <span className="p-goal-scope">{tag}</span>
        <span className="p-head-gap" />
        <button type="button" className="p-goal-seeall" onClick={() => navigate(`${PLANNER_ROOT}/goals`)} aria-label="See all goals">
          <svg viewBox="0 0 24 24" className="p-chev" aria-hidden="true">
            <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <button type="button" className="p-goal-body" onClick={() => navigate(`${PLANNER_ROOT}/goals/${g.id}`)}>
        <GoalRing value={frac}>
          <span className="p-goal-ring-n">{progressLabel}</span>
          {target != null ? <span className="p-goal-ring-t">of {fmtGoalNum(target)}{g.unit ? ` ${g.unit}` : ''}</span> : null}
        </GoalRing>
        <span className="p-goal-info">
          <span className="p-goal-title">{g.emoji ?? '🎯'} {g.title}</span>
          {goalWeekTargetLabel(g) ? <span className="p-goal-week">{goalWeekTargetLabel(g)}</span> : null}
          {g.streakDays > 0 ? <span className="p-goal-streak">🔥 {g.streakDays}-day streak</span> : null}
        </span>
      </button>
      {g.participants.length > 0 ? (
        <div className="p-goal-contribs">
          {g.participants.map((p) => (
            <div key={p.personId} className="p-goal-contrib">
              <PhoneAvatar emoji={p.avatarEmoji} colorHex={p.colorHex} size={26} />
              <span className="p-goal-contrib-main">
                <span className="p-goal-contrib-row">
                  <span className="p-goal-contrib-name">{p.name}</span>
                  <span className="p-goal-contrib-n">{fmtGoalNum(p.progress)}{p.target != null ? ` / ${fmtGoalNum(p.target)}` : ''}{g.unit ? ` ${g.unit}` : ''}</span>
                </span>
                <ProgressBar value={maxProg > 0 ? p.progress / maxProg : 0} tint="#fff" />
              </span>
            </div>
          ))}
        </div>
      ) : null}
      <button type="button" className="p-goal-log" onClick={() => setLogging(g)}>
        + Log {g.unit || 'progress'}
      </button>
      {goals.length > 1 ? (
        <select className="p-goal-switch" aria-label="Show on Today" value={pick} onChange={(e) => choose(e.target.value)}>
          <option value="mine">My spotlight</option>
          <option value="family">Family spotlight</option>
          {goals.map((go) => (
            <option key={go.id} value={go.id}>{go.emoji ?? '🎯'} {go.title}</option>
          ))}
        </select>
      ) : null}
      {logging ? (
        <LogModal
          goal={logging}
          canLogOthers={canManageGoals}
          canDelete={canManageGoals || (logging.participants.length === 1 && logging.participants[0].personId === me)}
          selfPersonId={me ?? null}
          onClose={() => setLogging(null)}
          onSaved={() => { setLogging(null); refetch() }}
          onDeleted={() => { setLogging(null); refetch() }}
        />
      ) : null}
    </PhoneCard>
  )
}

// ── Rhythms ───────────────────────────────────────────────────────────────────────
//
// RhythmsTodayCard.swift — renders NOTHING when the register is quiet, same rule as
// Tonight with no dinner planned: most days nothing needs attention, and an empty
// card every morning is how a board stops being read. A due row offers "I did it";
// an unscheduled row offers "Book a time" / "Put it back" plus a quiet "Handled".
const RHYTHM_CAP = 4

function rhythmSort(items: AttentionItem[]): AttentionItem[] {
  return [...items].sort((a, b) => {
    const rank = (i: AttentionItem) => (i.kind === 'due' && i.overdue ? 0 : i.kind === 'due' ? 1 : 2)
    const d = rank(a) - rank(b)
    return d !== 0 ? d : a.rhythm.title.localeCompare(b.rhythm.title)
  })
}

function rhythmUrgent(item: AttentionItem): boolean {
  if (item.kind === 'due') return !!item.overdue
  const end = new Date(`${item.windowEnd}T00:00:00`)
  const now = new Date()
  const days = Math.round((Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000)
  return days <= 1
}

function RhythmRow({ item, onChanged, onBook }: { item: AttentionItem; onChanged: () => void; onBook: () => void }) {
  const [busy, setBusy] = useState(false)
  const urgent = rhythmUrgent(item)

  async function markDone() {
    if (busy || item.kind !== 'due') return
    setBusy(true)
    try {
      await rhythmsApi.complete(item.rhythm.id)
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  const series = item.kind === 'unscheduled' && item.rhythm.autoSchedule && !item.hasSeries
  const subtitle = item.kind === 'due'
    ? `${dueLabel(item.dueAt, !!item.overdue)} · ${cadenceLabel(item.rhythm.every)}`
    : `${periodLabel(item.windowEnd)}${series ? ' · the series needs putting back' : ''}`

  return (
    <div className="p-rhy-row">
      <EmojiTile emoji={item.rhythm.emoji ?? (item.kind === 'unscheduled' ? '🗓️' : '🔁')} size={32} radius={9} />
      <span className="p-rhy-main">
        <span className="p-rhy-title">{item.rhythm.title}</span>
        <span className={`p-rhy-sub${urgent ? ' urgent' : ''}`}>{subtitle}</span>
      </span>
      {item.kind === 'due' ? (
        <button type="button" className={`p-rhy-act${urgent ? ' urgent' : ''}`} disabled={busy} onClick={markDone}>
          {busy ? '…' : 'I did it'}
        </button>
      ) : (
        <button type="button" className={`p-rhy-act${urgent ? ' urgent' : ''}`} onClick={onBook}>
          {series ? 'Put it back' : 'Book'}
        </button>
      )}
    </div>
  )
}

export function RhythmsPhoneCard() {
  const navigate = useNavigate()
  const { items, loading, refetch } = useRhythmAttention()
  // Only asked for once there's something to show — a quiet register shouldn't cost a
  // second request on every morning it has nothing to say. See RhythmsCard (kiosk).
  const nonEmpty = !loading && items.length > 0
  return nonEmpty ? <RhythmsBlock items={items} refetch={refetch} onSeeAll={() => navigate(`${PLANNER_ROOT}/rhythms`)} /> : null
}

function RhythmsBlock({ items, refetch, onSeeAll }: { items: AttentionItem[]; refetch: () => void; onSeeAll: () => void }) {
  const { rhythms } = useRhythms()
  const [booking, setBooking] = useState<Extract<AttentionItem, { kind: 'unscheduled' }> | null>(null)
  const sorted = rhythmSort(items)
  const shown = sorted.slice(0, RHYTHM_CAP)
  const more = sorted.length - shown.length

  return (
    <PhoneCard padding={15} className="p-rhy">
      <button type="button" className="p-rhy-head" onClick={onSeeAll}>
        <span className="p-head-title-sm">🔁 Rhythms</span>
        <span className="p-rhy-count">{items.length === 1 ? '1 wants attention' : `${items.length} want attention`}</span>
        <span className="p-head-gap" />
        <span className="p-rhy-all">{rhythms.length ? `All ${rhythms.length}` : 'All'}</span>
        <svg viewBox="0 0 24 24" className="p-chev" aria-hidden="true">
          <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {shown.map((item) => (
        <RhythmRow
          key={item.rhythm.id}
          item={item}
          onChanged={refetch}
          onBook={() => { if (item.kind === 'unscheduled') setBooking(item) }}
        />
      ))}
      {more > 0 ? <div className="p-rhy-more">+{more} more</div> : null}
      {booking ? <BookRhythmModal item={booking} onClose={() => setBooking(null)} onBooked={refetch} /> : null}
    </PhoneCard>
  )
}
