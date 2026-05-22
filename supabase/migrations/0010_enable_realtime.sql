-- Add the app's tables to the `supabase_realtime` publication so the
-- web client can subscribe to live row-level changes (INSERT/UPDATE/
-- DELETE) via Supabase Realtime.
--
-- Wrapped in a DO block that checks pg_publication_tables first so
-- the migration is idempotent — re-running it is a no-op even if a
-- table is already in the publication.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'vehicles'
  ) then
    alter publication supabase_realtime add table public.vehicles;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'vehicle_items'
  ) then
    alter publication supabase_realtime add table public.vehicle_items;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'vehicle_issues'
  ) then
    alter publication supabase_realtime add table public.vehicle_issues;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'vehicle_photos'
  ) then
    alter publication supabase_realtime add table public.vehicle_photos;
  end if;
end $$;
