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
