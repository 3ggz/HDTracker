-- Photos attached to vehicles. The actual image bytes live in the
-- 'vehicle-photos' Storage bucket (public, so the UI can use direct
-- public URLs instead of signed URLs). This table is the metadata
-- index: which vehicle, optional issue scoping, the storage path,
-- caption, uploader, and timestamp.
--
-- Per-issue and per-vehicle photos share this one table; per-issue
-- photos have issue_id set, per-vehicle photos have it null. A
-- delete cascades from either parent.

create table if not exists public.vehicle_photos (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  issue_id uuid references public.vehicle_issues(id) on delete cascade,
  storage_path text not null,
  caption text,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint vehicle_photos_storage_path_not_blank check (btrim(storage_path) <> '')
);

create index if not exists vehicle_photos_vehicle_idx
  on public.vehicle_photos (vehicle_id, created_at desc);

create index if not exists vehicle_photos_issue_idx
  on public.vehicle_photos (issue_id, created_at desc)
  where issue_id is not null;

-- Bucket creation. Public so the UI can use direct public URLs.
insert into storage.buckets (id, name, public)
values ('vehicle-photos', 'vehicle-photos', true)
on conflict (id) do nothing;

-- Storage object policies. While auth is intentionally off, the anon
-- role needs full access to the bucket. Tighten alongside everything
-- else when auth is re-enabled.
drop policy if exists "Dev: anyone can read vehicle photos" on storage.objects;
create policy "Dev: anyone can read vehicle photos"
  on storage.objects for select
  using (bucket_id = 'vehicle-photos');

drop policy if exists "Dev: anyone can upload vehicle photos" on storage.objects;
create policy "Dev: anyone can upload vehicle photos"
  on storage.objects for insert
  with check (bucket_id = 'vehicle-photos');

drop policy if exists "Dev: anyone can update vehicle photos" on storage.objects;
create policy "Dev: anyone can update vehicle photos"
  on storage.objects for update
  using (bucket_id = 'vehicle-photos')
  with check (bucket_id = 'vehicle-photos');

drop policy if exists "Dev: anyone can delete vehicle photos" on storage.objects;
create policy "Dev: anyone can delete vehicle photos"
  on storage.objects for delete
  using (bucket_id = 'vehicle-photos');

-- RLS on the metadata table mirrors the existing dev posture.
alter table public.vehicle_photos enable row level security;

drop policy if exists "Dev: anyone can read vehicle photo metadata" on public.vehicle_photos;
create policy "Dev: anyone can read vehicle photo metadata" on public.vehicle_photos
  for select using (true);

drop policy if exists "Dev: anyone can insert vehicle photo metadata" on public.vehicle_photos;
create policy "Dev: anyone can insert vehicle photo metadata" on public.vehicle_photos
  for insert with check (true);

drop policy if exists "Dev: anyone can update vehicle photo metadata" on public.vehicle_photos;
create policy "Dev: anyone can update vehicle photo metadata" on public.vehicle_photos
  for update using (true) with check (true);

drop policy if exists "Dev: anyone can delete vehicle photo metadata" on public.vehicle_photos;
create policy "Dev: anyone can delete vehicle photo metadata" on public.vehicle_photos
  for delete using (true);

-- Touch the parent vehicle so any list ordered by updated_at picks up
-- photo additions/removals.
create or replace function public.touch_vehicle_from_photo()
returns trigger
language plpgsql
as $$
declare
  changed_vehicle_id uuid;
begin
  changed_vehicle_id = coalesce(new.vehicle_id, old.vehicle_id);
  update public.vehicles set updated_at = now() where id = changed_vehicle_id;
  return coalesce(new, old);
end;
$$;

drop trigger if exists touch_vehicle_from_photo on public.vehicle_photos;
create trigger touch_vehicle_from_photo
  after insert or update or delete on public.vehicle_photos
  for each row
  execute function public.touch_vehicle_from_photo();

-- Extend the activity log to recognize a new subject_type for photos,
-- then add a trigger that logs photo adds and removes.
alter table public.vehicle_activity
  drop constraint if exists vehicle_activity_subject_type_check;
alter table public.vehicle_activity
  add constraint vehicle_activity_subject_type_check
  check (subject_type in ('vehicle', 'hardware', 'tool', 'issue', 'location', 'photo'));

create or replace function public.log_vehicle_photo_activity()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.vehicle_activity (
      vehicle_id, action, subject_type, subject_label, details, user_id
    )
    values (
      new.vehicle_id,
      'added',
      'photo',
      new.caption,
      jsonb_build_object('issue_id', new.issue_id, 'storage_path', new.storage_path),
      auth.uid()
    );
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.vehicle_activity (
      vehicle_id, action, subject_type, subject_label, details, user_id
    )
    values (
      old.vehicle_id,
      'removed',
      'photo',
      old.caption,
      jsonb_build_object('issue_id', old.issue_id, 'storage_path', old.storage_path),
      auth.uid()
    );
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists log_vehicle_photo_activity on public.vehicle_photos;
create trigger log_vehicle_photo_activity
  after insert or delete on public.vehicle_photos
  for each row
  execute function public.log_vehicle_photo_activity();
