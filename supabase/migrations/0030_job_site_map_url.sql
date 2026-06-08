-- Some site maps are too big to upload (or the customer wants the
-- "live" copy hosted in OneDrive / Google Drive / Dropbox so they can
-- swap revisions). Let the job carry an external link in addition to
-- (or instead of) an uploaded PDF.
--
-- The UI uses both fields independently:
--   - Uploaded PDF (site_map_path)  → editor route at /jobs/[id]/map
--   - External URL  (site_map_url)  → "View map" opens the URL in a
--                                     new tab; no annotation editor
--                                     since we can't fetch + re-upload
--                                     a cross-origin file
-- If both are set the editor wins (richer experience); the URL is
-- shown as a separate link.

alter table public.jobs
  add column if not exists site_map_url text;
