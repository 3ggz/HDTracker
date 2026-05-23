-- Fix vehicle deletion blowing up with:
--   insert or update on "vehicle_activity" violates foreign key
--   constraint "vehicle_activity_vehicle_id_fkey"
--
-- When a vehicle is deleted, its child rows (vehicle_items,
-- vehicle_issues, vehicle_photos) cascade-delete. Each child's AFTER
-- DELETE trigger then tried to INSERT a "removed X" activity row
-- referencing the now-deleted parent — Postgres rejected the insert
-- on FK grounds and rolled back the whole transaction.
--
-- The cure is a one-line existence check at the top of each child
-- trigger's DELETE branch: if the parent vehicle is no longer there,
-- skip the activity insert (cascade is about to take care of any
-- pre-existing activity rows for this vehicle anyway).
--
-- log_vehicle_activity (on vehicles itself) only handles INSERT and
-- UPDATE — DELETE returns null — so it doesn't need the same guard.

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
    if exists (select 1 from public.vehicles where id = old.vehicle_id) then
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
    end if;
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
    if exists (select 1 from public.vehicles where id = old.vehicle_id) then
      insert into public.vehicle_activity (
        vehicle_id, action, subject_type, subject_label,
        user_id, user_email
      )
      values (
        old.vehicle_id, 'removed', 'issue', old.body,
        auth.uid(), auth.jwt() ->> 'email'
      );
    end if;
    return old;
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
    if exists (select 1 from public.vehicles where id = old.vehicle_id) then
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
    end if;
    return old;
  end if;
  return null;
end;
$$;
