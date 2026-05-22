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
