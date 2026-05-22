-- Per-item single photo: each hardware/tool row gets at most one
-- photo (newest replaces older), with the upload timestamp tracked
-- alongside it.
--
-- The image bytes live in the existing `vehicle-photos` Storage
-- bucket under a `<vehicle_id>/items/<photo_id>.<ext>` path. The
-- bucket and its access policies are already set up by migration
-- 0007.

alter table public.vehicle_items
  add column if not exists photo_storage_path text,
  add column if not exists photo_uploaded_at timestamptz;
