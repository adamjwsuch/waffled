// ESP32-P4 kitchen panel — read-only feed (Option A, first half). The panel holds
// only a revocable DEVICE token (apps/api/scripts/mint-display-token.ts mints one
// out-of-band; revocation is deleting its display_devices row — see the migration).
// Unlike kiosk_devices, there is no secret-for-JWT exchange: the raw token IS the
// bearer credential, hashed at rest, checked directly on each request. That means
// this path can't go through the global Bearer/x-api-key gate in app.ts (which only
// understands JWTs and API keys) — it's listed in PUBLIC_PATHS there and authenticates
// itself, the same way kiosk's pre-session routes do.
//
// Ticking (POST /api/display/chores/:id/tick, under a short-lived per-person PIN
// session) is the next card — this one is GET /api/display/feed only.
import { createHash } from 'node:crypto'
import createAPI, { type Request } from 'lambda-api'
import { query } from '../../platform/db'
import { AuthError } from '../../platform/auth'
import { householdTz, todayDate, ensureTodayInstances, listTodayInstances } from '../chores/chores.service'
import type { TodayInstance } from '../chores/chores.types'

type Api = ReturnType<typeof createAPI>

// Same one-way hash as kiosk device secrets / API keys — sha256 of the opaque token.
function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}

export interface DisplayDevicePrincipal {
  deviceId: string
  householdId: string
}

// lambda-api parses the Authorization header into req.auth regardless of the global
// gate (that gate just decides whether to run requireAuth first) — read it directly.
function bearerToken(req: Request): string | null {
  if (req.auth?.type === 'Bearer' && req.auth.value) return req.auth.value
  return null
}

// Resolves a presented device token to its household, or throws AuthError(401).
// Touches last_seen_at, throttled to once a minute (same pattern as API keys) so a
// device polling every few seconds doesn't write on every request.
export async function requireDisplayDevice(req: Request): Promise<DisplayDevicePrincipal> {
  const token = bearerToken(req)
  if (!token) throw new AuthError('Device token required')
  const { rows } = await query<{ id: string; household_id: string }>(
    `select id, household_id from display_devices where token_hash = $1`,
    [sha256(token)]
  )
  const d = rows[0]
  if (!d) throw new AuthError('Invalid device token')
  await query(
    `update display_devices set last_seen_at = now()
      where id = $1 and (last_seen_at is null or last_seen_at < now() - interval '1 minute')`,
    [d.id]
  )
  return { deviceId: d.id, householdId: d.household_id }
}

interface FeedPerson {
  id: string
  name: string
  chores: Array<{
    instanceId: string
    title: string
    dueOn: string | null
    status: 'pending' | 'done'
    doneBy: { id: string; name: string } | null
  }>
}

// Groups today's attributed instances per person. Up-for-grabs instances (no
// assignee) have nobody to attribute a tick to, so the panel — which exists to show
// per-person chores — doesn't carry them; that stays today's-instances-only via
// listTodayInstances, same gating (settings.chores.hideFutureDated) as the phone/web.
function presentFeed(instances: TodayInstance[]): FeedPerson[] {
  const byPerson = new Map<string, FeedPerson>()
  for (const i of instances) {
    if (!i.personId || !i.personName) continue
    let person = byPerson.get(i.personId)
    if (!person) {
      person = { id: i.personId, name: i.personName, chores: [] }
      byPerson.set(i.personId, person)
    }
    person.chores.push({
      instanceId: i.id,
      title: i.choreTitle,
      dueOn: i.dueOn ?? null,
      // awaiting-approval instances read as pending on the panel — there is nothing
      // for a finger to tick until a parent approves it elsewhere.
      status: i.status === 'done' ? 'done' : 'pending',
      doneBy: i.completedBy,
    })
  }
  return [...byPerson.values()]
}

export function registerDisplayRoutes(api: Api): void {
  api.get('/api/display/feed', async (req: Request) => {
    const { householdId } = await requireDisplayDevice(req)
    const tz = await householdTz(householdId)
    const date = todayDate(tz)
    await ensureTodayInstances(householdId, date)
    const instances = await listTodayInstances(householdId, date, tz, { streaks: false })
    return { generatedAt: new Date().toISOString(), people: presentFeed(instances) }
  })
}
