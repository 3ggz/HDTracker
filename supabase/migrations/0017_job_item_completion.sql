-- Track which equipment items have been installed/verified on a door.
-- A non-null completed_at means the tech has marked the item done; the
-- UI shows it with a strikethrough and a muted style. Unchecking it
-- sets the column back to null. The actor who completed it is recorded
-- via the parent vehicle_activity / job_activity pipeline if/when we
-- add one (no activity log yet for jobs).

alter table public.job_door_items
  add column if not exists completed_at timestamptz;

create index if not exists job_door_items_completed_idx
  on public.job_door_items (door_id, completed_at);
