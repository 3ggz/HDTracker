-- Remember how a site map PDF is turned so a sheet only has to be
-- rotated once, by anyone, for the whole crew.
--
-- PdfPanZoomViewer auto-rotates a landscape sheet to fill a portrait
-- container, and the rotate button overrides that — but the choice
-- lived in component state, so it was lost on every remount (switching
-- maps, opening fullscreen, leaving the job).
--
-- Keyed by storage_path rather than adding columns to jobs and
-- job_site_maps, for two reasons:
--   - The primary map lives on jobs.site_map_path and extras live in
--     job_site_maps. One key covers both, so the viewer needs a single
--     lookup and there's no primary-vs-extra branch in the UI.
--   - jobs.updated_at backs the optimistic lock in saveHeader. Writing
--     a rotation into jobs would make every rotate a competing writer
--     against people editing the job header.
--
-- Rows are keyed by the file, not the job, so a replaced PDF simply
-- stops being referenced. Orphans are one narrow row each; not worth
-- a cascade that would fight the undo window on a deleted map.

create table if not exists public.site_map_rotations (
  storage_path text primary key,
  rotation smallint not null check (rotation in (0, 90, 180, 270)),
  updated_at timestamptz not null default now(),
  updated_by_email text
);

alter table public.site_map_rotations enable row level security;

drop policy if exists "permissive" on public.site_map_rotations;
create policy "permissive" on public.site_map_rotations
  for all
  using (true)
  with check (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'site_map_rotations'
  ) then
    alter publication supabase_realtime add table public.site_map_rotations;
  end if;
end $$;
