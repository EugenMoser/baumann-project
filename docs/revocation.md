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

   Without a matching `--confirm` the command deletes nothing and exits `1`.
   On success it deletes every catalog row in one transaction, then empties the
   Storage bucket `catalog`, and prints the deleted counts per table. Record
   the printed counts. If it reports that the rows were deleted but emptying
   the bucket failed, run the same command again.

3. **Verify (day 0-1).**
   - Product count is 0 via the publishable key:
     `curl -s "https://<api host>/rest/v1/product?select=id" -H "apikey: <publishable key>"`
     returns `[]`.
   - The bucket `catalog` is empty (Studio or the Storage API).
   - `curl -s https://<app host>/api/health` returns `"db":"ok"`.

4. **Branding (by day 3).** In `config/branding.ts` switch the exported
   `branding` to `placeholderBranding` (one line), open a PR, merge it and let
   CI deploy. Check that the demo notice and the footer show no customer name
   or URL.

5. **Local copies (by day 3).** Delete snapshot directories and import reports
   (`rm -r <snapshot dir>`), `.env.import` files, and local database data
   (`pnpm db:reset`). Check other machines that may hold a snapshot.

6. **Backups (by day 14).** Database and storage backups age out after 7 days
   (daily backups, keep 7; `docs/deploy.md` section 10). If the customer asks
   for earlier deletion, delete the backups manually and record it.

7. **Confirm to the customer in writing**, with the date of each step above
   and the counts recorded in step 2.

## What is not affected

- The customer's own website, which is not part of this repository.
- The Git history: it never contained customer data. Snapshots, reports and
  images are not committed; images live only in Supabase Storage.
