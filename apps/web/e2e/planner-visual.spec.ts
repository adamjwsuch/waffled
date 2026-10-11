import { expect, test, type Page } from '@playwright/test'

// Visual + geometry gate for the phone planner (src/planner).
//
// The planner is a *phone* layout, so this spec runs the real built app at the real
// device metrics — 402x874pt at DPR 3, the iPhone the reference captures were measured
// on — and asserts the numbers that define the shape rather than "it didn't crash":
// the 18px page gutter, the 14px card gap, 22px card radius, the 50px capture pill, the
// 54px capture button raised 9px above a 64px tab bar. Those come from the measured
// parity work (see the `ui-parity-render-check` notes); if someone changes a token or a
// padding, this fails rather than the phone quietly drifting.
//
// Screenshot lands in test-results/ for eyeballing; the assertions are the guard.

test.use({
  viewport: { width: 402, height: 874 },
  deviceScaleFactor: 3,
  isMobile: false, // layout viewport stays 402px (see the parity skill's pitfall)
  hasTouch: true,
})

const person = {
  id: 'person-1', name: 'Alex', memberType: 'adult', isAdmin: true,
  avatarEmoji: '🦊', colorHex: '#4f7f73',
  capabilities: ['chore.manage', 'chore.approve', 'goal.manage', 'reward.grant'],
}

const modules = {
  pantry: false, chores: true, goals: true, meals: true,
  lists: true, familyNight: false, quotes: false,
}

const household = {
  id: 'household-1', name: 'Test Household', timezone: 'Europe/London', weekStart: 'monday',
  location: null, ownerPersonId: person.id,
  settings: {
    modules,
    chores: { rewards: false },
    pantry: { showOnToday: false },
    familyNight: { showOnToday: false },
  },
}

const capabilities = ['chore.manage', 'chore.approve', 'goal.manage', 'reward.grant', 'reward.manage']
const permissionRow = Object.fromEntries(capabilities.map((c) => [c, false]))

// The phone layout the mocked api serves, in the server's canonical order; a spec may
// reorder it through the Customize sheet and watch Today follow.
const CANONICAL_ORDER = ['agenda', 'countdowns', 'tonight', 'chores', 'grocery', 'lists', 'pantry', 'goals', 'familyNight', 'rhythms']
let savedLayout: { order: string[]; hidden: string[] } = { order: [...CANONICAL_ORDER], hidden: [] }

async function mockApi(page: Page) {
  // One row per card, so the geometry test measures real cards rather than the empty
  // states (an empty agenda still renders, but a row is what the reference measured).
  const day = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`
  const at = (h: number, m: number) => `${date}T${pad(h)}:${pad(m)}:00`

  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname
    let body: unknown = {
      balances: [], chores: [], countdowns: [], currencies: [], entries: [], events: [],
      goals: [], groups: [], instances: [], items: [], lists: [], meals: [], members: [],
      people: [], persons: [], photos: [], recipes: [], rewards: [], suggestions: [],
    }

    if (path === '/api/auth/status') body = { initialized: true, methods: ['password'] }
    else if (path === '/api/auth/login') body = { accessToken: 'test-access', refreshToken: 'test-refresh', expiresIn: 900 }
    else if (path === '/api/household') body = { provisioned: true, household, person, memberships: [], pendingInvites: [] }
    else if (path === '/api/persons') body = { persons: [person] }
    else if (path === '/api/permissions') body = { permissions: { adult: permissionRow, teen: permissionRow, kid: permissionRow }, capabilities, roles: ['adult', 'teen', 'kid'] }
    else if (path === '/api/weather') body = { weather: null }
    else if (path === '/api/updates') body = { enabled: false, updateAvailable: false }
    else if (path === '/api/calendar/status') body = { connected: false, configured: false }
    else if (path === '/api/events/today') body = {
      date,
      events: [{
        id: 'e1', title: 'Dentist', startsAt: at(9, 0), endsAt: at(9, 45), allDay: false,
        location: null, personId: person.id, personName: person.name, personColor: person.colorHex,
        personEmoji: person.avatarEmoji, participants: [],
      }],
    }
    else if (path === '/api/chores/today') body = {
      people: [{ id: person.id, name: person.name, avatarEmoji: person.avatarEmoji, colorHex: person.colorHex, memberType: 'adult', isAdmin: true, total: 3, done: 1, stars: 4 }],
      upForGrabs: 0,
    }
    else if (path === '/api/chores/settings') body = { rewards: false, proofTtlDays: 3 }
    else if (path === '/api/countdowns') body = {
      countdowns: [{ id: 'c1', title: 'Trip to the coast', date: '2026-12-01', daysLeft: 21, source: 'manual', emoji: '📆', color: null, personId: null }],
      sleeps: false,
    }
    else if (path === '/api/meals/week' || path === '/api/meals/plan-week') body = {
      entries: [{
        id: 'm1', date, mealType: 'dinner', title: 'Pork chops', recipeId: null, mealId: null, cook: null,
        recipe: { title: 'Pork chops', emoji: '🍽️', category: 'dinner', prepTimeMinutes: 10, cookTimeMinutes: 25, servings: 4, imageUrl: null },
      }],
    }
    else if (path === '/api/powersync/token') {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'disabled' }) })
      return
    }
    else if (path === '/api/today-layout/mobile') {
      // Served the way the real one behaves: a saved layout per scope, and a PUT that comes
      // back reconciled, so a spec can reorder on the phone and watch Today follow.
      if (route.request().method() === 'PUT') {
        const sent = route.request().postDataJSON() as { scope: string; layout: { order: string[]; hidden: string[] } }
        if (sent.scope === 'user') savedLayout = sent.layout
        body = { ok: true, layout: sent.layout }
      } else {
        body = { resolved: savedLayout, family: null, user: savedLayout, source: 'user', cards: [...savedLayout.order], canEditFamily: true }
      }
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
}

async function signIn(page: Page, then: string) {
  await page.goto('/')
  await expect(page.getByText('Welcome back')).toBeVisible()
  await page.locator('input[type="email"]').fill('alex@example.test')
  await page.locator('input[type="password"]').fill('not-a-real-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  // At a phone width the kiosk's rail is hidden behind the ☰ menu, so there is no
  // visible navigation landmark to wait on — go straight to the target and let the
  // planner's own bar (or the assertion of it) prove the session took.
  if (then !== '/') await page.goto(then)
}

test.beforeEach(async ({ page }) => {
  savedLayout = { order: [...CANONICAL_ORDER], hidden: [] }
  await mockApi(page)
})

test('a phone-shaped link lands on the planner, not the kiosk', async ({ page }) => {
  await signIn(page, '/?experience=planner')
  await expect(page).toHaveURL(/\/planner\/today$/)
  // Return visits without the parameter stay on the planner.
  await page.goto('/')
  await expect(page).toHaveURL(/\/planner\/today$/)
})

test('the planner keeps the phone geometry the reference was measured on', async ({ page }) => {
  await signIn(page, '/?experience=planner')
  await expect(page.getByRole('navigation', { name: 'Planner' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/good (morning|afternoon|evening)/i)

  const bar = await page.locator('.planner-tabbar').boundingBox()
  const fab = await page.locator('.planner-fab').boundingBox()
  const pill = await page.locator('.planner-capture').boundingBox()
  const header = await page.locator('.planner-header').boundingBox()
  const cards = await page.locator('.planner-cards').boundingBox()
  const card = page.locator('.p-card').first()
  const cardBox = await card.boundingBox()
  const radius = await card.evaluate((el) => getComputedStyle(el).borderTopLeftRadius)
  const gap = await page.locator('.planner-cards').evaluate((el) => getComputedStyle(el).rowGap)

  expect(bar).not.toBeNull()
  expect(fab).not.toBeNull()
  expect(pill).not.toBeNull()
  expect(header).not.toBeNull()
  expect(cards).not.toBeNull()
  expect(cardBox).not.toBeNull()

  // Print the measured table: the numbers are the evidence, not the green tick.
  const measured = {
    'tab bar height': bar!.height,
    'tab bar bottom': bar!.y + bar!.height,
    'capture button (FAB)': `${fab!.width}x${fab!.height}`,
    'FAB raised above the bar': bar!.y - fab!.y,
    'FAB centred (off-centre px)': Math.abs((fab!.x + fab!.width / 2) - (bar!.width / 2)),
    'capture pill height': pill!.height,
    'page gutter (pill left)': pill!.x,
    'page gutter (first card left)': cardBox!.x,
    'first card width': cardBox!.width,
    'card gap': gap,
    'card radius': radius,
    'first card height': cardBox!.height,
    'header is full-width chrome (x)': header!.x,
    'cards column is full-width (x)': cards!.x,
    viewport: `${page.viewportSize()!.width}x${page.viewportSize()!.height}`,
  }
  console.log('planner geometry @402x874pt:', JSON.stringify(measured, null, 2))

  expect(bar!.height).toBe(64) // iOS barTopPadding 10 + 54
  expect(Math.abs(bar!.y + bar!.height - 874)).toBeLessThanOrEqual(1)
  expect(fab!.width).toBe(54)
  expect(fab!.height).toBe(54)
  expect(Math.abs(bar!.y - fab!.y - 9)).toBeLessThanOrEqual(2) // raised ~9pt
  expect(Math.abs((fab!.x + fab!.width / 2) - bar!.width / 2)).toBeLessThanOrEqual(1)
  expect(pill!.height).toBe(52)
  // The gutter is carried by the pill's margin and the cards column's padding, so the
  // header and the cards column are full-width elements — assert the content, not them.
  expect(Math.round(pill!.x)).toBe(18)
  expect(Math.round(cardBox!.x)).toBe(18)
  expect(gap).toBe('14px')
  expect(radius).toBe('22px')

  await page.screenshot({ path: 'test-results/planner-today-402x874@3x.png' })
})

test('the planner runs on one column, with its own way back to the kiosk', async ({ page }) => {
  await signIn(page, '/?experience=planner')

  // The tab bar is the phone's: Today, Calendar, capture, the module slot, Family.
  const bar = page.getByRole('navigation', { name: 'Planner' })
  await expect(bar.getByRole('link', { name: 'Today' })).toHaveAttribute('aria-current', 'page')
  await expect(bar.getByRole('link', { name: 'Calendar' })).toHaveAttribute('href', '/planner/calendar')
  await expect(bar.getByRole('link', { name: 'Family' })).toHaveAttribute('href', '/planner/family')

  // One column: the cards that make up the column start at the same x and the next starts
  // below the last. The chores + grocery card is the exception the app itself makes — it is
  // a two-up row inside one full-width slot — so the assertion is on the column's own
  // children (the .p-2up row's cards are nested inside it, not siblings).
  const boxes = await page.locator('.planner-cards > .p-card').evaluateAll((els) =>
    els.map((el) => el.getBoundingClientRect()).map((r) => ({ x: Math.round(r.x), bottom: Math.round(r.bottom), top: Math.round(r.top) }))
  )
  expect(boxes.length).toBeGreaterThanOrEqual(2)
  expect(new Set(boxes.map((b) => b.x)).size).toBe(1)
  for (let i = 1; i < boxes.length; i++) expect(boxes[i].top).toBeGreaterThanOrEqual(boxes[i - 1].bottom - 1)

  // Deeper planner screens keep the bar (this is the difference from the kiosk routes).
  await bar.getByRole('link', { name: 'Family' }).click()
  await expect(page).toHaveURL(/\/planner\/family$/)
  await expect(page.getByRole('navigation', { name: 'Planner' })).toBeVisible()

  // And the switch takes the device back to the kiosk shell — it lives with the other
  // device-level things on the Family tab, next to the module tiles. (`exact` because the
  // header avatar is also a link to the family tab: "You and your family".)
  await page.goto('/?experience=planner')
  await page.getByRole('link', { name: 'Family', exact: true }).click()
  await expect(page).toHaveURL(/\/planner\/family$/)
  await page.getByText('Kiosk view').click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator('.planner-tabbar')).toHaveCount(0)
  await page.goto('/')
  await expect(page).toHaveURL(/\/$/)
})

test('the phone reorders Today the way the app does, and the order sticks', async ({ page }) => {
  await signIn(page, '/?experience=planner')

  // Out of the box the cards follow the saved layout: agenda first.
  const column = page.locator('.planner-cards')
  await expect(column.locator('.p-card').first()).toHaveClass(/p-agenda/)

  // The header's slider button is the app's Customize Today.
  await page.getByTestId('planner-customize').click()
  const sheet = page.getByRole('dialog', { name: 'Customize Today' })
  await expect(sheet).toBeVisible()
  // Seven, not the server's ten: the phone has no Pantry or Family Night card (they are
  // deliberately not built), and this household has the Rhythms module off — its default.
  await expect(sheet.locator('.p-cust-row')).toHaveCount(7)

  // Grabber keyboard affordance: move Agenda below Countdowns, then hide Chores.
  await sheet.getByRole('button', { name: 'Reorder Agenda' }).press('ArrowDown')
  await sheet.getByRole('button', { name: 'Reorder Agenda' }).press('ArrowDown')
  await sheet.getByRole('switch', { name: 'Chores' }).click()
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(sheet).toHaveCount(0)

  // The save went to the phone layout, folded into the full card order: the cards the phone
  // draws in their new arrangement, and Pantry / Family Night — which it does not draw —
  // left exactly where the app had them.
  expect(savedLayout.order).toEqual(['countdowns', 'tonight', 'agenda', 'chores', 'grocery', 'lists', 'pantry', 'goals', 'familyNight', 'rhythms'])
  expect(savedLayout.hidden).toEqual(['chores'])

  // And Today renders what was saved.
  await expect(column.locator('.p-card').first()).toContainText('Countdowns')
  await expect(column.locator('.p-small-label', { hasText: 'Chores' })).toHaveCount(0)
})

test('the planner’s capture pill opens the same composer the kiosk uses', async ({ page }) => {
  await signIn(page, '/?experience=planner')
  await page.getByTestId('planner-capture').click()
  const composer = page.locator('.cap-composer')
  await expect(composer).toBeVisible()
  await expect(composer.getByLabel('Add anything')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(composer).toHaveCount(0)
})
