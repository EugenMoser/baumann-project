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
                                                      3. head guard: skip 4 and 5 if main moved on
                                                      4. Coolify deploy webhook -> build on VPS -> container
                                                      5. smoke check: scripts/smoke-check.mts <preview-url> <sha>
```

- The `deploy` job only runs on pushes to `main` and only after `app` and `db`
  are green. Deploys are serialized (`concurrency: deploy-preview`,
  `cancel-in-progress: false`), so a later push never kills a running deploy.
- The Coolify webhook deploys the branch head, not the pushed commit. Before
  calling it, the job compares `git ls-remote origin refs/heads/main` with
  `GITHUB_SHA`. If main has moved on, the webhook and smoke check are skipped
  (a `::notice::` says so) and the newer run, queued in the same concurrency
  group, deploys, provided its `app` and `db` jobs are green. If they fail, the
  older run's migrations are applied but no app is deployed, and production
  stays on the previous version until a fix is pushed (harmless under
  expand/contract). Migrations still run in the older job; they are a prefix
  of the newer run's migrations. Remaining window: if a push lands between the
  guard and Coolify's clone, Coolify builds the newer commit, so the newer app
  runs against the older schema until its own run has applied its migrations.
  This run's smoke check goes red because the app reports the newer commit.
  Expand/contract limits the impact; the next run fixes it forward.
- The smoke check polls `/api/health` for up to 10 minutes until it reports the
  commit that was pushed. `/api/health` always answers 200 with
  `{ commit, db }`; `db` is `error` when the database is slow or down. The
  Dockerfile has a `HEALTHCHECK` on the same endpoint.
- Migrations run before the new app is deployed, except in the residual
  window described above.

## 2. DNS

Create A (and AAAA, if the VPS has IPv6) records pointing to the VPS:

- `baumann.eugen-moser.com` (app)
- `api.baumann.eugen-moser.com` (Supabase API gateway)

## 3. Supabase on Coolify

1. Coolify: New resource -> Service -> Supabase. Do not deploy yet; adjust the
   compose file first (step 2).
2. Edit Compose File (the raw compose, not "Show Deployable Compose"), then
   Save. The Coolify template lags behind upstream Supabase in two places:
   - **Postgres 17.** The template ships `supabase/postgres:15.x`; this project
     uses Postgres 17 (`major_version` in `supabase/config.toml`). Set the
     `supabase-db` image to `supabase/postgres:17.6.1.136`. Only on a fresh
     install: Postgres 17 does not start on a Postgres 15 data directory. If
     the service ever ran on 15, stop it and delete the `supabase-db-data` and
     `supabase-db-config` volumes first (only while they hold no data).
   - **No MinIO.** `minio/mc` is no longer on Docker Hub, so the pull fails and
     the whole stack does not start (Coolify issue #11855). Delete the
     `supabase-minio` and `minio-createbucket` services completely and switch
     storage to the local file backend, as the upstream Supabase compose does.
     In `supabase-storage`, replace `STORAGE_BACKEND=s3`, the
     `STORAGE_S3_ENDPOINT`/`_FORCE_PATH_STYLE`/`_REGION` lines and the
     `AWS_*` credentials with:

     ```yaml
     - STORAGE_BACKEND=file
     - FILE_STORAGE_BACKEND_PATH=/var/lib/storage
     ```

     Keep `STORAGE_S3_BUCKET=stub` (internal folder name) and the
     `./volumes/storage:/var/lib/storage` volume; `imgproxy` reads the same
     directory.

   Also add the loopback port mapping from section 4 in the same edit.

3. Domain of the "Supabase Kong" service:
   `https://api.baumann.eugen-moser.com:8000` (`:8000` is the container port
   Coolify routes to; the public port stays 443).
4. Environment: `DISABLE_SIGNUP=true` (the template maps it to
   `GOTRUE_DISABLE_SIGNUP`). Leave `ENABLE_EMAIL_SIGNUP` alone: `false`
   disables email login entirely, which the admin login needs. Leave `SMTP_*`
   empty (the default `SMTP_PORT` is harmless without `SMTP_HOST`).
   Admin users are created with `pnpm admin:create` from a developer machine
   (service-role key in `.env.import`, see `docs/import.md`):
   `read -s PW && printf '%s' "$PW" | pnpm admin:create --email <address>`.
   A second run with the same e-mail resets the password.
   Login attempts share one GoTrue rate limit (all sign-ins come from the app
   server's IP; see "Risks" in `docs/specs/2026-10-10-admin-products-design.md`).
5. Studio sits behind Kong's basic auth (`SERVICE_USER_ADMIN` /
   `SERVICE_PASSWORD_ADMIN`, generated by Coolify).
6. Keys: the template issues the legacy anon JWT (`SERVICE_SUPABASEANON_KEY`)
   and service-role JWT. The anon key is fine as
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (spec decision D5). The service-role
   key never goes into the app's build variables.
7. Deploy, then verify:

   ```bash
   docker ps --format '{{.Names}}\t{{.Status}}' | grep <service-uuid>   # all up, no minio
   docker exec <supabase-db-container> psql -U postgres -tAc "select version();"  # PostgreSQL 17.6
   curl -sSI https://api.baumann.eugen-moser.com | head -1              # HTTP/2 401
   ```

8. The service images are pinned; record them here:

   | Service | Image version                  |
   | ------- | ------------------------------ |
   | db      | `supabase/postgres:17.6.1.136` |
   | auth    | `supabase/gotrue:v2.186.0`     |
   | rest    | `postgrest/postgrest:v14.6`    |
   | storage | `supabase/storage-api:v1.44.2` |
   | kong    | `kong/kong:3.9.1`              |

## 4. Postgres for migrations

The template publishes no database port. Map the `supabase-db` container to
the host's loopback only (never `0.0.0.0`); the migration tool needs a session
connection, which the direct container port provides:

```yaml
supabase-db:
  ports:
    - "127.0.0.1:5432:5432"
```

Verify:

```bash
# on the VPS: bound to loopback only
ss -tlnp | grep 5432          # shows 127.0.0.1:5432

# from another machine: must fail
nc -vz <vps-host> 5432
```

## 5. Deploy user and key

On your machine (outside the repository):

```bash
ssh-keygen -t ed25519 -f ~/.ssh/baumann_deploy_key -N "" -C github-actions-deploy
ssh-keyscan -t ed25519 <vps-host> 2>/dev/null | ssh-keygen -lf -   # fingerprint A
```

On the VPS:

```bash
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub   # fingerprint B, must equal A
adduser --disabled-password --gecos "" --shell /usr/sbin/nologin deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
sshd -T | grep -Ei "^(allowtcpforwarding|allowusers|allowgroups)"
# expect "allowtcpforwarding yes"; if AllowUsers/AllowGroups is set, add deploy
```

`/home/deploy/.ssh/authorized_keys` (owner `deploy`, mode 600) holds exactly
one line:

```
restrict,port-forwarding,permitopen="127.0.0.1:5432",command="/usr/sbin/nologin" ssh-ed25519 AAAA… github-actions-deploy
```

To build it without hand-editing the key, run on your machine

```bash
printf 'restrict,port-forwarding,permitopen="127.0.0.1:5432",command="/usr/sbin/nologin" %s\n' \
  "$(cat ~/.ssh/baumann_deploy_key.pub)" | pbcopy
```

then on the VPS `cat > /home/deploy/.ssh/authorized_keys`, paste, Enter,
Ctrl+D, and `chown deploy:deploy` / `chmod 600` the file.

The key can open a tunnel to the database port and nothing else.

Verify:

```bash
ssh -i ~/.ssh/baumann_deploy_key deploy@<vps-host>                              # no shell
ssh -i ~/.ssh/baumann_deploy_key -N -L 54329:127.0.0.1:5432 deploy@<vps-host>   # tunnel works
nc -vz 127.0.0.1 54329                                                          # second terminal: succeeded
```

Keep the local key until the verification in section 8 is done, then delete
it (it is stored as a GitHub secret).

## 6. App resource in Coolify

- Source: GitHub App, repository of this project, branch `main`.
- Build pack: Dockerfile. Domain `https://baumann.eugen-moser.com`, port 3000.
- **Auto Deploy off** — only the CI webhook deploys.
- Build variables (mark as build-time, they are inlined into the client
  bundle): `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Copy the key with the copy icon of `SERVICE_SUPABASEANON_KEY`, not by
  selecting it. A JWT starts with `eyJ` and has two dots. The build only checks
  the payload's `role`, so a key with a cut-off first character builds fine
  but Kong rejects it and `/api/health` reports `"db":"error"`. Check the
  running container with
  `docker exec <app-container> printenv NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | cut -c1-3`.
- `SOURCE_COMMIT` is a predefined Coolify runtime variable. It is excluded from
  Docker builds by default ("Include Source Commit in Build" off); that is fine
  because the app reads it at runtime for `/api/health`.
- Health check: the Dockerfile `HEALTHCHECK` is what Coolify uses. Do not
  configure a separate HTTP health check in the dashboard; the slim image has
  neither curl nor wget.
- Create an API token with deploy permission and copy the deploy webhook URL
  of the resource.

## 7. GitHub repository secrets

Repository secrets are used because environments with protection rules need a
paid plan for private repositories.

| Secret                    | Holds                                                            | Source                                     |
| ------------------------- | ---------------------------------------------------------------- | ------------------------------------------ |
| `DEPLOY_SSH_HOST`         | VPS host name or address for the tunnel                          | `<vps-host>`                               |
| `DEPLOY_SSH_USER`         | Restricted user, `deploy`                                        | step 5                                     |
| `DEPLOY_SSH_PRIVATE_KEY`  | Private key `~/.ssh/baumann_deploy_key` (full file content)      | step 5                                     |
| `DEPLOY_SSH_KNOWN_HOSTS`  | Pinned host key line(s)                                          | `ssh-keyscan -t ed25519 <vps-host>`        |
| `DEPLOY_DB_TUNNEL_TARGET` | Tunnel target on the VPS, `127.0.0.1:5432`                       | step 4                                     |
| `PROD_DB_URL`             | Postgres URL via the tunnel (`127.0.0.1:54329`, `postgres` user) | database credentials of the Supabase stack |
| `COOLIFY_WEBHOOK_URL`     | Deploy webhook URL of the app resource                           | step 6                                     |
| `COOLIFY_TOKEN`           | Coolify API token with deploy permission                         | step 6                                     |
| `PREVIEW_URL`             | `https://baumann.eugen-moser.com`                                | step 2                                     |

`PROD_DB_URL` uses the tunnel's local end, not the VPS: the workflow forwards
local port 54329 to `DEPLOY_DB_TUNNEL_TARGET`.

- Use the `postgres` user: the migration that revokes default privileges does
  so `for role postgres`; with another owner, future tables would get default
  grants (including TRUNCATE) for the API roles.
- Percent-encode the password in the URL.
- Append `?sslmode=disable`: the database container does not offer TLS and the
  CLI otherwise refuses to connect. The internet leg is encrypted by the SSH
  tunnel; only the loopback hop on the VPS is plaintext.
- The production Postgres major version must match `major_version` in
  `supabase/config.toml` (currently 17).

Set the secrets with the GitHub CLI so no value lands in shell history or a
chat. Values that come from the clipboard are entered at a prompt, because
copying a command replaces the clipboard:

```bash
gh secret set DEPLOY_SSH_HOST --body "<vps-host>"
gh secret set DEPLOY_SSH_USER --body "deploy"
gh secret set DEPLOY_SSH_PRIVATE_KEY < ~/.ssh/baumann_deploy_key
ssh-keyscan -t ed25519 <vps-host> 2>/dev/null | gh secret set DEPLOY_SSH_KNOWN_HOSTS
gh secret set DEPLOY_DB_TUNNEL_TARGET --body "127.0.0.1:5432"

# Postgres password (SERVICE_PASSWORD_POSTGRES): paste at the prompt
read -rs "RAW?Password: "; PW=$(printf %s "$RAW" | python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.stdin.read().strip(), safe=""))'); unset RAW; echo; echo ${#PW}
gh secret set PROD_DB_URL --body "postgresql://postgres:${PW}@127.0.0.1:54329/postgres?sslmode=disable"

gh secret set COOLIFY_WEBHOOK_URL   # paste at the prompt
gh secret set COOLIFY_TOKEN         # paste at the prompt, without "Bearer "
gh secret set PREVIEW_URL --body "https://baumann.eugen-moser.com"
gh secret list                      # 9 secrets
```

Check the URL before the first deploy with a dry run through the tunnel (from
a checkout that contains the migrations; nothing is changed):

```bash
pnpm exec supabase db push --db-url "postgresql://postgres:${PW}@127.0.0.1:54329/postgres?sslmode=disable" --dry-run
unset PW
```

Do not call the Coolify webhook by hand before the Dockerfile is on `main`; it
would start a deployment of the branch head.

## 8. First deploy and verification

After merging the feature branch to `main`, watch the `deploy` job. Evidence
to collect (SC-14, SC-15):

- Job log: tunnel opened, `supabase db push` applied the migrations, webhook
  call succeeded, smoke check passed for the pushed commit.
- `curl -s https://baumann.eugen-moser.com/api/health` returns the commit SHA
  and `"db":"ok"`.
- `nc -vz <vps-host> 5432` from another machine fails.
- `ssh -i ~/.ssh/baumann_deploy_key deploy@<vps-host>` gets no shell.
- The demo notice is visible and `noindex` is set (meta, `X-Robots-Tag`,
  `robots.txt`).
- Afterwards delete the local key pair (`~/.ssh/baumann_deploy_key*`).

## 9. Migrations

Rule (expand/contract, ADR 0005): every migration must work with the app
version that is currently running, because migrations run before the new
container goes live.

- Add columns, tables and views first (expand); ship the app that uses them;
  remove old structures in a later release (contract).
- Destructive changes (drop, rename, type change) never share a release with
  the code that stops using the old structure.
- The head guard (section 1) ensures only the current `main` head is deployed,
  so an app version goes live before its migrations only in the residual
  window described in section 1; a superseded run only applies migrations.
- A failed migration fails the `deploy` job before the webhook runs, so the app
  is not redeployed. Fix forward with a new migration; do not edit an applied
  one.
- Every new table needs explicit grants, RLS and admin write policies in its
  migration (see `docs/data-model.md`).

## 10. Backups and restore

- Database: Coolify scheduled backup of the Supabase database, daily, keep 7,
  to off-site S3-compatible storage if available. Otherwise a cron `pg_dump`
  via `docker exec` into a rotated directory plus an off-site copy.
- Storage files are backed up as well: with the file backend (section 3) they
  live in the service's `volumes/storage` directory under
  `/data/coolify/services/<service-uuid>/`, not in the database.
- On revocation, backups are deleted earlier if requested; see
  [`docs/revocation.md`](revocation.md).
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
  then bump the pinned versions and the table in section 3.
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

| Date       | Idle available       | Peak during build        | Decision             |
| ---------- | -------------------- | ------------------------ | -------------------- |
| 2026-10-07 | 4.7 GiB (of 7.8 GiB) | ~3.1 GiB available (min) | keep building on VPS |

## 13. Images

- The admin uploads product images (JPEG, PNG, WebP). The 5 MB limit is
  enforced in the app; `serverActions.bodySizeLimit` is `6mb` to leave room for
  the multipart overhead. The reverse proxy in front of the app must accept
  request bodies of at least 6 MB, otherwise uploads fail before they reach the
  app. `serverActions.bodySizeLimit` is global, so the public inquiry action
  accepts 6 MB as well. Allow 6 MB request bodies at the proxy only for
  `/admin/*` paths and keep the default (about 1 MB) elsewhere.
- `pnpm media:prune` removes orphans: `media` rows without a product and files
  under `products/` without a `media` row. It needs `IMPORT_SUPABASE_URL` and
  `IMPORT_SUPABASE_SECRET_KEY` of the target (see `docs/import.md`):

  ```bash
  pnpm media:prune           # dry run: prints counts and paths
  pnpm media:prune --apply   # deletes rows first, then files
  ```

  Safety properties:
  - It is a dry run unless `--apply` is given.
  - Files of unlinked `media` rows are removed regardless of age. Files with no
    `media` row at all are removed only when older than one hour, so an upload
    in flight is safe. A file with a missing or invalid creation date counts as
    young and is kept.
  - It exits 1 and changes nothing when linked media rows exist but the
    `products/` listing is empty; that usually means a wrong bucket or key.
  - It never touches `certificates/`.

- Run it once after deploying the admin image feature (it also catches files of
  products deleted before it existed), and again whenever failed file removals
  show up in the app logs (`[admin] remove files`).
