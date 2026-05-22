-- Free-form vehicle issues that technicians can add and resolve.
--
-- RLS mirrors the current dev posture from 0003_vehicles_table.sql:
-- auth is intentionally disabled while the inventory features are built,
-- so anon can read/write for now. When auth is re-enabled, tighten these
-- policies alongside public.vehicles.

create table if not exists public.vehicle_issues (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  body text not null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_issues_body_not_blank check (btrim(body) <> '')
);

create index if not exists vehicle_issues_vehicle_status_idx
  on public.vehicle_issues (vehicle_id, resolved_at, created_at desc);

drop trigger if exists set_vehicle_issues_updated_at on public.vehicle_issues;
create trigger set_vehicle_issues_updated_at
  before update on public.vehicle_issues
  for each row
  execute function public.set_updated_at();

create or replace function public.touch_vehicle_from_issue()
returns trigger
language plpgsql
as $$
declare
  changed_vehicle_id uuid;
begin
  changed_vehicle_id = coalesce(new.vehicle_id, old.vehicle_id);

  update public.vehicles
    set updated_at = now()
    where id = changed_vehicle_id;

  return coalesce(new, old);
end;
$$;

drop trigger if exists touch_vehicle_from_issue on public.vehicle_issues;
create trigger touch_vehicle_from_issue
  after insert or update or delete on public.vehicle_issues
  for each row
  execute function public.touch_vehicle_from_issue();

alter table public.vehicle_issues enable row level security;

drop policy if exists "Dev: anyone can read vehicle issues" on public.vehicle_issues;
create policy "Dev: anyone can read vehicle issues" on public.vehicle_issues
  for select using (true);

drop policy if exists "Dev: anyone can insert vehicle issues" on public.vehicle_issues;
create policy "Dev: anyone can insert vehicle issues" on public.vehicle_issues
  for insert with check (true);

drop policy if exists "Dev: anyone can update vehicle issues" on public.vehicle_issues;
create policy "Dev: anyone can update vehicle issues" on public.vehicle_issues
  for update using (true) with check (true);

drop policy if exists "Dev: anyone can delete vehicle issues" on public.vehicle_issues;
create policy "Dev: anyone can delete vehicle issues" on public.vehicle_issues
  for delete using (true);
