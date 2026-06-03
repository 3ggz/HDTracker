-- Two additions:
-- 1. Per-door 'tested_at' timestamp so the install crew can flag a
--    door as tested after the controller is wired up and verified.
--    Treated the same way item.completed_at is — null means not yet,
--    non-null means tested at that time.
-- 2. Site-map annotations: pen strokes + text labels drawn on top of
--    the uploaded PDF. Stored per-job, per-page as JSONB. Coordinates
--    inside the JSON are normalized to 0..1 of the page's natural
--    size so they survive zoom/scale on render.

alter table public.job_doors
  add column if not exists tested_at timestamptz;

create index if not exists job_doors_tested_idx
  on public.job_doors (job_id, tested_at);

create table if not exists public.job_map_annotations (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  page_index integer not null default 0,
  data jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (job_id, page_index)
);

drop trigger if exists set_job_map_annotations_updated_at on public.job_map_annotations;
create trigger set_job_map_annotations_updated_at
  before update on public.job_map_annotations
  for each row
  execute function public.set_updated_at();

alter table public.job_map_annotations enable row level security;

drop policy if exists "Dev: anyone can read job_map_annotations" on public.job_map_annotations;
create policy "Dev: anyone can read job_map_annotations" on public.job_map_annotations
  for select using (true);

drop policy if exists "Dev: anyone can insert job_map_annotations" on public.job_map_annotations;
create policy "Dev: anyone can insert job_map_annotations" on public.job_map_annotations
  for insert with check (true);

drop policy if exists "Dev: anyone can update job_map_annotations" on public.job_map_annotations;
create policy "Dev: anyone can update job_map_annotations" on public.job_map_annotations
  for update using (true) with check (true);

drop policy if exists "Dev: anyone can delete job_map_annotations" on public.job_map_annotations;
create policy "Dev: anyone can delete job_map_annotations" on public.job_map_annotations
  for delete using (true);
