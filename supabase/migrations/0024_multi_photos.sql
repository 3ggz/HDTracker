-- Multi-photo support for door items and panels. Each device (item or
-- panel) gets its own photos table; new photos append rather than
-- replace. Existing single photos are backfilled as the first row in
-- the new table. The legacy photo_storage_path / photo_uploaded_at
-- columns stay for now but the UI ignores them — they'll be dropped
-- in a future migration once we're sure nothing else reads them.

create table if not exists public.job_door_item_photos (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.job_door_items(id) on delete cascade,
  storage_path text not null,
  caption text,
  position integer not null default 0,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint job_door_item_photos_storage_path_not_blank
    check (btrim(storage_path) <> '')
);

create index if not exists job_door_item_photos_item_idx
  on public.job_door_item_photos (item_id, position, created_at);

alter table public.job_door_item_photos enable row level security;

drop policy if exists "Dev: anyone can read job_door_item_photos" on public.job_door_item_photos;
create policy "Dev: anyone can read job_door_item_photos" on public.job_door_item_photos
  for select using (true);

drop policy if exists "Dev: anyone can insert job_door_item_photos" on public.job_door_item_photos;
create policy "Dev: anyone can insert job_door_item_photos" on public.job_door_item_photos
  for insert with check (true);

drop policy if exists "Dev: anyone can update job_door_item_photos" on public.job_door_item_photos;
create policy "Dev: anyone can update job_door_item_photos" on public.job_door_item_photos
  for update using (true) with check (true);

drop policy if exists "Dev: anyone can delete job_door_item_photos" on public.job_door_item_photos;
create policy "Dev: anyone can delete job_door_item_photos" on public.job_door_item_photos
  for delete using (true);

-- Backfill existing single item photos as the first row in the new
-- table. Idempotent via NOT EXISTS check so re-running is safe.
insert into public.job_door_item_photos (item_id, storage_path, position, created_at)
select i.id, i.photo_storage_path, 0,
       coalesce(i.photo_uploaded_at, i.created_at)
from public.job_door_items i
where i.photo_storage_path is not null
  and not exists (
    select 1 from public.job_door_item_photos p
    where p.item_id = i.id and p.storage_path = i.photo_storage_path
  );

create table if not exists public.job_panel_photos (
  id uuid primary key default gen_random_uuid(),
  panel_id uuid not null references public.job_panels(id) on delete cascade,
  storage_path text not null,
  caption text,
  position integer not null default 0,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint job_panel_photos_storage_path_not_blank
    check (btrim(storage_path) <> '')
);

create index if not exists job_panel_photos_panel_idx
  on public.job_panel_photos (panel_id, position, created_at);

alter table public.job_panel_photos enable row level security;

drop policy if exists "Dev: anyone can read job_panel_photos" on public.job_panel_photos;
create policy "Dev: anyone can read job_panel_photos" on public.job_panel_photos
  for select using (true);

drop policy if exists "Dev: anyone can insert job_panel_photos" on public.job_panel_photos;
create policy "Dev: anyone can insert job_panel_photos" on public.job_panel_photos
  for insert with check (true);

drop policy if exists "Dev: anyone can update job_panel_photos" on public.job_panel_photos;
create policy "Dev: anyone can update job_panel_photos" on public.job_panel_photos
  for update using (true) with check (true);

drop policy if exists "Dev: anyone can delete job_panel_photos" on public.job_panel_photos;
create policy "Dev: anyone can delete job_panel_photos" on public.job_panel_photos
  for delete using (true);

insert into public.job_panel_photos (panel_id, storage_path, position, created_at)
select p.id, p.photo_storage_path, 0,
       coalesce(p.photo_uploaded_at, p.created_at)
from public.job_panels p
where p.photo_storage_path is not null
  and not exists (
    select 1 from public.job_panel_photos pp
    where pp.panel_id = p.id and pp.storage_path = p.photo_storage_path
  );
