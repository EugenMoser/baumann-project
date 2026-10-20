# Revocation runbook

How to remove all customer data from the preview when the customer revokes
permission. The whole procedure must be finished within 14 days of the request.
Import side: `docs/import.md`. Placeholders in angle brackets are never
committed with real values.

1. **Day 0: request received.** Note the date and who received it. All later
   steps are recorded with their dates.

2. **Production removal (day 0-1).** Set the production environment (secret key
   per shell session, never in a file) and run the removal. `--confirm` must be
   the host of `IMPORT_SUPABASE_URL`, including the port if there is one:

   ```bash
   export IMPORT_SUPABASE_URL=https://<api host>
   read -rs IMPORT_SUPABASE_SECRET_KEY && export IMPORT_SUPABASE_SECRET_KEY
   pnpm catalog:remove --confirm <api host>
   unset IMPORT_SUPABASE_SECRET_KEY
   ```

   Without a matching `--confirm` the command deletes nothing and exits `1`
   (mismatch) or `2` (missing).
   On success it deletes every catalog row in one transaction, then empties the
   Storage bucket `catalog`, and prints the deleted counts per table. Record
   the printed counts. If it reports that the rows were deleted but emptying
   the bucket failed, run the same command again.

3. **Verify (day 0-1).**
   - Run `pnpm catalog:remove --confirm <api host>` a second time.
     `remove_catalog()` reports the counts before it deletes, so
     `products: 0`, `articles: 0`, `media: 0` and `certificates: 0` prove the tables are empty
     (unpublished rows included, which the publishable key cannot see). The CLI
     also verifies that the bucket `catalog` is empty and exits `1` otherwise.
   - `curl -s https://<app host>/api/health` returns `"db":"ok"`.

4. **Branding (by day 3).** In `config/branding.ts` switch the exported
   `branding` to `placeholderBranding` (one line), open a PR, merge it and let
   CI deploy. Change

   ```ts
   export const branding: Branding = customerBranding; // revocation: placeholderBranding
   ```

   to

   ```ts
   export const branding: Branding = placeholderBranding;
   ```

   The switch also removes the customer content in `descriptor` (header line)
   and `home` (title, lead and facts). Check that the demo notice and the
   footer show no customer name or URL, that the header and home page show the
   placeholder texts without facts, and that `/qualitaet` shows the placeholder
   policy text.

5. **Local copies (by day 3).** Delete snapshot directories and import reports
   (`rm -r <snapshot dir>`), the local certificate directory (`rm -r <certificate dir>`),
   one-off backup copies (`rm -r <backup copy dir>`), `.env.import` files, and
   local database data (run `pnpm catalog:remove --confirm 127.0.0.1:54321`
   first so local Storage files are removed too, then `pnpm db:reset`). Check
   other machines that may hold a snapshot or a backup copy.

6. **Backups (by day 14).** The daily database and Storage backups on the VPS
   live in `/var/backups/baumann-demo/<YYYY-MM-DD>/` (`docs/deploy.md`
   section 10). Do not rely on the 7-day retention: the script deletes old
   backups only after a successful run. On the VPS as root, list the backups
   and delete every day directory (`.partial` ones included) up to and
   including the removal day from step 2. Record the date:

   ```bash
   ls /var/backups/baumann-demo/
   rm -r /var/backups/baumann-demo/<YYYY-MM-DD>   # each day up to the removal day
   ```

7. **Confirm to the customer in writing**, with the date of each step above
   and the counts recorded in step 2.

## What is not affected

- The customer's own website, which is not part of this repository.
- The Git history. No snapshots, reports, images or catalog rows were ever
  committed. The customer name, URL, quality policy text, descriptor and home copy in
  `config/branding.ts` are replaced in step 4 but remain in older commits.
