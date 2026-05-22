-- Per-vehicle audit log. Populated by AFTER triggers on the tables
-- that produce user-visible changes (vehicles, vehicle_items,
-- vehicle_issues). Writing the log from the database rather than the
-- app guarantees the audit trail can't drift out of sync with what
-- actually happened.
--
-- The `details` column is JSONB so each action can store whatever it
-- needs (e.g. quantity diffs) without schema changes. The UI knows
-- how to render each (action, subject_type) combo.
--
-- user_id is captured from auth.uid() at trigger time. While auth is
-- intentionally disabled, this stays null; once auth is re-enabled,
-- new rows pick up real users automatically.

create table if not exists public.vehicle_activity (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  action text not null check (
    action in ('added', 'updated', 'removed', 'resolved', 'reopened')
  ),
  subject_type text not null check (
    subject_type in ('vehicle', 'hardware', 'tool', 'issue', 'location')
  ),
  subject_label text,
  details jsonb,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists vehicle_activity_vehicle_time_idx
  on public.vehicle_activity (vehicle_id, created_at desc);

-- vehicle_items: hardware and tools.
create or replace function public.log_vehicle_item_activity()
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
      new.category,
      new.name,
      jsonb_build_object('quantity', new.quantity_text),
      auth.uid()
    );
    return new;
  elsif tg_op = 'UPDATE' then
    if old.name is distinct from new.name
       or old.quantity_text is distinct from new.quantity_text then
      insert into public.vehicle_activity (
        vehicle_id, action, subject_type, subject_label, details, user_id
      )
      values (
        new.vehicle_id,
        'updated',
        new.category,
        new.name,
        jsonb_build_object(
          'from', jsonb_build_object('name', old.name, 'quantity', old.quantity_text),
          'to', jsonb_build_object('name', new.name, 'quantity', new.quantity_text)
        ),
        auth.uid()
      );
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.vehicle_activity (
      vehicle_id, action, subject_type, subject_label, details, user_id
    )
    values (
      old.vehicle_id,
      'removed',
      old.category,
      old.name,
      jsonb_build_object('last_quantity', old.quantity_text),
      auth.uid()
    );
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists log_vehicle_item_activity on public.vehicle_items;
create trigger log_vehicle_item_activity
  after insert or update or delete on public.vehicle_items
  for each row
  execute function public.log_vehicle_item_activity();

-- vehicle_issues: distinguish resolve / reopen / body edit.
create or replace function public.log_vehicle_issue_activity()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.vehicle_activity (
      vehicle_id, action, subject_type, subject_label, user_id
    )
    values (new.vehicle_id, 'added', 'issue', new.body, auth.uid());
    return new;
  elsif tg_op = 'UPDATE' then
    if old.resolved_at is null and new.resolved_at is not null then
      insert into public.vehicle_activity (
        vehicle_id, action, subject_type, subject_label, user_id
      )
      values (new.vehicle_id, 'resolved', 'issue', new.body, auth.uid());
    elsif old.resolved_at is not null and new.resolved_at is null then
      insert into public.vehicle_activity (
        vehicle_id, action, subject_type, subject_label, user_id
      )
      values (new.vehicle_id, 'reopened', 'issue', new.body, auth.uid());
    elsif old.body is distinct from new.body then
      insert into public.vehicle_activity (
        vehicle_id, action, subject_type, subject_label, details, user_id
      )
      values (
        new.vehicle_id,
        'updated',
        'issue',
        new.body,
        jsonb_build_object('from', old.body, 'to', new.body),
        auth.uid()
      );
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.vehicle_activity (
      vehicle_id, action, subject_type, subject_label, user_id
    )
    values (old.vehicle_id, 'removed', 'issue', old.body, auth.uid());
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists log_vehicle_issue_activity on public.vehicle_issues;
create trigger log_vehicle_issue_activity
  after insert or update or delete on public.vehicle_issues
  for each row
  execute function public.log_vehicle_issue_activity();

-- vehicles: created + user-visible field changes. Skip the touch-only
-- updates from the parent freshness triggers (those bump updated_at
-- only, which isn't in the distinct-from check).
create or replace function public.log_vehicle_activity()
returns trigger
language plpgsql
as $$
declare
  only_location_changed boolean;
begin
  if tg_op = 'INSERT' then
    insert into public.vehicle_activity (
      vehicle_id, action, subject_type, subject_label, user_id
    )
    values (new.id, 'added', 'vehicle', new.name, auth.uid());
    return new;
  elsif tg_op = 'UPDATE' then
    if old.name is not distinct from new.name
       and old.make is not distinct from new.make
       and old.model is not distinct from new.model
       and old.year is not distinct from new.year
       and old.license_plate is not distinct from new.license_plate
       and old.last_worked_job is not distinct from new.last_worked_job
       and old.location_label is not distinct from new.location_label
       and old.location_lat is not distinct from new.location_lat
       and old.location_lng is not distinct from new.location_lng then
      -- nothing user-visible changed
      return new;
    end if;

    only_location_changed :=
      old.name is not distinct from new.name
      and old.make is not distinct from new.make
      and old.model is not distinct from new.model
      and old.year is not distinct from new.year
      and old.license_plate is not distinct from new.license_plate
      and old.last_worked_job is not distinct from new.last_worked_job
      and (
        old.location_label is distinct from new.location_label
        or old.location_lat is distinct from new.location_lat
        or old.location_lng is distinct from new.location_lng
      );

    if only_location_changed then
      insert into public.vehicle_activity (
        vehicle_id, action, subject_type, subject_label, user_id
      )
      values (new.id, 'updated', 'location', new.location_label, auth.uid());
    else
      insert into public.vehicle_activity (
        vehicle_id, action, subject_type, subject_label, user_id
      )
      values (new.id, 'updated', 'vehicle', new.name, auth.uid());
    end if;
    return new;
  end if;
  return null;
end;
$$;

drop trigger if exists log_vehicle_activity on public.vehicles;
create trigger log_vehicle_activity
  after insert or update on public.vehicles
  for each row
  execute function public.log_vehicle_activity();

alter table public.vehicle_activity enable row level security;

drop policy if exists "Dev: anyone can read vehicle activity" on public.vehicle_activity;
create policy "Dev: anyone can read vehicle activity" on public.vehicle_activity
  for select using (true);

-- Inserts are only ever done by the trigger functions running as the
-- table owner; nothing in the app inserts directly. We still need a
-- permissive insert policy so the triggers (which run as the calling
-- role under RLS) can write. Tighten alongside the other tables when
-- auth is re-enabled.
drop policy if exists "Dev: anyone can insert vehicle activity" on public.vehicle_activity;
create policy "Dev: anyone can insert vehicle activity" on public.vehicle_activity
  for insert with check (true);
