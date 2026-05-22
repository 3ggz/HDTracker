-- Capture the actor's email on each activity row so the history view
-- can show a real name (derived from the email's local-part) without
-- joining auth.users at fetch time and without setting up a profiles
-- table yet.
--
-- The four trigger functions are updated to populate the new column
-- via `auth.jwt() ->> 'email'`. We read from the JWT claims rather
-- than joining auth.users so the functions don't need elevated
-- privileges. When the trigger runs outside an authenticated request
-- (SQL Editor, service-role call), the JWT is absent and the column
-- stays null — the UI renders that as "Anonymous".

alter table public.vehicle_activity
  add column if not exists user_email text;

create or replace function public.log_vehicle_item_activity()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.vehicle_activity (
      vehicle_id, action, subject_type, subject_label, details,
      user_id, user_email
    )
    values (
      new.vehicle_id,
      'added',
      new.category,
      new.name,
      jsonb_build_object('quantity', new.quantity_text),
      auth.uid(),
      auth.jwt() ->> 'email'
    );
    return new;
  elsif tg_op = 'UPDATE' then
    if old.name is distinct from new.name
       or old.quantity_text is distinct from new.quantity_text then
      insert into public.vehicle_activity (
        vehicle_id, action, subject_type, subject_label, details,
        user_id, user_email
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
        auth.uid(),
        auth.jwt() ->> 'email'
      );
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.vehicle_activity (
      vehicle_id, action, subject_type, subject_label, details,
      user_id, user_email
    )
    values (
      old.vehicle_id,
      'removed',
      old.category,
      old.name,
      jsonb_build_object('last_quantity', old.quantity_text),
      auth.uid(),
      auth.jwt() ->> 'email'
    );
    return old;
  end if;
  return null;
end;
$$;

create or replace function public.log_vehicle_issue_activity()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.vehicle_activity (
      vehicle_id, action, subject_type, subject_label,
      user_id, user_email
    )
    values (
      new.vehicle_id, 'added', 'issue', new.body,
      auth.uid(), auth.jwt() ->> 'email'
    );
    return new;
  elsif tg_op = 'UPDATE' then
    if old.resolved_at is null and new.resolved_at is not null then
      insert into public.vehicle_activity (
        vehicle_id, action, subject_type, subject_label,
        user_id, user_email
      )
      values (
        new.vehicle_id, 'resolved', 'issue', new.body,
        auth.uid(), auth.jwt() ->> 'email'
      );
    elsif old.resolved_at is not null and new.resolved_at is null then
      insert into public.vehicle_activity (
        vehicle_id, action, subject_type, subject_label,
        user_id, user_email
      )
      values (
        new.vehicle_id, 'reopened', 'issue', new.body,
        auth.uid(), auth.jwt() ->> 'email'
      );
    elsif old.body is distinct from new.body then
      insert into public.vehicle_activity (
        vehicle_id, action, subject_type, subject_label, details,
        user_id, user_email
      )
      values (
        new.vehicle_id,
        'updated',
        'issue',
        new.body,
        jsonb_build_object('from', old.body, 'to', new.body),
        auth.uid(),
        auth.jwt() ->> 'email'
      );
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.vehicle_activity (
      vehicle_id, action, subject_type, subject_label,
      user_id, user_email
    )
    values (
      old.vehicle_id, 'removed', 'issue', old.body,
      auth.uid(), auth.jwt() ->> 'email'
    );
    return old;
  end if;
  return null;
end;
$$;

create or replace function public.log_vehicle_activity()
returns trigger
language plpgsql
as $$
declare
  only_location_changed boolean;
begin
  if tg_op = 'INSERT' then
    insert into public.vehicle_activity (
      vehicle_id, action, subject_type, subject_label,
      user_id, user_email
    )
    values (
      new.id, 'added', 'vehicle', new.name,
      auth.uid(), auth.jwt() ->> 'email'
    );
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
        vehicle_id, action, subject_type, subject_label,
        user_id, user_email
      )
      values (
        new.id, 'updated', 'location', new.location_label,
        auth.uid(), auth.jwt() ->> 'email'
      );
    else
      insert into public.vehicle_activity (
        vehicle_id, action, subject_type, subject_label,
        user_id, user_email
      )
      values (
        new.id, 'updated', 'vehicle', new.name,
        auth.uid(), auth.jwt() ->> 'email'
      );
    end if;
    return new;
  end if;
  return null;
end;
$$;

create or replace function public.log_vehicle_photo_activity()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.vehicle_activity (
      vehicle_id, action, subject_type, subject_label, details,
      user_id, user_email
    )
    values (
      new.vehicle_id,
      'added',
      'photo',
      new.caption,
      jsonb_build_object('issue_id', new.issue_id, 'storage_path', new.storage_path),
      auth.uid(),
      auth.jwt() ->> 'email'
    );
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.vehicle_activity (
      vehicle_id, action, subject_type, subject_label, details,
      user_id, user_email
    )
    values (
      old.vehicle_id,
      'removed',
      'photo',
      old.caption,
      jsonb_build_object('issue_id', old.issue_id, 'storage_path', old.storage_path),
      auth.uid(),
      auth.jwt() ->> 'email'
    );
    return old;
  end if;
  return null;
end;
$$;
