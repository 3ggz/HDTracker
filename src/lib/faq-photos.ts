import type { SupabaseClient } from "@supabase/supabase-js";
import { guessExtension, validatePhotoFile } from "./vehicle-photos";
import type { FaqPhoto } from "./faq";

export const FAQ_BUCKET = "faq-files";

export function publicFaqPhotoUrl(
  supabaseUrl: string,
  storagePath: string,
): string {
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${FAQ_BUCKET}/${storagePath}`;
}

type UploadOptions = {
  supabase: SupabaseClient;
  file: File;
  faqEntryId: string;
};

export type UploadFaqPhotoResult =
  | { ok: true; photo: FaqPhoto }
  | { ok: false; error: string };

export async function uploadFaqPhoto({
  supabase,
  file,
  faqEntryId,
}: UploadOptions): Promise<UploadFaqPhotoResult> {
  const validation = validatePhotoFile(file);
  if (!validation.ok) return validation;

  const photoId = crypto.randomUUID();
  const ext = guessExtension(file);
  const storagePath = `${faqEntryId}/${photoId}${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(FAQ_BUCKET)
    .upload(storagePath, file, { upsert: false, contentType: file.type });

  if (uploadError) return { ok: false, error: uploadError.message };

  const { data, error: insertError } = await supabase
    .from("faq_photos")
    .insert({
      id: photoId,
      faq_entry_id: faqEntryId,
      storage_path: storagePath,
    })
    .select("*")
    .single();

  if (insertError || !data) {
    await supabase.storage.from(FAQ_BUCKET).remove([storagePath]);
    return {
      ok: false,
      error: insertError?.message ?? "Couldn't save the photo metadata.",
    };
  }

  return { ok: true, photo: data as FaqPhoto };
}

export async function deleteFaqPhoto(
  supabase: SupabaseClient,
  photo: FaqPhoto,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error: storageError } = await supabase.storage
    .from(FAQ_BUCKET)
    .remove([photo.storage_path]);
  if (
    storageError &&
    !storageError.message.toLowerCase().includes("not found")
  ) {
    return { ok: false, error: storageError.message };
  }

  const { data, error: dbError } = await supabase
    .from("faq_photos")
    .delete()
    .eq("id", photo.id)
    .select("id");
  if (dbError) return { ok: false, error: dbError.message };
  if (!data || data.length === 0) {
    return { ok: false, error: "No rows were affected." };
  }
  return { ok: true };
}
