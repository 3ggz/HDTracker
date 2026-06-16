-- "Worked on by" — a simple text[] of names manually added to a job
-- on top of whoever shows up in job_activity. Most people who touch
-- a job will already appear in the derived list (their edits log
-- there); this column captures the helpers who don't.
--
-- text[] over a separate junction table because:
--   - the entries aren't FK'd to auth.users (we're recording
--     subcontractors and helpers who don't have accounts), and
--   - the list is small and write-rarely / read-often.
-- If we ever need per-name metadata (who added it, when, role) we
-- can promote to a job_workers table without breaking callers.

alter table public.jobs
  add column if not exists manual_workers text[] not null default '{}';
