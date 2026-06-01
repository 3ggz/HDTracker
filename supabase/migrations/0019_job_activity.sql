-- Per-job audit log. Mirrors vehicle_activity: a JSONB-typed events
-- table populated by AFTER triggers on jobs, job_doors, job_door_items,
-- and job_photos. Lives under /jobs/[id]/history.
--
-- The child triggers (door / item / photo) guard against cascade
-- deletes the same way migration 0015 does for vehicles: if the
-- parent job is already gone, skip the insert (cascade is about to
-- wipe the activity row anyway, and the FK would reject the insert).

create table if not exists public.job_activity (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  action text not null check (
    action in ('added', 'updated', 'removed', 'completed', 'uncompleted')
  ),
  subject_type text not null check (
    subject_type in ('job', 'door', 'item', 'photo', 'site_map')
  ),
  subject_label text,
  details jsonb,
  user_id uuid references auth.users(id) on delete set null,
  user_email text,
  created_at timestamptz not null default now()
);

create index if not exists job_activity_job_time_idx
  on public.job_activity (job_id, created_at desc);

alter table public.job_activity enable row level security;

drop policy if exists "Dev: anyone can read job_activity" on public.job_activity;
create policy "Dev: anyone can read job_activity" on public.job_activity
  for select using (true);

drop policy if exists "Dev: anyone can insert job_activity" on public.job_activity;
create policy "Dev: anyone can insert job_activity" on public.job_activity
  for insert with check (true);

drop policy if exists "Dev: anyone can delete job_activity" on public.job_activity;
create policy "Dev: anyone can delete job_activity" on public.job_activity
  for delete using (true);

-- jobs: insert + updates that change a user-visible field.
create or replace function public.log_job_activity()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.job_activity (
      job_id, action, subject_type, subject_label, user_id, user_email
    )
    values (
      new.id, 'added', 'job', new.name,
      auth.uid(), auth.jwt() ->> 'email'
    );
    return new;
  elsif tg_op = 'UPDATE' then
    if old.name is not distinct from new.name
       and old.number is not distinct from new.number
       and old.address is not distinct from new.address
       and old.notes is not distinct from new.notes
       and old.site_map_path is not distinct from new.site_map_path then
      return new;
    end if;

    if old.site_map_path is distinct from new.site_map_path then
      insert into public.job_activity (
        job_id, action, subject_type, subject_label,
        user_id, user_email
      )
      values (
        new.id,
        case when new.site_map_path is null then 'removed' else 'updated' end,
        'site_map',
        new.name,
        auth.uid(),
        auth.jwt() ->> 'email'
      );
    else
      insert into public.job_activity (
        job_id, action, subject_type, subject_label, user_id, user_email
      )
      values (
        new.id, 'updated', 'job', new.name,
        auth.uid(), auth.jwt() ->> 'email'
      );
    end if;
    return new;
  end if;
  return null;
end;
$$;

drop trigger if exists log_job_activity on public.jobs;
create trigger log_job_activity
  after insert or update on public.jobs
  for each row
  execute function public.log_job_activity();

-- job_doors
create or replace function public.log_job_door_activity()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.job_activity (
      job_id, action, subject_type, subject_label, details,
      user_id, user_email
    )
    values (
      new.job_id, 'added', 'door', new.name,
      jsonb_build_object('floor', new.floor),
      auth.uid(), auth.jwt() ->> 'email'
    );
    return new;
  elsif tg_op = 'UPDATE' then
    if old.name is distinct from new.name
       or old.floor is distinct from new.floor
       or old.notes is distinct from new.notes then
      insert into public.job_activity (
        job_id, action, subject_type, subject_label, details,
        user_id, user_email
      )
      values (
        new.job_id, 'updated', 'door', new.name,
        jsonb_build_object(
          'from', jsonb_build_object('name', old.name, 'floor', old.floor),
          'to', jsonb_build_object('name', new.name, 'floor', new.floor)
        ),
        auth.uid(), auth.jwt() ->> 'email'
      );
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if exists (select 1 from public.jobs where id = old.job_id) then
      insert into public.job_activity (
        job_id, action, subject_type, subject_label, details,
        user_id, user_email
      )
      values (
        old.job_id, 'removed', 'door', old.name,
        jsonb_build_object('floor', old.floor),
        auth.uid(), auth.jwt() ->> 'email'
      );
    end if;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists log_job_door_activity on public.job_doors;
create trigger log_job_door_activity
  after insert or update or delete on public.job_doors
  for each row
  execute function public.log_job_door_activity();

-- job_door_items: track add / remove / complete / uncomplete / rename.
-- Photo and note edits are noisy and intentionally not logged here.
create or replace function public.log_job_door_item_activity()
returns trigger
language plpgsql
as $$
declare
  parent_job_id uuid;
  door_name text;
begin
  if tg_op = 'INSERT' then
    select job_id, name into parent_job_id, door_name
    from public.job_doors where id = new.door_id;
    if parent_job_id is null then return new; end if;
    insert into public.job_activity (
      job_id, action, subject_type, subject_label, details,
      user_id, user_email
    )
    values (
      parent_job_id, 'added', 'item', new.name,
      jsonb_build_object('door', door_name),
      auth.uid(), auth.jwt() ->> 'email'
    );
    return new;
  elsif tg_op = 'UPDATE' then
    select job_id, name into parent_job_id, door_name
    from public.job_doors where id = new.door_id;
    if parent_job_id is null then return new; end if;
    if old.completed_at is distinct from new.completed_at then
      insert into public.job_activity (
        job_id, action, subject_type, subject_label, details,
        user_id, user_email
      )
      values (
        parent_job_id,
        case when new.completed_at is null then 'uncompleted' else 'completed' end,
        'item', new.name,
        jsonb_build_object('door', door_name),
        auth.uid(), auth.jwt() ->> 'email'
      );
    elsif old.name is distinct from new.name then
      insert into public.job_activity (
        job_id, action, subject_type, subject_label, details,
        user_id, user_email
      )
      values (
        parent_job_id, 'updated', 'item', new.name,
        jsonb_build_object(
          'door', door_name,
          'from', jsonb_build_object('name', old.name),
          'to', jsonb_build_object('name', new.name)
        ),
        auth.uid(), auth.jwt() ->> 'email'
      );
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    select job_id, name into parent_job_id, door_name
    from public.job_doors where id = old.door_id;
    if parent_job_id is null then return old; end if;
    if exists (select 1 from public.jobs where id = parent_job_id) then
      insert into public.job_activity (
        job_id, action, subject_type, subject_label, details,
        user_id, user_email
      )
      values (
        parent_job_id, 'removed', 'item', old.name,
        jsonb_build_object('door', door_name),
        auth.uid(), auth.jwt() ->> 'email'
      );
    end if;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists log_job_door_item_activity on public.job_door_items;
create trigger log_job_door_item_activity
  after insert or update or delete on public.job_door_items
  for each row
  execute function public.log_job_door_item_activity();

-- job_photos: log adds and removes; skip on cascade delete.
create or replace function public.log_job_photo_activity()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.job_activity (
      job_id, action, subject_type, subject_label, details,
      user_id, user_email
    )
    values (
      new.job_id, 'added', 'photo', new.caption,
      jsonb_build_object('door_id', new.door_id),
      auth.uid(), auth.jwt() ->> 'email'
    );
    return new;
  elsif tg_op = 'DELETE' then
    if exists (select 1 from public.jobs where id = old.job_id) then
      insert into public.job_activity (
        job_id, action, subject_type, subject_label, details,
        user_id, user_email
      )
      values (
        old.job_id, 'removed', 'photo', old.caption,
        jsonb_build_object('door_id', old.door_id),
        auth.uid(), auth.jwt() ->> 'email'
      );
    end if;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists log_job_photo_activity on public.job_photos;
create trigger log_job_photo_activity
  after insert or delete on public.job_photos
  for each row
  execute function public.log_job_photo_activity();
