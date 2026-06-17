-- Let the primary site map carry a label too, same way extras do.
-- The dropdown UI in JobDetailClient already supports renaming
-- extras inline; this column unlocks the same flow for the
-- primary so it doesn't have to permanently read as
-- "Primary (annotatable)".

alter table public.jobs
  add column if not exists site_map_label text;
