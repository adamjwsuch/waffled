// ESP32-P4 kitchen panel feed (M... display card, read-only half). The panel holds
// only a revocable device token (minted by scripts/mint-display-token.ts — there is
// no HTTP mint endpoint, so the test mints one the same way: insert a
// display_devices row with the sha256 of a random token). The load-bearing
// assertions: no token and a wrong token both 401, a valid token returns today's
// instances grouped per person honouring hideFutureDated, and a household with
// nothing due today gets an empty list rather than an error.
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

// Mints a device token the same way scripts/mint-display-token.ts does, without
// shelling out to the CLI: insert the row, hand back the raw (unhashed) token.
async function mintDeviceToken(householdId: string, label = 'Kitchen'): Promise<string> {
  const token = 'waffled_display_' + randomBytes(32).toString('base64url')
  await query(
    `insert into display_devices (household_id, label, token_hash) values ($1, $2, $3)`,
    [householdId, label, sha256(token)]
  )
  return token
}

beforeAll(async () => {
  pg = await new PostgreSqlContainer('postgres:16').start()
  const url = pg.getConnectionUri()
  await runMigrations(url)
  process.env.DATABASE_URL = url
  delete process.env.AUTH0_DOMAIN
  app = (await import('../src/app')).default
  closePool = (await import('../src/platform/db')).closePool
  query = (await import('../src/platform/db')).query
}, 120_000)
afterAll(async () => {
  await closePool?.()
  await pg?.stop()
})

describe('display panel feed', () => {
  let admin = ''
  let householdId = ''
  let kidId = ''

  it('sets up a household and a kid profile', async () => {
    const setup = json(await call('POST', '/api/auth/setup', undefined, {
      household: { name: 'Sites', timezone: 'America/Chicago' },
      admin: { name: 'Kevin', email: 'kevin@example.com', password: 'ownerpass1' },
    }))
    admin = setup.accessToken
    householdId = setup.household.id
    kidId = json(await call('POST', '/api/persons', admin, { name: 'Wally', memberType: 'kid' })).person.id
  })

  it('rejects a request with no token', async () => {
    const r = await call('GET', '/api/display/feed')
    expect(r.statusCode).toBe(401)
  })

  it('rejects a request with an unknown/wrong token', async () => {
    const r = await call('GET', '/api/display/feed', 'not-a-real-token')
    expect(r.statusCode).toBe(401)
  })

  it('returns an empty list, not an error, for a household with nothing due today', async () => {
    const token = await mintDeviceToken(householdId)
    const r = await call('GET', '/api/display/feed', token)
    expect(r.statusCode).toBe(200)
    const body = json(r)
    expect(typeof body.generatedAt).toBe('string')
    expect(body.people).toEqual([])
    expect(body.upForGrabs).toEqual({ chores: [] })
  })

  it("returns today's instances grouped per person for a valid device token", async () => {
    const token = await mintDeviceToken(householdId)
    const add = await call('POST', '/api/chores', admin, { title: 'Dishes', personId: kidId, rewardAmount: 2 })
    expect(add.statusCode).toBe(201)

    const r = await call('GET', '/api/display/feed', token)
    expect(r.statusCode).toBe(200)
    const body = json(r)
    expect(body.people).toHaveLength(1)
    const wally = body.people[0]
    expect(wally).toMatchObject({ id: kidId, name: 'Wally' })
    expect(wally.chores).toHaveLength(1)
    expect(wally.chores[0]).toMatchObject({ title: 'Dishes', status: 'pending', doneBy: null })
    expect(typeof wally.chores[0].instanceId).toBe('string')
  })

  it('plumbs a person\'s colour/avatar through as colorHex/avatarEmoji', async () => {
    const token = await mintDeviceToken(householdId)
    const noraId = json(await call('POST', '/api/persons', admin, {
      name: 'Nora', memberType: 'kid', colorHex: '#2F7FED', avatarEmoji: '🧑🏻',
    })).person.id
    const add = await call('POST', '/api/chores', admin, { title: 'Walk the dog', personId: noraId })
    expect(add.statusCode).toBe(201)

    const body = json(await call('GET', '/api/display/feed', token))
    const nora = body.people.find((p: { id: string }) => p.id === noraId)
    expect(nora).toMatchObject({ colorHex: '#2F7FED', avatarEmoji: '🧑🏻' })
    // Wally never set either — both read null, not absent/undefined.
    const wally = body.people.find((p: { id: string }) => p.id === kidId)
    expect(wally).toMatchObject({ colorHex: null, avatarEmoji: null })
  })

  it('carries an unassigned ("up for grabs") chore in its own bucket, separate from people[]', async () => {
    // Unassigned chores used to be dropped — "nobody to attribute a tick to" — but
    // the tick route now claims an up-for-grabs instance to the PIN'd session
    // person before completing it, so attribution resolves to a person at tick
    // time rather than needing to be known up front. They're carried, not hidden.
    const grab = await call('POST', '/api/chores', admin, { title: 'Anyone can sweep', personId: null })
    expect(grab.statusCode).toBe(201)

    const token = await mintDeviceToken(householdId)
    const before = json(await call('GET', '/api/display/feed', token))
    const sweep = before.upForGrabs.chores.find((c: { title: string }) => c.title === 'Anyone can sweep')
    expect(sweep).toMatchObject({ status: 'pending', doneBy: null })
    expect(typeof sweep.instanceId).toBe('string')
    // Not duplicated into any person's own chores.
    expect(
      before.people.some((p: { chores: Array<{ title: string }> }) =>
        p.chores.some((c) => c.title === 'Anyone can sweep'))
    ).toBe(false)

    const instanceId = before.people.find((p: { id: string }) => p.id === kidId).chores
      .find((c: { title: string }) => c.title === 'Dishes').instanceId

    const done = await call('POST', `/api/chore-instances/${instanceId}/complete`, admin, {})
    expect(done.statusCode).toBe(200)

    const after = json(await call('GET', '/api/display/feed', token))
    const wally = after.people.find((p: { id: string }) => p.id === kidId)
    const dishes = wally.chores.find((c: { title: string }) => c.title === 'Dishes')
    expect(dishes.status).toBe('done')
    expect(dishes.doneBy).toMatchObject({ name: 'Kevin' }) // the admin completed it, not Wally
    // The sweep is untouched — still up for grabs, still pending.
    expect(after.upForGrabs.chores.find((c: { title: string }) => c.title === 'Anyone can sweep')).toMatchObject({
      status: 'pending',
      doneBy: null,
    })
  })

  it('hideFutureDated gates an unassigned future-dated one-off the same as an assigned one', async () => {
    const future = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10)
    expect((await call('PUT', '/api/chores/settings', admin, { hideFutureDated: true })).statusCode).toBe(200)
    const grab = await call('POST', '/api/chores', admin, { title: 'Future sweep', personId: null, dueOn: future })
    expect(grab.statusCode).toBe(201)

    const token = await mintDeviceToken(householdId)
    const hidden = json(await call('GET', '/api/display/feed', token))
    expect(hidden.upForGrabs.chores.some((c: { title: string }) => c.title === 'Future sweep')).toBe(false)

    expect((await call('PUT', '/api/chores/settings', admin, { hideFutureDated: false })).statusCode).toBe(200)
    const shown = json(await call('GET', '/api/display/feed', token))
    expect(shown.upForGrabs.chores.some((c: { title: string }) => c.title === 'Future sweep')).toBe(true)

    // Restore the default for any later test relying on it.
    await call('PUT', '/api/chores/settings', admin, { hideFutureDated: true })
  })

  it('still 401s a revoked (deleted) device token', async () => {
    const token = await mintDeviceToken(householdId)
    const ok = await call('GET', '/api/display/feed', token)
    expect(ok.statusCode).toBe(200)
    await query(`delete from display_devices where token_hash = $1`, [sha256(token)])
    const revoked = await call('GET', '/api/display/feed', token)
    expect(revoked.statusCode).toBe(401)
  })

  it("rejects another household's device token reading nothing of this one — tokens are tenant-scoped", async () => {
    // /api/auth/setup is the one-time first-run wizard; a second household comes
    // from the admin-gated POST /api/households instead (same admin, new tenant).
    const other = json(await call('POST', '/api/households', admin, {
      name: 'Other House',
      timezone: 'UTC',
      person: { name: 'Nora' },
    }))
    const otherToken = await mintDeviceToken(other.household.id)
    const r = json(await call('GET', '/api/display/feed', otherToken))
    expect(r.people).toEqual([]) // Other House has its own (empty) today, not Sites'
    expect(r.upForGrabs).toEqual({ chores: [] })
  })
})
