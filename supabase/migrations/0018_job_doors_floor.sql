-- Multi-floor support: a door belongs to a floor (or unit), captured
-- as free text so it can hold "3rd floor", "NICU", "Mother-Baby Floor
-- 3", or any label the tech reads off the PDF page header. Doors with
-- a null floor render in an "Unassigned" group; if no doors have a
-- floor, the UI falls back to a flat list.

alter table public.job_doors
  add column if not exists floor text;

create index if not exists job_doors_floor_idx
  on public.job_doors (job_id, floor, position);
