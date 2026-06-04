-- Job completion is a single nullable timestamp on jobs. Null means
-- the job is still open and shows up in the main list on /jobs.
-- Non-null means it's done — the /jobs page floats it into a
-- separate "Completed jobs" section beneath the open ones, and the
-- card grows a small green ✓ Completed badge (mirroring the per-door
-- Tested indicator). Toggling re-opens it (timestamp goes back to
-- null) so this is fully reversible.

alter table public.jobs
  add column if not exists completed_at timestamptz;

create index if not exists jobs_open_idx
  on public.jobs (updated_at desc)
  where completed_at is null;

create index if not exists jobs_completed_idx
  on public.jobs (completed_at desc)
  where completed_at is not null;
