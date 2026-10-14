// Mints an opaque, revocable device token for the ESP32-P4 kitchen panel and stores
// only its sha256 hash in display_devices (same at-rest shape as kiosk device
// secrets — see sha256 in ../src/modules/auth/auth.ts). Unlike mint-token.ts this
// talks to the real database rather than signing a JWT: the panel presents the raw
// token back as `Authorization: Bearer <token>` on every GET /api/display/feed poll,
// and the API looks up its hash directly — there is no secret-for-JWT exchange step.
//
// Usage:
//   tsx scripts/mint-display-token.ts --household <uuid> [--label <name>]
//   (in the container: node dist/mint-display-token.js ...)
// Prints just the token, so:  export TOKEN=$(npm run -s display-token -- --household <uuid>)
//
// Revocation is deleting the row — there is no revoke endpoint by design (the card's
// scope is read-only): `delete from display_devices where id = '<device-id>'`.
import { randomBytes } from 'node:crypto'
import { query, closePool } from '../src/platform/db'
import { sha256 } from '../src/modules/auth/auth'

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : undefined
}

async function main(): Promise<void> {
  const householdId = arg('--household')
  if (!householdId) {
    console.error('Usage: mint-display-token --household <uuid> [--label <name>]')
    process.exitCode = 1
    return
  }
  const label = arg('--label') ?? 'Kitchen display'
  const token = 'waffled_display_' + randomBytes(32).toString('base64url')
  const { rows } = await query<{ id: string }>(
    `insert into display_devices (household_id, label, token_hash) values ($1, $2, $3) returning id`,
    [householdId, label, sha256(token)]
  )
  process.stderr.write(`Device id: ${rows[0].id} (label: ${label})\n`)
  process.stdout.write(token + '\n')
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : String(e))
    process.exitCode = 1
  })
  .finally(() => closePool().catch(() => {}))
