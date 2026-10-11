import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PlannerCalendar, dayKey, isoWeek, monthRows } from './PlannerCalendar'
import { PlannerFamily } from './PlannerFamily'
import { PlannerMeals, startOfWeek } from './PlannerMeals'

// The three phone screens the planner gives its own card interiors. They share the app's
// hooks with the kiosk (nothing new is fetched), so what is asserted here is the phone
// shape: the month grid's rows and chips, the per-day meal cards with their plan buttons,
// and the member row. The hook shapes are the ones the api layer returns.

const today = new Date()
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const todayKey = ymd(today)

const person = { id: 'p1', name: 'Alex', memberType: 'adult', isAdmin: true, avatarEmoji: '🦊', colorHex: '#2F7FED' }
const jenn = { id: 'p2', name: 'Jenn', memberType: 'adult', isAdmin: true, avatarEmoji: '👩🏻', colorHex: '#E0548B' }

const events = [
  { id: 'e1', title: 'Dentist', startsAt: `${todayKey}T09:00:00`, endsAt: `${todayKey}T09:45:00`, allDay: false, location: null, personId: 'p2', personName: 'Jenn', personColor: '#E0548B', personEmoji: '👩🏻', participants: [] },
]

const meals = [
  { id: 'm1', date: todayKey, mealType: 'dinner', title: 'Pork Chops', recipeId: 'r1', mealId: null, cook: null, meal: null, recipe: { id: 'r1', title: 'Pork Chops', emoji: '🍽️', category: 'dinner', cookTimeMinutes: 25, servings: 4 } },
]

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>()
  return {
    ...actual,
    useHousehold: () => ({
      household: { id: 'h', name: 'Home', timezone: 'Europe/London', weekStart: 'monday', location: null, ownerPersonId: null, settings: { modules: { meals: true, chores: true, goals: true, lists: true, pantry: false } } },
      person,
      loading: false,
    }),
    useEventsRange: () => ({ events, loading: false, refetch: () => {} }),
    useCountdowns: () => ({ countdowns: [], sleeps: false, birthdayHorizonDays: 183, loading: false, refetch: () => {} }),
    usePersons: () => ({ persons: [person, jenn], loading: false, refetch: () => {} }),
    useChoresToday: () => ({ people: [{ id: 'p1', name: 'Alex', avatarEmoji: '🦊', colorHex: '#2F7FED', memberType: 'adult', isAdmin: true, total: 4, done: 1, stars: 180 }], upForGrabs: 0, loading: false, refetch: () => {} }),
    useMealsWeek: () => ({ entries: meals, loading: false, refetch: () => {}, error: null }),
    useRecipes: () => ({ recipes: [{ id: 'r1', title: 'Pork Chops', emoji: '🍽️', category: 'dinner' }], loading: false }),
  }
})

vi.mock('../../kiosk/components/RecipeBrowser', async () => ({
  MEALS: ['breakfast', 'lunch', 'dinner', 'snack'],
  MEAL_LABEL: { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' },
  gradClass: () => 'g-pasta',
  RecipeBrowser: ({ selectLabel }: { selectLabel?: string }) => <div data-testid="recipe-browser">{selectLabel}</div>,
}))

const wrap = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe('month grid maths', () => {
  it('cuts the month on the household first day and numbers the weeks', () => {
    const rows = monthRows(new Date(2026, 9, 1), 'monday') // October 2026
    expect(rows).toHaveLength(5)
    expect(rows[0].days[0].key).toBe('2026-09-28') // starts on the Monday before the 1st
    expect(rows[0].days[0].inMonth).toBe(false)
    expect(rows[0].days[3].key).toBe('2026-10-01')
    expect(rows[0].days[3].inMonth).toBe(true)
  })

  it('pads differently on a Sunday-first week', () => {
    const rows = monthRows(new Date(2026, 9, 1), 'sunday')
    expect(rows[0].days[0].key).toBe('2026-09-27')
  })

  it('numbers weeks the ISO way even when the row starts on a Sunday', () => {
    expect(isoWeek(new Date(2026, 9, 4))).toBe(40) // Sunday 4 Oct 2026 → ISO week 40
    expect(isoWeek(new Date(2026, 9, 5))).toBe(41)
  })

  it('formats and parses day keys round-trip', () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('PlannerCalendar', () => {
  it('shows the weekday band, the month title and the selected day agenda', () => {
    wrap(<PlannerCalendar />)
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(screen.getByText('Mon')).toBeInTheDocument()
    expect(screen.getByText('Sun')).toBeInTheDocument()
    // today is selected on open, so today's event shows as a chip in the grid and again
    // as a row in the agenda below it
    expect(screen.getByText('Today')).toBeInTheDocument()
    expect(screen.getAllByText('Dentist').length).toBeGreaterThanOrEqual(2)
  })

  it('steps months from the header', () => {
    wrap(<PlannerCalendar />)
    const before = screen.getByRole('heading', { level: 1 }).textContent
    fireEvent.click(screen.getByRole('button', { name: /next month/i }))
    const after = screen.getByRole('heading', { level: 1 }).textContent
    expect(after).not.toBe(before)
  })
})

describe('PlannerMeals', () => {
  it('renders one card per day of the week with a plan button for empty slots', () => {
    wrap(<PlannerMeals />)
    const heads = screen.getAllByText(/^(MON|TUE|WED|THU|FRI|SAT|SUN)$/)
    expect(heads).toHaveLength(7)
    expect(screen.getByText('Pork Chops')).toBeInTheDocument()
    expect(screen.getByText('TODAY')).toBeInTheDocument()
    expect(screen.getAllByText(/^Plan (Breakfast|Lunch|Dinner)$/).length).toBeGreaterThan(0)
  })

  it('hands a slot to the app recipe browser', () => {
    wrap(<PlannerMeals />)
    fireEvent.click(screen.getAllByText(/^Plan Dinner$/)[0])
    expect(screen.getByTestId('recipe-browser')).toHaveTextContent('Use for Dinner')
  })

  it('lands on the week containing today', () => {
    const start = startOfWeek(new Date(2026, 9, 11), 'monday')
    expect(dayKey(start)).toBe('2026-10-05')
  })
})

describe('PlannerFamily', () => {
  beforeEach(() => localStorage.clear())

  it('lists a column per member plus the add button', () => {
    wrap(<PlannerFamily />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Family')
    expect(screen.getByText('Alex')).toBeInTheDocument()
    expect(screen.getByText('Jenn')).toBeInTheDocument()
    expect(screen.getByText('Add')).toBeInTheDocument()
    expect(screen.getByText('1/4 chores')).toBeInTheDocument()
  })

  it('shows the module tiles the household has on', () => {
    wrap(<PlannerFamily />)
    expect(screen.getByText('Chores')).toBeInTheDocument()
    expect(screen.getByText('Goals')).toBeInTheDocument()
    expect(screen.getByText('Recipes')).toBeInTheDocument()
    expect(screen.queryByText('Pantry')).not.toBeInTheDocument()
  })
})
