import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { MEAL_LABEL, RecipeBrowser, gradClass, type MealType } from '../../kiosk/components/RecipeBrowser'
import { Icon } from '../../kiosk/icons'
import { mealsApi, useHousehold, useMealsWeek, useRecipes } from '../../lib/api'
import type { WeekEntry } from '../../lib/api'
import '../../styles/planner-screens.css'
import { PLANNER_ROOT } from '../mode'
import { PhoneCard } from './primitives'

/** WeekPlannerView's phone shape, in React: a week header with the chevrons and the
 *  "Jump to this week" link, then one card per day — weekday heavy, day number, a TODAY
 *  pill, and a row per slot (the planned meal, or a dashed "Plan <slot>" button) in the
 *  app's own order: breakfast, lunch, dinner, then anything else in slot order. Meal rows
 *  are the app's: 40pt gradient tile with the dish emoji, 15pt semibold title, meta line.
 *  Picking a meal hands off to the app's own RecipeBrowser, which is what the kiosk uses. */

const PRIMARY_SLOTS = ['breakfast', 'lunch', 'dinner'] as const
const SLOT_ORDER: Record<string, number> = { breakfast: 0, lunch: 1, dinner: 2, snack: 3 }

export function startOfWeek(d: Date, firstDay: 'monday' | 'sunday'): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  const lead = firstDay === 'monday' ? (out.getDay() + 6) % 7 : out.getDay()
  out.setDate(out.getDate() - lead)
  return out
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + n)
  return out
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function PlannerMeals() {
  const { household } = useHousehold()
  const firstDay = (household?.weekStart as 'monday' | 'sunday') ?? 'monday'
  const navigate = useNavigate()
  const [weekOffset, setWeekOffset] = useState(0)
  const [picking, setPicking] = useState<{ date: string; mealType: MealType } | null>(null)
  const [menuFor, setMenuFor] = useState<string | null>(null)

  const thisWeek = startOfWeek(new Date(), firstDay)
  const weekStart = useMemo(() => addDays(thisWeek, weekOffset * 7), [weekOffset, thisWeek.getTime()]) // eslint-disable-line react-hooks/exhaustive-deps
  const startStr = ymd(weekStart)
  const { entries, refetch } = useMealsWeek(startStr)
  const { recipes, loading } = useRecipes()

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const todayKey = ymd(new Date())
  const byDay = new Map<string, WeekEntry[]>()
  for (const e of entries) {
    const list = byDay.get(e.date)
    if (list) list.push(e)
    else byDay.set(e.date, [e])
  }

  const weekTitle =
    weekOffset === 0
      ? 'This week'
      : `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${addDays(weekStart, 6).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`

  const plan = async (recipeId: string) => {
    if (!picking) return
    await mealsApi.planSlot({ date: picking.date, mealType: picking.mealType, recipeId })
    setPicking(null)
    refetch()
  }

  const remove = async (e: WeekEntry) => {
    await mealsApi.clearSlot(e.date, e.mealType)
    setMenuFor(null)
    refetch()
  }

  if (picking) {
    return (
      <div className="planner-screen-body p-sheet">
        <div className="p-sheet-head">
          <button type="button" onClick={() => setPicking(null)}>
            <Icon name="cl" /> Back
          </button>
          <span>
            {MEAL_LABEL[picking.mealType]} · {picking.date.slice(5)}
          </span>
        </div>
        <RecipeBrowser
          recipes={recipes}
          loading={loading}
          slot={picking.mealType}
          selectLabel={`Use for ${MEAL_LABEL[picking.mealType]}`}
          onPick={(r) => void plan(r.id)}
          onView={(r) => navigate(`${PLANNER_ROOT}/meals/recipe/${r.id}`)}
          onEatingOut={() => void plan('over')}
          onLeftovers={() => void plan('leftovers')}
        />
      </div>
    )
  }

  return (
    <div className="planner-screen-body">
      <div className="p-meals-head">
        <button type="button" aria-label="Previous week" onClick={() => setWeekOffset(weekOffset - 1)}>
          <Icon name="cl" />
        </button>
        <div className="p-meals-title">
          <strong>{weekTitle}</strong>
          {weekOffset !== 0 && (
            <button type="button" className="p-meals-jump" onClick={() => setWeekOffset(0)}>
              Jump to this week
            </button>
          )}
        </div>
        <button type="button" aria-label="Next week" onClick={() => setWeekOffset(weekOffset + 1)}>
          <Icon name="cr" />
        </button>
      </div>

      {days.map((day) => {
        const key = ymd(day)
        const dayEntries = (byDay.get(key) ?? []).slice().sort((a, b) => (SLOT_ORDER[a.mealType] ?? 9) - (SLOT_ORDER[b.mealType] ?? 9))
        const isToday = key === todayKey
        const rest = dayEntries.filter((e) => !PRIMARY_SLOTS.includes(e.mealType as (typeof PRIMARY_SLOTS)[number]))
        return (
          <PhoneCard key={key} padding={14}>
            <div className="p-meal-day-head">
              <span className={isToday ? 'today' : ''}>{day.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}</span>
              <span className="num">{day.getDate()}</span>
              {isToday && <span className="p-today-pill">TODAY</span>}
            </div>
            <div className="p-meal-slots">
              {PRIMARY_SLOTS.map((slot) => {
                const entry = dayEntries.find((e) => e.mealType === slot)
                if (!entry) {
                  return (
                    <button key={slot} type="button" className="p-plan-btn" onClick={() => setPicking({ date: key, mealType: slot })}>
                      <Icon name="plus" />
                      Plan {MEAL_LABEL[slot]}
                    </button>
                  )
                }
                return (
                  <MealRow
                    key={slot}
                    entry={entry}
                    menuOpen={menuFor === entry.id}
                    onToggleMenu={() => setMenuFor(menuFor === entry.id ? null : entry.id)}
                    onChange={() => setPicking({ date: key, mealType: slot })}
                    onRemove={() => void remove(entry)}
                    onOpen={() => navigate(entry.recipeId ? `${PLANNER_ROOT}/meals/recipe/${entry.recipeId}` : `${PLANNER_ROOT}/meals`)}
                  />
                )
              })}
              {rest.map((entry) => (
                <MealRow
                  key={entry.id}
                  entry={entry}
                  menuOpen={menuFor === entry.id}
                  onToggleMenu={() => setMenuFor(menuFor === entry.id ? null : entry.id)}
                  onChange={() => setPicking({ date: key, mealType: entry.mealType as MealType })}
                  onRemove={() => void remove(entry)}
                  onOpen={() => navigate(entry.recipeId ? `${PLANNER_ROOT}/meals/recipe/${entry.recipeId}` : `${PLANNER_ROOT}/meals`)}
                />
              ))}
            </div>
          </PhoneCard>
        )
      })}
    </div>
  )
}

function MealRow({
  entry,
  menuOpen,
  onToggleMenu,
  onChange,
  onRemove,
  onOpen,
}: {
  entry: WeekEntry
  menuOpen: boolean
  onToggleMenu: () => void
  onChange: () => void
  onRemove: () => void
  onOpen: () => void
}) {
  const recipe = entry.recipe
  const title = entry.title ?? recipe?.title ?? entry.meal?.name ?? 'Meal'
  return (
    <div className="p-meal-row">
      <button type="button" className="p-meal-main" onClick={onOpen}>
        <span className={`p-meal-tile ${gradClass({ category: recipe?.category ?? entry.mealType })}`}>{recipe?.emoji ?? '🍽️'}</span>
        <span className="p-meal-text">
          <span className="p-meal-name">{title}</span>
          <span className="p-meal-meta">
            {entry.mealType !== 'dinner' && <span className="p-tag">{MEAL_LABEL[entry.mealType]}</span>}
            {recipe?.cookTimeMinutes ? <span>🕐 {recipe.cookTimeMinutes}m</span> : null}
            {entry.cook?.name ? <span>👩‍🍳 {entry.cook.name}</span> : null}
          </span>
        </span>
      </button>
      <div className="p-meal-menu-wrap">
        <button type="button" className="p-meal-menu" aria-label="Meal options" onClick={onToggleMenu}>
          <Icon name="menu" />
        </button>
        {menuOpen && (
          <div className="p-menu">
            <button type="button" onClick={onChange}>
              Change
            </button>
            <button type="button" className="danger" onClick={onRemove}>
              Remove
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
