import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MAX_PHOTO_BYTES,
  normalizeImageForUpload,
} from "./image-normalize";

export const PHOTO_BUCKET = "vehicle-photos";

export { MAX_PHOTO_BYTES };
// What a tech is allowed to PICK, which is not the same as what we
// store. HEIC is accepted here and then converted to JPEG by
// normalizeImageForUpload — Android can't render HEIC, so it must
// never reach a bucket.
export const ALLOWED_PHOTO_MIME_TYPES: readonly string[] = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
  "image/gif",
];

export type VehiclePhoto = {
  id: string;
  vehicle_id: string;
  issue_id: string | null;
  storage_path: string;
  caption: string | null;
  uploaded_by: string | null;
  created_at: string;
};

export type ValidationFailure = { ok: false; error: string };

export function validatePhotoFile(file: {
  name?: string;
  type: string;
  size: number;
}): { ok: true } | ValidationFailure {
  const type = file.type.toLowerCase();
  // Some Android pickers hand over a HEIC with an empty or
  // application/octet-stream MIME type. Rejecting on type alone would
  // lock those phones out of uploading at all, so let the extension
  // vouch for the file — the normalizer decodes it before upload and
  // fails loudly there if it really isn't an image.
  const heicByName = /\.(heic|heif)$/i.test(file.name ?? "");
  if (!type.startsWith("image/") && !heicByName) {
    return { ok: false, error: "Pick an image file." };
  }
  if (!heicByName && !ALLOWED_PHOTO_MIME_TYPES.includes(type)) {
    return {
      ok: false,
      error: `${file.type} isn't supported. Try JPEG, PNG, HEIC, or WebP.`,
    };
  }
  // Deliberately no size check. A 12 MP phone photo can exceed the
  // storage limit, and the normalizer downscales and re-compresses it
  // to fit — telling a tech in a parking lot to "use a smaller
  // picture" asks them to do something their camera app can't.
  return { ok: true };
}

// The MIME type describes the actual bytes; the filename is only a
// hint and routinely lies. iOS Safari transcodes a HEIC to JPEG on
// upload but keeps the original "IMG_1234.HEIC" name, so trusting the
// name filed JPEG bytes under a .heic path. Type first, name as
// fallback for the blobs that arrive with no type at all.
export function guessExtension(file: { name: string; type: string }): string {
  const fromType = extensionForMimeType(file.type);
  if (fromType) return fromType;
  const fromName = file.name.match(/(\.[a-zA-Z0-9]+)$/);
  return fromName ? fromName[1].toLowerCase() : "";
}

function extensionForMimeType(type: string): string {
  switch (type.toLowerCase()) {
    case "image/jpeg":
    case "image/jpg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/heic":
      return ".heic";
    case "image/heif":
      return ".heif";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    default:
      return "";
  }
}

export function buildStoragePath(vehicleId: string, photoId: string, ext: string): string {
  return `${vehicleId}/${photoId}${ext}`;
}

type UploadOptions = {
  supabase: SupabaseClient;
  file: File;
  vehicleId: string;
  issueId?: string | null;
};

export type UploadResult =
  | { ok: true; photo: VehiclePhoto }
  | { ok: false; error: string };

export async function uploadVehiclePhoto({
  supabase,
  file,
  vehicleId,
  issueId = null,
}: UploadOptions): Promise<UploadResult> {
  const validation = validatePhotoFile(file);
  if (!validation.ok) return validation;
  const normalized = await normalizeImageForUpload(file);
  if (!normalized.ok) return normalized;
  file = normalized.file;

  const photoId = crypto.randomUUID();
  const ext = guessExtension(file);
  const storagePath = buildStoragePath(vehicleId, photoId, ext);

  const { error: uploadError } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(storagePath, file, { upsert: false, contentType: file.type });

  if (uploadError) {
    return { ok: false, error: uploadError.message };
  }

  const { data, error: insertError } = await supabase
    .from("vehicle_photos")
    .insert({
      id: photoId,
      vehicle_id: vehicleId,
      issue_id: issueId,
      storage_path: storagePath,
    })
    .select("*")
    .single();

  if (insertError || !data) {
    // DB insert failed after the file landed in storage — clean up the
    // orphaned object so it doesn't waste space forever.
    await supabase.storage.from(PHOTO_BUCKET).remove([storagePath]);
    return {
      ok: false,
      error: insertError?.message ?? "Couldn't save the photo metadata.",
    };
  }

  return { ok: true, photo: data as VehiclePhoto };
}

export async function deleteVehiclePhoto(
  supabase: SupabaseClient,
  photo: VehiclePhoto,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error: storageError } = await supabase.storage
    .from(PHOTO_BUCKET)
    .remove([photo.storage_path]);

  // If the object's already missing (manually deleted, double-tap, etc),
  // keep going so the DB row gets cleaned up too.
  if (
    storageError &&
    !storageError.message.toLowerCase().includes("not found")
  ) {
    return { ok: false, error: storageError.message };
  }

  const { error: dbError } = await supabase
    .from("vehicle_photos")
    .delete()
    .eq("id", photo.id);

  if (dbError) return { ok: false, error: dbError.message };
  return { ok: true };
}

export function publicPhotoUrl(supabaseUrl: string, storagePath: string): string {
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${PHOTO_BUCKET}/${storagePath}`;
}

type UploadItemPhotoOptions = {
  supabase: SupabaseClient;
  file: File;
  vehicleId: string;
  itemId: string;
  oldStoragePath: string | null;
};

export type UploadItemPhotoResult =
  | { ok: true; storage_path: string; uploaded_at: string }
  | { ok: false; error: string };

// Uploads a single photo for a vehicle_items row, updates the row's
// photo_storage_path + photo_uploaded_at, and best-effort deletes
// the prior photo file. Caller is responsible for refreshing local
// state with the returned values.
export async function uploadItemPhoto({
  supabase,
  file,
  vehicleId,
  itemId,
  oldStoragePath,
}: UploadItemPhotoOptions): Promise<UploadItemPhotoResult> {
  const validation = validatePhotoFile(file);
  if (!validation.ok) return validation;
  const normalized = await normalizeImageForUpload(file);
  if (!normalized.ok) return normalized;
  file = normalized.file;

  const photoId = crypto.randomUUID();
  const ext = guessExtension(file);
  const storagePath = `${vehicleId}/items/${photoId}${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(storagePath, file, { upsert: false, contentType: file.type });

  if (uploadError) {
    return { ok: false, error: uploadError.message };
  }

  const uploadedAt = new Date().toISOString();
  const { error: dbError } = await supabase
    .from("vehicle_items")
    .update({
      photo_storage_path: storagePath,
      photo_uploaded_at: uploadedAt,
    })
    .eq("id", itemId);

  if (dbError) {
    // Roll back the orphaned storage object so we don't leak bytes.
    await supabase.storage.from(PHOTO_BUCKET).remove([storagePath]);
    return { ok: false, error: dbError.message };
  }

  // Best-effort delete of the prior photo. If it fails (already gone,
  // perms issue), we still return success — the row now references
  // the new file correctly.
  if (oldStoragePath) {
    await supabase.storage.from(PHOTO_BUCKET).remove([oldStoragePath]);
  }

  return { ok: true, storage_path: storagePath, uploaded_at: uploadedAt };
}
