-- Free-form per-vehicle notes (lives on the vehicles row, like
-- `last_worked_job`). Re-creates `log_vehicle_activity` to include
-- `notes` in the distinct-from checks so notes-only changes still
-- get a history entry (logged as a generic vehicle update) and
-- so notes-changes-plus-location are correctly classified as a
-- general vehicle update rather than a pure location update.

alter table public.vehicles add column if not exists notes text;

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
       and old.notes is not distinct from new.notes
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
      and old.notes is not distinct from new.notes
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
