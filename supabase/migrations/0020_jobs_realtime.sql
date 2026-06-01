-- Add the Jobs tracker tables to the supabase_realtime publication so
-- the editor can subscribe to live row-level changes. Idempotent: the
-- DO block checks pg_publication_tables first.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'jobs'
  ) then
    alter publication supabase_realtime add table public.jobs;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'job_doors'
  ) then
    alter publication supabase_realtime add table public.job_doors;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'job_door_items'
  ) then
    alter publication supabase_realtime add table public.job_door_items;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'job_photos'
  ) then
    alter publication supabase_realtime add table public.job_photos;
  end if;
end $$;
