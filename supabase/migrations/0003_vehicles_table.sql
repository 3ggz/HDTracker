-- Vehicles are the top-level entity in HDTracker. Everything else
-- (inventory, tools, issues, location, last job) hangs off a vehicle.
--
-- RLS is enabled (Supabase default) but the policies are wide-open
-- right now because auth is intentionally disabled while we build out
-- the core features. When auth is re-enabled, tighten these policies
-- to require an authenticated user (and remove the anon role's access).

-- Shared trigger function for keeping updated_at fresh.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  make text,
  model text,
  year integer,
  license_plate text,
  location_label text,
  location_lat double precision,
  location_lng double precision,
  last_worked_job text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_vehicles_updated_at on public.vehicles;
create trigger set_vehicles_updated_at
  before update on public.vehicles
  for each row
  execute function public.set_updated_at();

alter table public.vehicles enable row level security;

drop policy if exists "Dev: anyone can read vehicles" on public.vehicles;
create policy "Dev: anyone can read vehicles" on public.vehicles
  for select using (true);

drop policy if exists "Dev: anyone can insert vehicles" on public.vehicles;
create policy "Dev: anyone can insert vehicles" on public.vehicles
  for insert with check (true);

drop policy if exists "Dev: anyone can update vehicles" on public.vehicles;
create policy "Dev: anyone can update vehicles" on public.vehicles
  for update using (true) with check (true);

drop policy if exists "Dev: anyone can delete vehicles" on public.vehicles;
create policy "Dev: anyone can delete vehicles" on public.vehicles
  for delete using (true);
