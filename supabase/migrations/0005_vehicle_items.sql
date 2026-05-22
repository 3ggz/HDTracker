-- Per-vehicle hardware and tools.
--
-- The category field keeps the essentials together while letting the UI
-- present them as separate collapsible lists. Quantity remains flexible:
-- "50", "1 roll", "Well stocked", or any descriptor that fits the van.
--
-- RLS mirrors the current auth-off dev posture. Tighten these policies
-- with public.vehicles when auth is re-enabled.

create table if not exists public.vehicle_items (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  category text not null check (category in ('hardware', 'tool')),
  name text not null,
  quantity_text text not null default 'Has some',
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_items_name_not_blank check (btrim(name) <> ''),
  constraint vehicle_items_quantity_not_blank check (btrim(quantity_text) <> '')
);

create index if not exists vehicle_items_vehicle_category_idx
  on public.vehicle_items (vehicle_id, category, display_order, created_at);

drop trigger if exists set_vehicle_items_updated_at on public.vehicle_items;
create trigger set_vehicle_items_updated_at
  before update on public.vehicle_items
  for each row
  execute function public.set_updated_at();

create or replace function public.touch_vehicle_from_item()
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

drop trigger if exists touch_vehicle_from_item on public.vehicle_items;
create trigger touch_vehicle_from_item
  after insert or update or delete on public.vehicle_items
  for each row
  execute function public.touch_vehicle_from_item();

alter table public.vehicle_items enable row level security;

drop policy if exists "Dev: anyone can read vehicle items" on public.vehicle_items;
create policy "Dev: anyone can read vehicle items" on public.vehicle_items
  for select using (true);

drop policy if exists "Dev: anyone can insert vehicle items" on public.vehicle_items;
create policy "Dev: anyone can insert vehicle items" on public.vehicle_items
  for insert with check (true);

drop policy if exists "Dev: anyone can update vehicle items" on public.vehicle_items;
create policy "Dev: anyone can update vehicle items" on public.vehicle_items
  for update using (true) with check (true);

drop policy if exists "Dev: anyone can delete vehicle items" on public.vehicle_items;
create policy "Dev: anyone can delete vehicle items" on public.vehicle_items
  for delete using (true);
