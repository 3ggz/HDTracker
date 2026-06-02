import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ALLOWED_PHOTO_MIME_TYPES,
  MAX_PHOTO_BYTES,
  guessExtension,
  validatePhotoFile,
} from "./vehicle-photos";

export const JOB_BUCKET = "job-files";

export const MAX_SITE_MAP_BYTES = 25 * 1024 * 1024; // 25 MB
export const ALLOWED_SITE_MAP_MIME_TYPES: readonly string[] = [
  "application/pdf",
];

export type JobPhoto = {
  id: string;
  job_id: string;
  door_id: string | null;
  storage_path: string;
  caption: string | null;
  uploaded_by: string | null;
  created_at: string;
};

export { ALLOWED_PHOTO_MIME_TYPES, MAX_PHOTO_BYTES, validatePhotoFile };

export function publicJobFileUrl(
  supabaseUrl: string,
  storagePath: string,
): string {
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${JOB_BUCKET}/${storagePath}`;
}

type UploadJobPhotoOptions = {
  supabase: SupabaseClient;
  file: File;
  jobId: string;
  doorId?: string | null;
};

export type UploadJobPhotoResult =
  | { ok: true; photo: JobPhoto }
  | { ok: false; error: string };

export async function uploadJobPhoto({
  supabase,
  file,
  jobId,
  doorId = null,
}: UploadJobPhotoOptions): Promise<UploadJobPhotoResult> {
  const validation = validatePhotoFile(file);
  if (!validation.ok) return validation;

  const photoId = crypto.randomUUID();
  const ext = guessExtension(file);
  const storagePath = doorId
    ? `${jobId}/doors/${doorId}/${photoId}${ext}`
    : `${jobId}/${photoId}${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(JOB_BUCKET)
    .upload(storagePath, file, { upsert: false, contentType: file.type });

  if (uploadError) {
    return { ok: false, error: uploadError.message };
  }

  const { data, error: insertError } = await supabase
    .from("job_photos")
    .insert({
      id: photoId,
      job_id: jobId,
      door_id: doorId,
      storage_path: storagePath,
    })
    .select("*")
    .single();

  if (insertError || !data) {
    await supabase.storage.from(JOB_BUCKET).remove([storagePath]);
    return {
      ok: false,
      error: insertError?.message ?? "Couldn't save the photo metadata.",
    };
  }

  return { ok: true, photo: data as JobPhoto };
}

export async function deleteJobPhoto(
  supabase: SupabaseClient,
  photo: JobPhoto,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error: storageError } = await supabase.storage
    .from(JOB_BUCKET)
    .remove([photo.storage_path]);

  if (
    storageError &&
    !storageError.message.toLowerCase().includes("not found")
  ) {
    return { ok: false, error: storageError.message };
  }

  const { error: dbError } = await supabase
    .from("job_photos")
    .delete()
    .eq("id", photo.id);

  if (dbError) return { ok: false, error: dbError.message };
  return { ok: true };
}

type UploadDoorItemPhotoOptions = {
  supabase: SupabaseClient;
  file: File;
  jobId: string;
  doorId: string;
  itemId: string;
  oldStoragePath: string | null;
};

export type UploadDoorItemPhotoResult =
  | { ok: true; storage_path: string; uploaded_at: string }
  | { ok: false; error: string };

export async function uploadDoorItemPhoto({
  supabase,
  file,
  jobId,
  doorId,
  itemId,
  oldStoragePath,
}: UploadDoorItemPhotoOptions): Promise<UploadDoorItemPhotoResult> {
  const validation = validatePhotoFile(file);
  if (!validation.ok) return validation;

  const photoId = crypto.randomUUID();
  const ext = guessExtension(file);
  const storagePath = `${jobId}/doors/${doorId}/items/${photoId}${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(JOB_BUCKET)
    .upload(storagePath, file, { upsert: false, contentType: file.type });

  if (uploadError) return { ok: false, error: uploadError.message };

  const uploadedAt = new Date().toISOString();
  const { error: dbError } = await supabase
    .from("job_door_items")
    .update({
      photo_storage_path: storagePath,
      photo_uploaded_at: uploadedAt,
    })
    .eq("id", itemId);

  if (dbError) {
    await supabase.storage.from(JOB_BUCKET).remove([storagePath]);
    return { ok: false, error: dbError.message };
  }

  if (oldStoragePath) {
    await supabase.storage.from(JOB_BUCKET).remove([oldStoragePath]);
  }

  return { ok: true, storage_path: storagePath, uploaded_at: uploadedAt };
}

export function validateSiteMapFile(file: {
  type: string;
  size: number;
}): { ok: true } | { ok: false; error: string } {
  const type = file.type.toLowerCase();
  if (!ALLOWED_SITE_MAP_MIME_TYPES.includes(type)) {
    return { ok: false, error: "Site map must be a PDF." };
  }
  if (file.size > MAX_SITE_MAP_BYTES) {
    return { ok: false, error: "PDF is over 25 MB. Try a smaller file." };
  }
  return { ok: true };
}

type UploadSiteMapOptions = {
  supabase: SupabaseClient;
  file: File;
  jobId: string;
  oldStoragePath: string | null;
};

export type UploadSiteMapResult =
  | { ok: true; storage_path: string; uploaded_at: string }
  | { ok: false; error: string };

export async function uploadSiteMap({
  supabase,
  file,
  jobId,
  oldStoragePath,
}: UploadSiteMapOptions): Promise<UploadSiteMapResult> {
  const validation = validateSiteMapFile(file);
  if (!validation.ok) return validation;

  const fileId = crypto.randomUUID();
  const storagePath = `${jobId}/site-map/${fileId}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from(JOB_BUCKET)
    .upload(storagePath, file, {
      upsert: false,
      contentType: "application/pdf",
    });

  if (uploadError) return { ok: false, error: uploadError.message };

  const uploadedAt = new Date().toISOString();
  const { error: dbError } = await supabase
    .from("jobs")
    .update({
      site_map_path: storagePath,
      site_map_uploaded_at: uploadedAt,
    })
    .eq("id", jobId);

  if (dbError) {
    await supabase.storage.from(JOB_BUCKET).remove([storagePath]);
    return { ok: false, error: dbError.message };
  }

  if (oldStoragePath) {
    await supabase.storage.from(JOB_BUCKET).remove([oldStoragePath]);
  }

  return { ok: true, storage_path: storagePath, uploaded_at: uploadedAt };
}

export async function deleteSiteMap(
  supabase: SupabaseClient,
  jobId: string,
  storagePath: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error: storageError } = await supabase.storage
    .from(JOB_BUCKET)
    .remove([storagePath]);

  if (
    storageError &&
    !storageError.message.toLowerCase().includes("not found")
  ) {
    return { ok: false, error: storageError.message };
  }

  const { error: dbError } = await supabase
    .from("jobs")
    .update({ site_map_path: null, site_map_uploaded_at: null })
    .eq("id", jobId);

  if (dbError) return { ok: false, error: dbError.message };
  return { ok: true };
}

// Panel photo: one photo per panel row, replace-on-upload, with the
// upload timestamp tracked so the UI can show "uploaded N hours ago".
type UploadPanelPhotoOptions = {
  supabase: SupabaseClient;
  file: File;
  jobId: string;
  panelId: string;
  oldStoragePath: string | null;
};

export type UploadPanelPhotoResult =
  | { ok: true; storage_path: string; uploaded_at: string }
  | { ok: false; error: string };

export async function uploadPanelPhoto({
  supabase,
  file,
  jobId,
  panelId,
  oldStoragePath,
}: UploadPanelPhotoOptions): Promise<UploadPanelPhotoResult> {
  const validation = validatePhotoFile(file);
  if (!validation.ok) return validation;

  const photoId = crypto.randomUUID();
  const ext = guessExtension(file);
  const storagePath = `${jobId}/panels/${panelId}/${photoId}${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(JOB_BUCKET)
    .upload(storagePath, file, { upsert: false, contentType: file.type });

  if (uploadError) return { ok: false, error: uploadError.message };

  const uploadedAt = new Date().toISOString();
  const { error: dbError } = await supabase
    .from("job_panels")
    .update({
      photo_storage_path: storagePath,
      photo_uploaded_at: uploadedAt,
    })
    .eq("id", panelId);

  if (dbError) {
    await supabase.storage.from(JOB_BUCKET).remove([storagePath]);
    return { ok: false, error: dbError.message };
  }

  if (oldStoragePath) {
    await supabase.storage.from(JOB_BUCKET).remove([oldStoragePath]);
  }

  return { ok: true, storage_path: storagePath, uploaded_at: uploadedAt };
}
