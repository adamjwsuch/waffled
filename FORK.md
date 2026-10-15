# FORK.md — how this fork differs from upstream, and how we ship it

This repository is a **fork of [`kevinpsites/waffled`](https://github.com/kevinpsites/waffled)**
(AGPL-3.0). `main` tracks upstream and carries nothing of ours; every local change lives on
branches merged into **`home`**, which is what we deploy.

## Remotes and branch model

```
origin    git@github.com:<owner>/waffled.git   (our fork)
upstream  https://github.com/kevinpsites/waffled.git
```

- `main` — fast-forward only from `upstream/main`. Never commit to it.
- `home` — our integration branch: the deployment branch. Upstream releases are absorbed by
  rebasing our commits onto the new `upstream/main` (see below), never by merging divergently.
- Feature branches off `home` for individual changes.

Our delta is deliberately small and each piece is written so it *could* go upstream. If a
change is upstream-able, it should be proposed upstream and then dropped from here.

### Absorbing an upstream release

```bash
git fetch upstream --tags
git checkout main && git merge --ff-only upstream/main
git checkout home && git rebase main
# resolve, test, then:
git push --force-with-lease origin home
```

`--force-with-lease` is correct here: `home` is ours alone, and a rebase rewrites it.

## What we change

| Change | Where | Upstream-able? |
| --- | --- | --- |
| `settings.chores.hideFutureDated` — future-dated one-off chores stay out of Today (default on) | `apps/api/src/modules/chores/{chores.service,chores.routes}.ts` | Yes — a household setting, worth a PR |
| Planner (phone) UI for the web app — shell (`src/planner/*`), Today cards and the Calendar/Meals/Family phone screens (`src/planner/phone/*`): a `planner` experience beside the kiosk (`apps/web/src/planner/*`, `/planner/**` routes, `?experience=` switch). Today's card order and hidden cards are the app's own mobile layout (`/api/today-layout/mobile`), edited by the Customize Today sheet behind the header's slider button (`src/planner/phone/CustomizeSheet.tsx`) | `apps/web/**` | Not as-is; ours is a taste call |
| Kitchen display panel api surface — `GET /api/display/feed` (today's instances grouped per person, read-only) and `POST /api/display/sessions` (panel device token + a person's PIN → short-lived session token) for the ESP32-P4 wall panel; panel devices live in their own `display_devices` table (hashed token, revocable) | `apps/api/src/modules/display/display.ts`, `apps/api/migrations/0107_display_devices.sql`, `apps/api/scripts/mint-display-token.ts` | Yes — a generic "shared device, per-person attribution" surface |

**Never change, or you break live clients:** the `/api` response shapes the shipped iOS app
consumes, the PowerSync sync rules and token issuance, and the migration numbering rules in
`apps/api/CLAUDE.md`.

## Building and releasing

Upstream's CI builds images from source; so does ours, unchanged:

- `.github/workflows/publish-images.yml` publishes **`ghcr.io/<owner>/waffled-{api,caddy,backup}`**
  (multi-arch amd64+arm64) when a `v*` tag is pushed, or on manual dispatch.
- Release with upstream's own script: `./waffled release X.Y.Z` (it bumps every version site,
  dates the changelog, commits `release: vX.Y.Z`, and tags). Run it on `home`.
- **Tag convention for our releases:** `v<upstream-version>-home.N`, e.g. `v0.15.3-home.1`. The
  upstream base stays legible, and a tag never collides with an upstream release. The leading
  **`v` is required** — `publish-images.yml` triggers on `tags: ['v*']`, so a bare
  `0.15.3-home.1` tag builds nothing.

  Note that the release job of that workflow lifts the notes from a `## [<version>]` CHANGELOG
  section; we ship no such section for a `-home.N` tag, so it falls back to auto-generated
  notes. Harmless, and only the log says so.

Deployments pull by tag (`WAFFLED_API_IMAGE=ghcr.io/<owner>/waffled-api:0.15.3-home.1`, same for
caddy/backup) rather than building on the host — the reason this fork exists is that the old
host-side patched-image build had to be re-based by hand at every upgrade.

## Tests

CI runs upstream's suites (`apps/api` vitest — integration tests use testcontainers, so a Docker
daemon is required; `apps/web` vitest + playwright). Both upstream conventions apply here: TDD,
and docs/changelog land in the same change as the behaviour.
