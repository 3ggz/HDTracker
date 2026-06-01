-- Jobs tracker: a second top-level entity alongside vehicles. Independent
-- from vehicles (no FK either way). A job has name + optional number and
-- address, an optional site-map PDF, free-form notes, child doors with
-- their own equipment items and notes, and photos at the job/door scope
-- (per-item photos live on job_door_items, mirroring vehicle_items).
--
-- RLS stays permissive to match the existing dev posture; the proxy-layer
-- auth gate is what's actually keeping strangers out for now.

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  number text,
  address text,
  notes text,
  site_map_path text,
  site_map_uploaded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_jobs_updated_at on public.jobs;
create trigger set_jobs_updated_at
  before update on public.jobs
  for each row
  execute function public.set_updated_at();

alter table public.jobs enable row level security;

drop policy if exists "Dev: anyone can read jobs" on public.jobs;
create policy "Dev: anyone can read jobs" on public.jobs
  for select using (true);

drop policy if exists "Dev: anyone can insert jobs" on public.jobs;
create policy "Dev: anyone can insert jobs" on public.jobs
  for insert with check (true);

drop policy if exists "Dev: anyone can update jobs" on public.jobs;
create policy "Dev: anyone can update jobs" on public.jobs
  for update using (true) with check (true);

drop policy if exists "Dev: anyone can delete jobs" on public.jobs;
create policy "Dev: anyone can delete jobs" on public.jobs
  for delete using (true);

create table if not exists public.job_doors (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  name text not null,
  notes text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists job_doors_job_idx
  on public.job_doors (job_id, position);

drop trigger if exists set_job_doors_updated_at on public.job_doors;
create trigger set_job_doors_updated_at
  before update on public.job_doors
  for each row
  execute function public.set_updated_at();

alter table public.job_doors enable row level security;

drop policy if exists "Dev: anyone can read job_doors" on public.job_doors;
create policy "Dev: anyone can read job_doors" on public.job_doors
  for select using (true);

drop policy if exists "Dev: anyone can insert job_doors" on public.job_doors;
create policy "Dev: anyone can insert job_doors" on public.job_doors
  for insert with check (true);

drop policy if exists "Dev: anyone can update job_doors" on public.job_doors;
create policy "Dev: anyone can update job_doors" on public.job_doors
  for update using (true) with check (true);

drop policy if exists "Dev: anyone can delete job_doors" on public.job_doors;
create policy "Dev: anyone can delete job_doors" on public.job_doors
  for delete using (true);

create table if not exists public.job_door_items (
  id uuid primary key default gen_random_uuid(),
  door_id uuid not null references public.job_doors(id) on delete cascade,
  name text not null,
  note text,
  photo_storage_path text,
  photo_uploaded_at timestamptz,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists job_door_items_door_idx
  on public.job_door_items (door_id, position);

alter table public.job_door_items enable row level security;

drop policy if exists "Dev: anyone can read job_door_items" on public.job_door_items;
create policy "Dev: anyone can read job_door_items" on public.job_door_items
  for select using (true);

drop policy if exists "Dev: anyone can insert job_door_items" on public.job_door_items;
create policy "Dev: anyone can insert job_door_items" on public.job_door_items
  for insert with check (true);

drop policy if exists "Dev: anyone can update job_door_items" on public.job_door_items;
create policy "Dev: anyone can update job_door_items" on public.job_door_items
  for update using (true) with check (true);

drop policy if exists "Dev: anyone can delete job_door_items" on public.job_door_items;
create policy "Dev: anyone can delete job_door_items" on public.job_door_items
  for delete using (true);

create table if not exists public.job_photos (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  door_id uuid references public.job_doors(id) on delete cascade,
  storage_path text not null,
  caption text,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint job_photos_storage_path_not_blank check (btrim(storage_path) <> '')
);

create index if not exists job_photos_job_idx
  on public.job_photos (job_id, created_at desc);

create index if not exists job_photos_door_idx
  on public.job_photos (door_id, created_at desc)
  where door_id is not null;

alter table public.job_photos enable row level security;

drop policy if exists "Dev: anyone can read job photos" on public.job_photos;
create policy "Dev: anyone can read job photos" on public.job_photos
  for select using (true);

drop policy if exists "Dev: anyone can insert job photos" on public.job_photos;
create policy "Dev: anyone can insert job photos" on public.job_photos
  for insert with check (true);

drop policy if exists "Dev: anyone can update job photos" on public.job_photos;
create policy "Dev: anyone can update job photos" on public.job_photos
  for update using (true) with check (true);

drop policy if exists "Dev: anyone can delete job photos" on public.job_photos;
create policy "Dev: anyone can delete job photos" on public.job_photos
  for delete using (true);

-- Storage bucket for job photos and site-map PDFs. Public so the UI can
-- use direct public URLs (matches vehicle-photos).
insert into storage.buckets (id, name, public)
values ('job-files', 'job-files', true)
on conflict (id) do nothing;

drop policy if exists "Dev: anyone can read job files" on storage.objects;
create policy "Dev: anyone can read job files"
  on storage.objects for select
  using (bucket_id = 'job-files');

drop policy if exists "Dev: anyone can upload job files" on storage.objects;
create policy "Dev: anyone can upload job files"
  on storage.objects for insert
  with check (bucket_id = 'job-files');

drop policy if exists "Dev: anyone can update job files" on storage.objects;
create policy "Dev: anyone can update job files"
  on storage.objects for update
  using (bucket_id = 'job-files')
  with check (bucket_id = 'job-files');

drop policy if exists "Dev: anyone can delete job files" on storage.objects;
create policy "Dev: anyone can delete job files"
  on storage.objects for delete
  using (bucket_id = 'job-files');

-- Bubble updates from doors / items / photos up to the parent job so
-- the jobs list (ordered by updated_at desc) stays fresh.
create or replace function public.touch_job_from_door()
returns trigger
language plpgsql
as $$
declare
  changed_job_id uuid;
begin
  changed_job_id := coalesce(new.job_id, old.job_id);
  update public.jobs set updated_at = now() where id = changed_job_id;
  return coalesce(new, old);
end;
$$;

drop trigger if exists touch_job_from_door on public.job_doors;
create trigger touch_job_from_door
  after insert or update or delete on public.job_doors
  for each row
  execute function public.touch_job_from_door();

create or replace function public.touch_job_from_door_item()
returns trigger
language plpgsql
as $$
declare
  parent_job_id uuid;
begin
  select job_id into parent_job_id
  from public.job_doors
  where id = coalesce(new.door_id, old.door_id);
  if parent_job_id is not null then
    update public.jobs set updated_at = now() where id = parent_job_id;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists touch_job_from_door_item on public.job_door_items;
create trigger touch_job_from_door_item
  after insert or update or delete on public.job_door_items
  for each row
  execute function public.touch_job_from_door_item();

create or replace function public.touch_job_from_photo()
returns trigger
language plpgsql
as $$
declare
  changed_job_id uuid;
begin
  changed_job_id := coalesce(new.job_id, old.job_id);
  update public.jobs set updated_at = now() where id = changed_job_id;
  return coalesce(new, old);
end;
$$;

drop trigger if exists touch_job_from_photo on public.job_photos;
create trigger touch_job_from_photo
  after insert or update or delete on public.job_photos
  for each row
  execute function public.touch_job_from_photo();
