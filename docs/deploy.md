# Deploy runbook

Operational guide for the preview at `https://baumann.eugen-moser.com`
(non-indexed demo). Decisions: ADR 0002 (deploy) and ADR 0005 (production
migrations). Placeholders in angle brackets (`<vps-host>`) are never committed
with real values.

## 1. Overview

```
push to main
  -> GitHub Actions
       app (lint, typecheck, test, build, e2e) ─┐
       db  (pgTAP, integration, types check)   ─┴─> deploy
                                                      1. SSH tunnel (local port 54329) -> Postgres on the VPS
                                                      2. supabase db push (migrations)
                                                      3. Coolify deploy webhook -> build on VPS -> container
                                                      4. smoke check: scripts/smoke-check.mts <preview-url> <sha>
```

- The `deploy` job only runs on pushes to `main` and only after `app` and `db`
  are green. Deploys are serialized (`concurrency: deploy-preview`,
  `cancel-in-progress: false`), so a later push never kills a running deploy.
- The smoke check polls `/api/health` for up to 10 minutes until it reports the
  commit that was pushed. `/api/health` always answers 200 with
  `{ commit, db }`; `db` is `error` when the database is slow or down. The
  Dockerfile has a `HEALTHCHECK` on the same endpoint.

## 2. DNS

Create A (and AAAA, if the VPS has IPv6) records pointing to the VPS:

- `baumann.eugen-moser.com` (app)
- `api.baumann.eugen-moser.com` (Supabase API gateway)

## 3. Supabase on Coolify

1. Coolify: New resource -> Service -> Supabase.
2. Domain for the API gateway (Kong): `https://api.baumann.eugen-moser.com`.
3. Disable sign-ups (`DISABLE_SIGNUP=true`; the auth service reads it as
   `GOTRUE_DISABLE_SIGNUP` — set whichever name the template uses). Do not
   configure SMTP. Admin users are created manually.
4. Studio: reachable only behind its basic-auth credentials with a strong
   password, or not exposed at all.
5. Keys: the template issues the legacy anon JWT and service-role JWT. The anon
   key is fine as `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (spec decision D5). The
   service-role key never goes into the app's build variables.
6. Pin the service images to explicit versions and record them here after the
   first setup:

   | Service | Image version |
   | ------- | ------------- |
   | db      | _(record)_    |
   | auth    | _(record)_    |
   | rest    | _(record)_    |
   | storage | _(record)_    |
   | kong    | _(record)_    |

## 4. Postgres for migrations

Map Postgres to `127.0.0.1:5432` on the host only (never `0.0.0.0`). Use the
direct `supabase-db` container or the Supavisor session port, whichever the
template exposes; the migration tool needs a session connection.

Verify:

```bash
# on the VPS: bound to loopback only
ss -tlnp | grep 5432          # shows 127.0.0.1:5432

# from another machine: must fail
nc -vz <vps-host> 5432
```

## 5. Deploy user and key

On your machine:

```bash
ssh-keygen -t ed25519 -f deploy_key -N "" -C github-actions-deploy
ssh-keyscan -t ed25519 <vps-host>     # output becomes DEPLOY_SSH_KNOWN_HOSTS
```

On the VPS:

```bash
adduser --disabled-password --gecos "" deploy
```

Add one line to `/home/deploy/.ssh/authorized_keys` (owner `deploy`, mode 600):

```
restrict,port-forwarding,permitopen="127.0.0.1:5432",command="/usr/sbin/nologin" ssh-ed25519 AAAA… github-actions-deploy
```

The key can open a tunnel to the database port and nothing else.

Verify:

```bash
ssh -i deploy_key deploy@<vps-host>                              # no shell
ssh -i deploy_key -N -L 54329:127.0.0.1:5432 deploy@<vps-host>   # tunnel works
```

Delete the local `deploy_key` after storing it as a GitHub secret.

## 6. App resource in Coolify

- Source: GitHub App, repository of this project, branch `main`.
- Build pack: Dockerfile. Domain `https://baumann.eugen-moser.com`, port 3000.
- **Auto Deploy off** — only the CI webhook deploys.
- Build variables (mark as build-time, they are inlined into the client
  bundle): `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- `SOURCE_COMMIT` is a predefined Coolify runtime variable. It is excluded from
  Docker builds by default ("Include Source Commit in Build" off); that is fine
  because the app reads it at runtime for `/api/health`.
- Health check path: `/api/health`.
- Create an API token with deploy permission and copy the deploy webhook URL
  of the resource.

## 7. GitHub repository secrets

Repository secrets are used because environments with protection rules need a
paid plan for private repositories.

| Secret                    | Holds                                                    | Source                                     |
| ------------------------- | -------------------------------------------------------- | ------------------------------------------ |
| `DEPLOY_SSH_HOST`         | VPS host name or address for the tunnel                  | `<vps-host>`                               |
| `DEPLOY_SSH_USER`         | Restricted user, `deploy`                                | step 5                                     |
| `DEPLOY_SSH_PRIVATE_KEY`  | Private key `deploy_key` (full file content)             | step 5                                     |
| `DEPLOY_SSH_KNOWN_HOSTS`  | Pinned host key line(s)                                  | `ssh-keyscan -t ed25519 <vps-host>`        |
| `DEPLOY_DB_TUNNEL_TARGET` | Tunnel target on the VPS, `127.0.0.1:5432`               | step 4                                     |
| `PROD_DB_URL`             | Postgres URL via the tunnel (`127.0.0.1:54329`, DB user) | database credentials of the Supabase stack |
| `COOLIFY_WEBHOOK_URL`     | Deploy webhook URL of the app resource                   | step 6                                     |
| `COOLIFY_TOKEN`           | Coolify API token with deploy permission                 | step 6                                     |
| `PREVIEW_URL`             | `https://baumann.eugen-moser.com`                        | step 2                                     |

`PROD_DB_URL` uses the tunnel's local end, not the VPS: the workflow forwards
local port 54329 to `DEPLOY_DB_TUNNEL_TARGET`.

## 8. First deploy and verification

After merging the feature branch to `main`, watch the `deploy` job. Evidence
to collect (SC-14, SC-15):

- Job log: tunnel opened, `supabase db push` applied the migrations, webhook
  call succeeded, smoke check passed for the pushed commit.
- `curl -s https://baumann.eugen-moser.com/api/health` returns the commit SHA
  and `"db":"ok"`.
- `nc -vz <vps-host> 5432` from another machine fails.
- `ssh -i deploy_key deploy@<vps-host>` gets no shell.
- The demo notice is visible and `noindex` is set (meta, `X-Robots-Tag`,
  `robots.txt`).

## 9. Migrations

Rule (expand/contract, ADR 0005): every migration must work with the app
version that is currently running, because migrations run before the new
container goes live.

- Add columns, tables and views first (expand); ship the app that uses them;
  remove old structures in a later release (contract).
- Destructive changes (drop, rename, type change) never share a release with
  the code that stops using the old structure.
- A failed migration fails the `deploy` job before the webhook runs, so the app
  is not redeployed. Fix forward with a new migration; do not edit an applied
  one.
- Every new table needs explicit grants, RLS and admin write policies in its
  migration (see `docs/data-model.md`).

## 10. Backups and restore

- Database: Coolify scheduled backup of the Supabase database, daily, keep 7,
  to off-site S3-compatible storage if available. Otherwise a cron `pg_dump`
  via `docker exec` into a rotated directory plus an off-site copy.
- Storage files (volume of the storage service) are backed up as well.
- Restore test, quarterly, into the local stack:

  ```bash
  pnpm db:start
  pnpm db:reset                      # migrations + seed, clean slate
  psql "<local-db-url>" < dump.sql   # restore the production dump
  ```

  Record the date and result below.

  | Date       | Result     |
  | ---------- | ---------- |
  | _(record)_ | _(record)_ |

## 11. Updates

- Coolify updates itself.
- Supabase service images stay pinned; update deliberately: read the changelog,
  test the matching CLI version locally first (`pnpm db:reset`, `pnpm db:test`),
  then bump the pinned versions and the table in step 3.
- App dependencies are updated through pull requests.

## 12. VPS size check

The app and Supabase share one VPS and the image is built there. After the
stack is up, record:

- `free -h` (idle)
- `docker stats --no-stream`
- the memory peak during an app build

Threshold: if available memory drops below 1 GB during a build, switch to
building in GitHub Actions and pushing to GHCR (ADR 0002 fallback). The app does
not change for this.

| Date       | Idle available | Peak during build | Decision   |
| ---------- | -------------- | ----------------- | ---------- |
| _(record)_ | _(record)_     | _(record)_        | _(record)_ |
