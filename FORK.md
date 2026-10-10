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
| Planner (phone) UI for the web app | `apps/web/**` | Not as-is; ours is a taste call |

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
