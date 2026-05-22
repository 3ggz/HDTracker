import type { SupabaseClient } from "@supabase/supabase-js";

export const PHOTO_BUCKET = "vehicle-photos";

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 10 MB
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
  type: string;
  size: number;
}): { ok: true } | ValidationFailure {
  const type = file.type.toLowerCase();
  if (!type.startsWith("image/")) {
    return { ok: false, error: "Pick an image file." };
  }
  if (!ALLOWED_PHOTO_MIME_TYPES.includes(type)) {
    return {
      ok: false,
      error: `${file.type} isn't supported. Try JPEG, PNG, HEIC, or WebP.`,
    };
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return { ok: false, error: "File is over 10 MB. Try a smaller picture." };
  }
  return { ok: true };
}

export function guessExtension(file: { name: string; type: string }): string {
  const fromName = file.name.match(/(\.[a-zA-Z0-9]+)$/);
  if (fromName) return fromName[1].toLowerCase();
  switch (file.type.toLowerCase()) {
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
