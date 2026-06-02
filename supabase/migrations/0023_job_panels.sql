-- Panels live below doors in the job hierarchy: a panel is a comm
-- closet / equipment cabinet that feeds N doors. The panel has a
-- name ("Panel 1"), an optional comm-room number, an optional photo,
-- and a many-to-many link to the doors it serves.
--
-- The join table cascades on either side: deleting a door removes
-- it from every panel; deleting a panel removes its rows but leaves
-- doors alone (they keep working, just unassigned).

create table if not exists public.job_panels (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  name text not null,
  comm_room text,
  photo_storage_path text,
  photo_uploaded_at timestamptz,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists job_panels_job_idx
  on public.job_panels (job_id, position);

drop trigger if exists set_job_panels_updated_at on public.job_panels;
create trigger set_job_panels_updated_at
  before update on public.job_panels
  for each row
  execute function public.set_updated_at();

alter table public.job_panels enable row level security;

drop policy if exists "Dev: anyone can read job_panels" on public.job_panels;
create policy "Dev: anyone can read job_panels" on public.job_panels
  for select using (true);

drop policy if exists "Dev: anyone can insert job_panels" on public.job_panels;
create policy "Dev: anyone can insert job_panels" on public.job_panels
  for insert with check (true);

drop policy if exists "Dev: anyone can update job_panels" on public.job_panels;
create policy "Dev: anyone can update job_panels" on public.job_panels
  for update using (true) with check (true);

drop policy if exists "Dev: anyone can delete job_panels" on public.job_panels;
create policy "Dev: anyone can delete job_panels" on public.job_panels
  for delete using (true);

create table if not exists public.job_panel_doors (
  panel_id uuid not null references public.job_panels(id) on delete cascade,
  door_id uuid not null references public.job_doors(id) on delete cascade,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (panel_id, door_id)
);

create index if not exists job_panel_doors_door_idx
  on public.job_panel_doors (door_id);

alter table public.job_panel_doors enable row level security;

drop policy if exists "Dev: anyone can read job_panel_doors" on public.job_panel_doors;
create policy "Dev: anyone can read job_panel_doors" on public.job_panel_doors
  for select using (true);

drop policy if exists "Dev: anyone can insert job_panel_doors" on public.job_panel_doors;
create policy "Dev: anyone can insert job_panel_doors" on public.job_panel_doors
  for insert with check (true);

drop policy if exists "Dev: anyone can update job_panel_doors" on public.job_panel_doors;
create policy "Dev: anyone can update job_panel_doors" on public.job_panel_doors
  for update using (true) with check (true);

drop policy if exists "Dev: anyone can delete job_panel_doors" on public.job_panel_doors;
create policy "Dev: anyone can delete job_panel_doors" on public.job_panel_doors
  for delete using (true);
