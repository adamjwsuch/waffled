// Display panel PIN sessions + ticking (second half of the display card — the
// first half, GET /api/display/feed, has its own file). The load-bearing
// assertions: a wrong PIN 401s and a right one mints a short-lived, person-bound
// token; that token's claims — not a client-supplied personId — drive who a tick
// is attributed to; a tick goes through the SAME chores.service path the phone
// uses (stars, idempotency, undo all come free from that reuse); and the session
// expires on its own (no revocation list needed for a token this short-lived).
import { createHash, randomBytes } from 'node:crypto'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from './helpers/pg'
import { runMigrations } from '../src/migrate'

let pg: StartedPostgreSqlContainer
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let app: any
let closePool: () => Promise<void>
let query: <T extends Record<string, unknown>>(text: string, params?: unknown[]) => Promise<{ rows: T[] }>

interface RunResult { statusCode: number; body: string }
function call(method: string, path: string, token?: string, body?: unknown) {
  const headers: Record<string, string> = {}
  if (token) headers.authorization = `Bearer ${token}`
  if (body !== undefined) headers['content-type'] = 'application/json'
  return app.run(
    { httpMethod: method, path, headers, queryStringParameters: {}, body: body !== undefined ? JSON.stringify(body) : null, isBase64Encoded: false },
    {}
  ) as Promise<RunResult>
}
const json = (r: RunResult) => JSON.parse(r.body)
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function mintDeviceToken(householdId: string, label = 'Kitchen'): Promise<string> {
  const token = 'waffled_display_' + randomBytes(32).toString('base64url')
  await query(`insert into display_devices (household_id, label, token_hash) values ($1, $2, $3)`, [householdId, label, sha256(token)])
  return token
}

beforeAll(async () => {
  pg = await new PostgreSqlContainer('postgres:16').start()
  const url = pg.getConnectionUri()
  await runMigrations(url)
  process.env.DATABASE_URL = url
  delete process.env.AUTH0_DOMAIN
  // Fast, deterministic rate limiting + expiry for the throttle/expiry tests below.
  process.env.RATE_LIMIT_DISPLAY_SESSION_MAX = '3'
  process.env.DISPLAY_SESSION_TTL_MIN = '0.02' // ~1.2s
  app = (await import('../src/app')).default
  closePool = (await import('../src/platform/db')).closePool
  query = (await import('../src/platform/db')).query
}, 120_000)
afterAll(async () => {
  await closePool?.()
  await pg?.stop()
})

describe('display panel sessions + ticking', () => {
  let admin = ''
  let householdId = ''
  let kidId = ''
  let kid2Id = ''
  let deviceToken = ''
  let choreInstanceId = ''

  it('sets up a household, two kid profiles with PINs, and a chore', async () => {
    const setup = json(await call('POST', '/api/auth/setup', undefined, {
      household: { name: 'Sites', timezone: 'America/Chicago' },
      admin: { name: 'Kevin', email: 'kevin-sessions@example.com', password: 'ownerpass1' },
    }))
    admin = setup.accessToken
    householdId = setup.household.id
    kidId = json(await call('POST', '/api/persons', admin, { name: 'Wally', memberType: 'kid' })).person.id
    kid2Id = json(await call('POST', '/api/persons', admin, { name: 'Nora', memberType: 'kid' })).person.id
    expect((await call('PUT', `/api/persons/${kidId}/pin`, admin, { pin: '4242' })).statusCode).toBe(200)
    expect((await call('PUT', `/api/persons/${kid2Id}/pin`, admin, { pin: '1357' })).statusCode).toBe(200)

    const add = await call('POST', '/api/chores', admin, { title: 'Dishes', personId: kidId, rewardAmount: 2 })
    expect(add.statusCode).toBe(201)
    deviceToken = await mintDeviceToken(householdId)
    const feed = json(await call('GET', '/api/display/feed', deviceToken))
    choreInstanceId = feed.people.find((p: { id: string }) => p.id === kidId).chores[0].instanceId
  })

  // ── sessions ───────────────────────────────────────────────────────────────────
  it('requires a device token to even attempt a PIN', async () => {
    expect((await call('POST', '/api/display/sessions', undefined, { pin: '4242' })).statusCode).toBe(401)
  })

  it('rejects a wrong PIN with 401, and a correct one mints a person-bound token', async () => {
    const wrong = await call('POST', '/api/display/sessions', deviceToken, { pin: '0000' })
    expect(wrong.statusCode).toBe(401)

    const ok = await call('POST', '/api/display/sessions', deviceToken, { pin: '4242' })
    expect(ok.statusCode).toBe(201)
    const body = json(ok)
    expect(typeof body.accessToken).toBe('string')
    expect(body.person).toMatchObject({ id: kidId, name: 'Wally' })
    // Short-lived: minutes, not the hour-long default access token TTL.
    expect(body.expiresIn).toBeLessThan(60)
  })

  it('throttles repeated wrong attempts per device (RATE_LIMIT_DISPLAY_SESSION_MAX=3)', async () => {
    const freshDevice = await mintDeviceToken(householdId, 'Throttle Test')
    expect((await call('POST', '/api/display/sessions', freshDevice, { pin: '0000' })).statusCode).toBe(401)
    expect((await call('POST', '/api/display/sessions', freshDevice, { pin: '0000' })).statusCode).toBe(401)
    expect((await call('POST', '/api/display/sessions', freshDevice, { pin: '0000' })).statusCode).toBe(401)
    // 4th attempt within the window is rate-limited, not just wrong — even with the
    // RIGHT pin, because the limiter runs before the PIN is ever checked.
    const limited = await call('POST', '/api/display/sessions', freshDevice, { pin: '4242' })
    expect(limited.statusCode).toBe(429)
    // A DIFFERENT device's budget is untouched by the first device's attempts.
    expect((await call('POST', '/api/display/sessions', deviceToken, { pin: '4242' })).statusCode).toBe(201)
  })

  // ── ticking ──────────────────────────────────────────────────────────────────
  it("rejects a tick with no session (a device token alone isn't enough)", async () => {
    expect((await call('POST', `/api/display/chores/${choreInstanceId}/tick`, deviceToken)).statusCode).toBe(401)
  })

  it('ticks a chore and attributes it to the PIN-session person, matching the phone UI', async () => {
    const session = json(await call('POST', '/api/display/sessions', deviceToken, { pin: '4242' })).accessToken
    const tick = await call('POST', `/api/display/chores/${choreInstanceId}/tick`, session)
    expect(tick.statusCode).toBe(200)
    const body = json(tick)
    expect(body.instance).toMatchObject({ id: choreInstanceId, status: 'done' })
    expect(body.doneBy).toMatchObject({ id: kidId, name: 'Wally' })

    // The phone's own read of the same instance (via the feed) agrees.
    const feed = json(await call('GET', '/api/display/feed', deviceToken))
    const row = feed.people.find((p: { id: string }) => p.id === kidId).chores.find((c: { instanceId: string }) => c.instanceId === choreInstanceId)
    expect(row).toMatchObject({ status: 'done', doneBy: { id: kidId, name: 'Wally' } })

    // Stars were awarded through the real completion path, same as a phone tick —
    // GET /api/chores/today is the phone's own read of exactly this ledger.
    const summary = json(await call('GET', '/api/chores/today', admin))
    const wally = summary.people.find((p: { id: string }) => p.id === kidId)
    expect(wally.stars).toBeGreaterThanOrEqual(2)
    expect(wally.done).toBeGreaterThanOrEqual(1)
  })

  it('is idempotent: ticking an already-done instance again does not double-award', async () => {
    const before = json(await call('GET', '/api/chores/today', admin)).people.find((p: { id: string }) => p.id === kidId)
    const session = json(await call('POST', '/api/display/sessions', deviceToken, { pin: '4242' })).accessToken
    const again = await call('POST', `/api/display/chores/${choreInstanceId}/tick`, session)
    expect(again.statusCode).toBe(200)
    expect(json(again).instance.status).toBe('done')
    const after = json(await call('GET', '/api/chores/today', admin)).people.find((p: { id: string }) => p.id === kidId)
    expect(after.stars).toBe(before.stars) // no change — the second tick was a no-op
  })

  it('undoes a tick: the instance reverts to pending and the star award reverses', async () => {
    const before = json(await call('GET', '/api/chores/today', admin)).people.find((p: { id: string }) => p.id === kidId)
    const session = json(await call('POST', '/api/display/sessions', deviceToken, { pin: '4242' })).accessToken
    const undo = await call('POST', `/api/display/chores/${choreInstanceId}/undo`, session)
    expect(undo.statusCode).toBe(200)
    expect(json(undo).instance).toMatchObject({ id: choreInstanceId, status: 'pending' })

    const feed = json(await call('GET', '/api/display/feed', deviceToken))
    const row = feed.people.find((p: { id: string }) => p.id === kidId).chores.find((c: { instanceId: string }) => c.instanceId === choreInstanceId)
    expect(row).toMatchObject({ status: 'pending', doneBy: null })

    const after = json(await call('GET', '/api/chores/today', admin)).people.find((p: { id: string }) => p.id === kidId)
    expect(after.stars).toBe(before.stars - 2) // the +2 award was reversed

    // A second undo is a safe no-op (idempotent the other direction too).
    const again = await call('POST', `/api/display/chores/${choreInstanceId}/undo`, session)
    expect(again.statusCode).toBe(200)
    const stillAfter = json(await call('GET', '/api/chores/today', admin)).people.find((p: { id: string }) => p.id === kidId)
    expect(stillAfter.stars).toBe(after.stars)
  })

  it('attributes a tick to WHICHEVER person the PIN belongs to, not whoever ticked last', async () => {
    const add = await call('POST', '/api/chores', admin, { title: 'Sweep', personId: kid2Id })
    expect(add.statusCode).toBe(201)
    const feed = json(await call('GET', '/api/display/feed', deviceToken))
    const sweepId = feed.people.find((p: { id: string }) => p.id === kid2Id).chores.find((c: { title: string }) => c.title === 'Sweep').instanceId

    const noraSession = json(await call('POST', '/api/display/sessions', deviceToken, { pin: '1357' })).accessToken
    const tick = await call('POST', `/api/display/chores/${sweepId}/tick`, noraSession)
    expect(tick.statusCode).toBe(200)
    expect(json(tick).doneBy).toMatchObject({ id: kid2Id, name: 'Nora' })

    // Wally's own session can't retroactively relabel it — ticking it again (already
    // done) stays attributed to Nora.
    const wallySession = json(await call('POST', '/api/display/sessions', deviceToken, { pin: '4242' })).accessToken
    const again = await call('POST', `/api/display/chores/${sweepId}/tick`, wallySession)
    expect(json(again).doneBy).toMatchObject({ id: kid2Id, name: 'Nora' })
  })

  it('rejects an expired session token (DISPLAY_SESSION_TTL_MIN ~1.2s)', async () => {
    const session = json(await call('POST', '/api/display/sessions', deviceToken, { pin: '4242' })).accessToken
    await sleep(1500)
    const tick = await call('POST', `/api/display/chores/${choreInstanceId}/tick`, session)
    expect(tick.statusCode).toBe(401)
  })

  it("404s ticking another household's instance even with a valid session", async () => {
    // A second household on the same admin account, with its own chore+instance.
    const other = json(await call('POST', '/api/households', admin, { name: 'Other House', timezone: 'UTC', person: { name: 'Milo' } }))
    const switched = json(await call('POST', '/api/auth/switch', admin, { householdId: other.household.id })).accessToken
    const otherKid = json(await call('POST', '/api/persons', switched, { name: 'Remy', memberType: 'kid' })).person.id
    await call('PUT', `/api/persons/${otherKid}/pin`, switched, { pin: '9999' })
    await call('POST', '/api/chores', switched, { title: 'Other Chore', personId: otherKid })
    const otherDevice = await mintDeviceToken(other.household.id, 'Other Kitchen')
    const otherFeed = json(await call('GET', '/api/display/feed', otherDevice))
    const otherInstanceId = otherFeed.people[0].chores[0].instanceId

    // Sites' own session can't touch it — completeInstance scopes by the
    // session's household, same guarantee the feed test suite already proves.
    const sitesSession = json(await call('POST', '/api/display/sessions', deviceToken, { pin: '4242' })).accessToken
    const tick = await call('POST', `/api/display/chores/${otherInstanceId}/tick`, sitesSession)
    expect(tick.statusCode).toBe(404)
  })
})
