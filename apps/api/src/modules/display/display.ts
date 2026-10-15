// ESP32-P4 kitchen panel — read-only feed (Option A, first half) plus the
// person-attributed tick (second half). The panel holds only a revocable DEVICE
// token (apps/api/scripts/mint-display-token.ts mints one out-of-band; revocation
// is deleting its display_devices row — see the migration). Unlike kiosk_devices,
// there is no secret-for-JWT exchange: the raw token IS the bearer credential,
// hashed at rest, checked directly on each request. That means the feed and the
// session-mint route can't go through the global Bearer/x-api-key gate in app.ts
// (which only understands JWTs and API keys) — they're listed in PUBLIC_PATHS
// there and authenticate themselves, the same way kiosk's pre-session routes do.
//
// Ticking a chore needs to know WHO tapped it, and the panel has no per-person
// login — so POST /api/display/sessions spends the device token + a person's PIN
// (the SAME pin_hash kiosk mode already uses; no second credential store) for a
// short-lived, person-bound JWT. That JWT IS a normal signed access token (minted
// by mintAccess, just like a password/kiosk login), so it's NOT in PUBLIC_PATHS —
// the gate below verifies it exactly like any other Bearer token, and
// requireDisplaySession() below just reads its extra claims the way kiosk's
// requireDevice() does for device tokens.
import { randomUUID, createHash } from 'node:crypto'
import createAPI, { type Request, type Response } from 'lambda-api'
import { query } from '../../platform/db'
import { AuthError } from '../../platform/auth'
import { mintAccess, verifyPassword } from '../auth/auth'
import type { Tenant } from '../households/households'
import {
  householdTz,
  todayDate,
  ensureTodayInstances,
  listTodayInstances,
  claimInstance,
  completeInstance,
  uncompleteInstance,
  presentInstance,
  ProofRequiredError,
} from '../chores/chores.service'
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

// 4–8 digit PIN, same shape kiosk.ts validates when a person sets one (there is
// only one PIN per person, shared by both surfaces).
const PIN_RE = /^\d{4,8}$/
// Minutes, not hours — this token exists only to authorize the next tap or two on
// a shared wall panel, not to carry a session around. Long enough that ticking a
// few chores back-to-back doesn't re-prompt for the PIN; short enough that a panel
// left unattended goes back to asking for it quickly. Read live (not a frozen
// module constant) so the expiry test can shrink it for one session without
// starving every other session minted earlier in the same process.
function sessionTtlSeconds(): number {
  return (Number(process.env.DISPLAY_SESSION_TTL_MIN) || 10) * 60
}

export interface DisplaySessionPrincipal {
  householdId: string
  personId: string
  personName: string
  isAdmin: boolean
  memberType: string
}

// A session-token guard, the display-tick analogue of kiosk's requireDevice(): only
// tokens minted by POST /api/display/sessions carry kind:'display_session'. The JWT
// itself is already verified (signature + expiry) by the global gate before this
// route runs — expiry is exp, not a DB row, so there is nothing else to check here.
function requireDisplaySession(req: Request): DisplaySessionPrincipal {
  const claims = req.principal?.claims
  if (claims?.kind !== 'display_session') throw new AuthError('Display session token required', 403)
  return {
    householdId: String(claims.household_id),
    personId: String(claims.person_id),
    personName: String(claims.person_name ?? ''),
    isAdmin: claims.is_admin === true,
    memberType: String(claims.member_type ?? 'kid'),
  }
}

// Builds the minimal Tenant completeInstance/uncompleteInstance need. Those two
// functions don't gate on isAdmin/memberType (the phone's own /complete and
// /uncomplete routes let any household member tick), but the fields are carried
// through anyway since Tenant requires them and a future capability check should
// see something real, not a placeholder.
function sessionTenant(session: DisplaySessionPrincipal): Tenant {
  return {
    sub: `display-session:${session.personId}`,
    personId: session.personId,
    householdId: session.householdId,
    isAdmin: session.isAdmin,
    memberType: session.memberType,
  }
}

interface FeedChore {
  instanceId: string
  title: string
  dueOn: string | null
  status: 'pending' | 'done'
  doneBy: { id: string; name: string } | null
}

interface FeedPerson {
  id: string
  name: string
  // Household colour/avatar for the restyled panel (apps/api/CLAUDE.md:
  // display.ts is the display module's own home) — person-level, not per-chore.
  // May be null: a person who never set one.
  colorHex: string | null
  avatarEmoji: string | null
  chores: FeedChore[]
}

interface Feed {
  people: FeedPerson[]
  upForGrabs: { chores: FeedChore[] }
}

function presentChore(i: TodayInstance): FeedChore {
  return {
    instanceId: i.id,
    title: i.choreTitle,
    dueOn: i.dueOn ?? null,
    // awaiting-approval instances read as pending on the panel — there is nothing
    // for a finger to tick until a parent approves it elsewhere.
    status: i.status === 'done' ? 'done' : 'pending',
    doneBy: i.completedBy,
  }
}

// Groups today's instances per person, plus a separate up-for-grabs bucket for the
// unassigned ones. Unassigned instances used to be dropped here — "nobody to
// attribute a tick to" — but POST /api/display/chores/:id/tick now claims an
// up-for-grabs instance to the PIN'd session person before completing it (see the
// tick route below), so attribution is solved by claiming, not by hiding the row.
// upForGrabs is a SIBLING of people, not a fake person inside it, so a panel still
// running the pre-upForGrabs firmware keeps parsing people[] unchanged.
function presentFeed(instances: TodayInstance[]): Feed {
  const byPerson = new Map<string, FeedPerson>()
  const upForGrabs: FeedChore[] = []
  for (const i of instances) {
    if (!i.personId || !i.personName) {
      upForGrabs.push(presentChore(i))
      continue
    }
    let person = byPerson.get(i.personId)
    if (!person) {
      person = {
        id: i.personId,
        name: i.personName,
        colorHex: i.personColor ?? null,
        avatarEmoji: i.personAvatar ?? null,
        chores: [],
      }
      byPerson.set(i.personId, person)
    }
    person.chores.push(presentChore(i))
  }
  return { people: [...byPerson.values()], upForGrabs: { chores: upForGrabs } }
}

// Who completed an instance, by id — presentInstance() only carries the id
// (personId of who it's FOR, not who ticked it), and the tick/undo responses need
// the name for the panel to show attribution immediately without a second feed poll.
async function completedByName(id: string | null): Promise<{ id: string; name: string } | null> {
  if (!id) return null
  const { rows } = await query<{ id: string; name: string }>(`select id, name from persons where id = $1`, [id])
  return rows[0] ?? null
}

// Lightweight pre-check for the claim-on-tick decision below: is this instance
// unassigned right now? Scoped by household so a cross-tenant id reads as absent,
// same as every other display route.
async function instancePersonId(householdId: string, id: string): Promise<string | null | undefined> {
  const { rows } = await query<{ person_id: string | null }>(
    `select person_id from chore_instances where household_id = $1 and id = $2 and deleted_at is null`,
    [householdId, id]
  )
  return rows[0] ? rows[0].person_id : undefined // undefined: no such row
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function registerDisplayRoutes(api: Api): void {
  api.get('/api/display/feed', async (req: Request) => {
    const { householdId } = await requireDisplayDevice(req)
    const tz = await householdTz(householdId)
    const date = todayDate(tz)
    await ensureTodayInstances(householdId, date)
    const instances = await listTodayInstances(householdId, date, tz, { streaks: false })
    const feed = presentFeed(instances)
    return { generatedAt: new Date().toISOString(), people: feed.people, upForGrabs: feed.upForGrabs }
  })

  // Device-authed, public (see PUBLIC_PATHS): spend the device token + a person's
  // PIN for a short-lived person-bound session JWT. Brute-force defense is at the
  // HTTP layer (platform/rate-limit.ts, 8 attempts / 15 min per device token) rather
  // than per-person lockout columns, because the caller hasn't named a person yet —
  // the PIN alone selects who they are, same as the panel having no profile picker.
  api.post('/api/display/sessions', async (req: Request, res: Response) => {
    const { householdId } = await requireDisplayDevice(req)
    const pin = ((req.body ?? {}) as { pin?: string }).pin ?? ''
    if (!PIN_RE.test(pin)) return res.status(401).json({ error: 'Unauthorized', message: 'Incorrect PIN.' })
    const { rows } = await query<{ id: string; name: string; pin_hash: string; is_admin: boolean; member_type: string }>(
      `select id, name, pin_hash, is_admin, member_type from persons
        where household_id = $1 and deleted_at is null and pin_hash is not null`,
      [householdId]
    )
    const person = rows.find((r) => verifyPassword(pin, r.pin_hash))
    if (!person) return res.status(401).json({ error: 'Unauthorized', message: 'Incorrect PIN.' })
    const access = mintAccess(
      `display-session:${randomUUID()}`,
      {
        kind: 'display_session',
        household_id: householdId,
        person_id: person.id,
        person_name: person.name,
        is_admin: person.is_admin,
        member_type: person.member_type,
      },
      sessionTtlSeconds()
    )
    return res.status(201).json({
      accessToken: access.token,
      expiresIn: access.expiresIn,
      person: { id: person.id, name: person.name },
    })
  })

  // Session-authed (a normal Bearer JWT — goes through the global gate like any
  // other route). Reuses the exact chores.service path the phone/web use so stars,
  // history and the phone UI see the same thing a panel tick produces. Idempotent:
  // completeInstance no-ops (returns the existing row) on an already done/awaiting
  // instance rather than double-awarding.
  //
  // Up-for-grabs (person_id null) instances are claimed to the PIN'd session
  // person FIRST, via the same claimInstance() the phone's own claim route uses —
  // that's what lets awardStars (which reads inst.person_id) credit the right
  // person, and lets the response/feed read "done by <them>" with no second poll.
  // An already-assigned instance skips the claim entirely: completeInstance alone,
  // unchanged from before this feature.
  api.post('/api/display/chores/:instanceId/tick', async (req: Request, res: Response) => {
    const session = requireDisplaySession(req)
    const instanceId = req.params.instanceId ?? ''
    if (!UUID_RE.test(instanceId)) return res.status(404).json({ error: 'NotFound', message: 'instance not found' })
    try {
      const tenant = sessionTenant(session)
      const currentPersonId = await instancePersonId(session.householdId, instanceId)
      if (currentPersonId === undefined) return res.status(404).json({ error: 'NotFound', message: 'instance not found' })
      if (currentPersonId === null) {
        const claimed = await claimInstance(tenant, instanceId, session.personId)
        if (!claimed) {
          // claimInstance's `where ... and person_id is null` lost the race — find
          // out why: someone else grabbed it in the gap (409, don't steal it) vs
          // the row is simply gone now (404, same as every other display route).
          const recheck = await instancePersonId(session.householdId, instanceId)
          if (recheck === undefined) return res.status(404).json({ error: 'NotFound', message: 'instance not found' })
          return res.status(409).json({ error: 'Conflict', message: 'someone else just took this one' })
        }
      }
      const inst = await completeInstance(tenant, instanceId)
      if (!inst) return res.status(404).json({ error: 'NotFound', message: 'instance not found' })
      return { instance: presentInstance(inst), doneBy: await completedByName(inst.completed_by) }
    } catch (err) {
      if (err instanceof ProofRequiredError) {
        return res.status(422).json({ error: 'ProofRequired', message: err.message })
      }
      throw err
    }
  })

  // The mis-tap recovery: revert to pending via the same uncompleteInstance a phone
  // undo uses (reverses any star award too). Not restricted to the person who just
  // ticked it — any live session on this device can undo, same as the phone lets
  // any household member uncomplete.
  api.post('/api/display/chores/:instanceId/undo', async (req: Request, res: Response) => {
    const session = requireDisplaySession(req)
    const instanceId = req.params.instanceId ?? ''
    if (!UUID_RE.test(instanceId)) return res.status(404).json({ error: 'NotFound', message: 'instance not found' })
    const inst = await uncompleteInstance(sessionTenant(session), instanceId)
    if (!inst) return res.status(404).json({ error: 'NotFound', message: 'instance not found' })
    return { instance: presentInstance(inst) }
  })
}
