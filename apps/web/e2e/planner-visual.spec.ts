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

async function mockApi(page: Page) {
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
    else if (path === '/api/chores/today') body = { people: [], upForGrabs: 0 }
    else if (path === '/api/chores/settings') body = { rewards: false, proofTtlDays: 3 }
    else if (path === '/api/countdowns') body = { countdowns: [], sleeps: false }
    else if (path === '/api/meals/plan-week') body = { entries: [], weekStart: url.searchParams.get('week') ?? '' }
    else if (path === '/api/powersync/token') {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'disabled' }) })
      return
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
}

async function signIn(page: Page) {
  await page.goto('/')
  await expect(page.getByText('Welcome back')).toBeVisible()
  await page.locator('input[type="email"]').fill('alex@example.test')
  await page.locator('input[type="password"]').fill('not-a-real-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  // Signed in on the kiosk (the default experience) — the planner is reached by the
  // experience parameter or a stored preference, which each test sets up itself.
  await expect(page.getByRole('navigation').first()).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await mockApi(page)
})

test('a phone-shaped link lands on the planner, not the kiosk', async ({ page }) => {
  await signIn(page)
  // ?experience=planner is how an installed PWA (or a shared link) picks the planner.
  await page.goto('/?experience=planner')
  await expect(page).toHaveURL(/\/planner\/today$/)
  // Return visits without the parameter stay on the planner.
  await page.goto('/')
  await expect(page).toHaveURL(/\/planner\/today$/)
})

test('the planner keeps the phone geometry the reference was measured on', async ({ page }) => {
  await signIn(page)
  await page.goto('/?experience=planner')
  await expect(page.getByRole('navigation', { name: 'Planner' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/good (morning|afternoon|evening)/i)

  const bar = await page.locator('.planner-tabbar').boundingBox()
  const fab = await page.locator('.planner-fab').boundingBox()
  const pill = await page.locator('.planner-capture').boundingBox()
  const header = await page.locator('.planner-header').boundingBox()
  const cards = await page.locator('.planner-cards').boundingBox()
  const card = page.locator('.planner-cards > .card').first()
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
    'pill left gutter': pill!.x,
    'header left gutter': header!.x,
    'cards left gutter': cards!.x,
    'card gap': gap,
    'card radius': radius,
    'first card height': cardBox!.height,
    viewport: `${page.viewportSize()!.width}x${page.viewportSize()!.height}`,
  }
  console.log('planner geometry @402x874pt:', JSON.stringify(measured, null, 2))

  expect(bar!.height).toBe(64) // iOS barTopPadding 10 + 54
  expect(Math.abs(bar!.y + bar!.height - 874)).toBeLessThanOrEqual(1)
  expect(fab!.width).toBe(54)
  expect(fab!.height).toBe(54)
  expect(Math.abs(bar!.y - fab!.y - 9)).toBeLessThanOrEqual(2) // raised ~9pt
  expect(Math.abs((fab!.x + fab!.width / 2) - bar!.width / 2)).toBeLessThanOrEqual(1)
  expect(pill!.height).toBe(50)
  expect(Math.round(pill!.x)).toBe(18)
  expect(Math.round(header!.x)).toBe(18)
  expect(Math.round(cards!.x)).toBe(18)
  expect(gap).toBe('14px')
  expect(radius).toBe('22px')

  await page.screenshot({ path: 'test-results/planner-today-402x874@3x.png' })
})

test('the planner runs on one column, with its own way back to the kiosk', async ({ page }) => {
  await signIn(page)
  await page.goto('/?experience=planner')

  // The tab bar is the phone's: Today, Calendar, capture, the module slot, Family.
  const bar = page.getByRole('navigation', { name: 'Planner' })
  await expect(bar.getByRole('link', { name: 'Today' })).toHaveAttribute('aria-current', 'page')
  await expect(bar.getByRole('link', { name: 'Calendar' })).toHaveAttribute('href', '/planner/calendar')
  await expect(bar.getByRole('link', { name: 'Family' })).toHaveAttribute('href', '/planner/family')

  // One column: every card starts at the same x and the next one starts below the last.
  const boxes = await page.locator('.planner-cards > .card').evaluateAll((els) =>
    els.map((el) => el.getBoundingClientRect()).map((r) => ({ x: Math.round(r.x), bottom: Math.round(r.bottom), top: Math.round(r.top) }))
  )
  expect(boxes.length).toBeGreaterThanOrEqual(2)
  expect(new Set(boxes.map((b) => b.x)).size).toBe(1)
  for (let i = 1; i < boxes.length; i++) expect(boxes[i].top).toBeGreaterThanOrEqual(boxes[i - 1].bottom - 1)

  // Deeper planner screens keep the bar (this is the difference from the kiosk routes).
  await bar.getByRole('link', { name: 'Family' }).click()
  await expect(page).toHaveURL(/\/planner\/family$/)
  await expect(page.getByRole('navigation', { name: 'Planner' })).toBeVisible()

  // And the switch takes the device back to the kiosk shell.
  await page.goto('/?experience=planner')
  await page.getByRole('button', { name: 'Switch to the kiosk view' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator('.planner-tabbar')).toHaveCount(0)
  await page.goto('/')
  await expect(page).toHaveURL(/\/$/)
})

test('the planner’s capture pill opens the same composer the kiosk uses', async ({ page }) => {
  await signIn(page)
  await page.goto('/?experience=planner')
  await page.getByTestId('planner-capture').click()
  const composer = page.locator('.cap-composer')
  await expect(composer).toBeVisible()
  await expect(composer.getByLabel('Add anything')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(composer).toHaveCount(0)
})
