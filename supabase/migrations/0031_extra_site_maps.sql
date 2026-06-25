-- Multiple site-map PDFs per job. The primary map still lives on
-- jobs.site_map_path (so the existing /jobs/[id]/map editor + the
-- print toggle keep working unchanged); this table holds any extras
-- the user uploads on top of it.
--
-- Each row gets an optional label so a job with floor plans + a riser
-- diagram reads as "Floor plans", "Riser diagram" instead of three
-- unlabelled buttons. Extras open in a new tab (no editor) — the
-- annotation flow is intentionally scoped to the primary map for now.

create table if not exists public.job_site_maps (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  label text,
  storage_path text not null,
  uploaded_at timestamptz not null default now(),
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists job_site_maps_job_idx
  on public.job_site_maps (job_id, position);

alter table public.job_site_maps enable row level security;

drop policy if exists "permissive" on public.job_site_maps;
create policy "permissive" on public.job_site_maps
  for all
  using (true)
  with check (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'job_site_maps'
  ) then
    alter publication supabase_realtime add table public.job_site_maps;
  end if;
end $$;
