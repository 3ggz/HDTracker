# Supabase

Schema and policies for HDTracker's Supabase project.

## Applying migrations

We don't have the Supabase CLI wired up yet, so for now migrations are applied manually:

1. Open the Supabase dashboard for project `kabsvgotpkjrarhhpejq`.
2. Go to **SQL Editor** → **New query**.
3. Open the next un-applied migration file from `supabase/migrations/`.
4. Paste the entire file into the SQL Editor and click **Run**.
5. Verify no errors are reported.

Each migration is idempotent (uses `create or replace` / `drop trigger if exists`) so re-running is safe.

## Migrations

| File | Purpose |
| --- | --- |
| `0001_enforce_email_domain.sql` | Trigger on `auth.users` that rejects any signup whose email isn't `@hdsecurity.systems`. Server-side counterpart to the client-side check in `src/lib/email.ts`. |
| `0002_dev_email_allowlist.sql` | Temporary: adds `mark.hacz@gmail.com` to the allowlist so Mark can sign in for dev while the `@HDSecurity.Systems` mailbox isn't yet configured. To be reverted once Resend (or similar) is wired up to the company domain. |
| `0003_vehicles_table.sql` | The top-level `vehicles` table + shared `set_updated_at()` trigger function + permissive RLS policies (anon can read/write — auth is currently disabled in the app). When auth is re-enabled, tighten these policies to require `auth.uid() is not null`. |
| `0004_vehicle_issues.sql` | Free-form per-vehicle issues with `resolved_at`, parent vehicle freshness trigger, and temporary permissive RLS policies matching the auth-off dev state. |
| `0005_vehicle_items.sql` | Per-vehicle hardware and tools with flexible quantity text, display order, parent vehicle freshness trigger, and temporary permissive RLS policies. |
| `0006_vehicle_activity.sql` | Per-vehicle audit log populated by AFTER triggers on `vehicles`, `vehicle_items`, and `vehicle_issues`. Powers the `/vehicles/[id]/history` view. user_id pulled from `auth.uid()` (null while auth is off). |
| `0007_vehicle_photos.sql` | `vehicle_photos` metadata table + the `vehicle-photos` Storage bucket (public) and its access policies. Extends the activity log to recognise the new `'photo'` subject type and adds a trigger so photo adds/removes show up in history. |
| `0008_known_emails_and_strict_domain.sql` | `known_emails` mirror of `auth.users.email` so the sign-in page can ask "is this email already registered?" without exposing `auth.users` to the anon role. Also reverts the email-domain trigger to strict `@hdsecurity.systems` only (drops the `mark.hacz@gmail.com` dev allowlist from migration 0002). |
| `0009_activity_user_email.sql` | Adds `user_email` to `vehicle_activity` and updates each trigger to populate it from `auth.jwt() ->> 'email'`. Powers the per-row display name on the history view. Pre-migration rows (and any anon-context activity) keep `user_email = null` and render as "Anonymous". |
| `0010_enable_realtime.sql` | Adds `vehicles`, `vehicle_items`, `vehicle_issues`, and `vehicle_photos` to the `supabase_realtime` publication so the client can subscribe to live row-level changes. Idempotent — guarded by `pg_publication_tables` checks. |
| `0011_vehicle_item_photos.sql` | Adds `photo_storage_path` + `photo_uploaded_at` columns to `vehicle_items` so each row can carry at most one photo (newest replaces older). Files land in the existing `vehicle-photos` bucket under `<vehicle_id>/items/<photo_id>.<ext>`. |
| `0012_vehicle_notes.sql` | Adds a `notes` text column to `vehicles` for free-form per-vehicle notes (renders as its own collapsible on the detail page). Re-creates `log_vehicle_activity` to include the new column in its distinct-from checks so notes changes are tracked in history. |
| `0013_user_approvals.sql` | One-time per-account approval gate. `public.user_approvals` tracks each user's `approved_at`; new signups land with it null and the proxy bounces them to `/pending-approval` until Mark flips it via `/admin/approvals`. Trigger auto-approves `mark@hdsecurity.systems`; backfill rows exist for any pre-migration accounts. RLS lets users read their own row + lets Mark read/update all; trigger is SECURITY DEFINER so no INSERT policy is needed for app roles. Added to the `supabase_realtime` publication so the admin banner and the pending screen react instantly. |
| `0014_user_approvals_denied.sql` | Adds `denied_at` + `denied_by` to `public.user_approvals` so the admin can deny accounts as well as approve them. Approve and Deny are mutually exclusive in the app's update logic (each clears the other); soft-deny only, the `auth.users` row is left in place and the user sees an "Access Denied" message on `/pending-approval`. |
