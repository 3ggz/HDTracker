import type { SupabaseClient } from "@supabase/supabase-js";
import { guessExtension, validatePhotoFile } from "./vehicle-photos";
import { FAQ_BUCKET } from "./faq-photos";

export type FaqQuestion = {
  id: string;
  title: string;
  body: string | null;
  created_by_id: string | null;
  created_by_email: string | null;
  pinned_answer_id: string | null;
  created_at: string;
  updated_at: string;
};

export type FaqQuestionPhoto = {
  id: string;
  question_id: string;
  storage_path: string;
  position: number;
  uploaded_by: string | null;
  created_at: string;
};

export type FaqAnswer = {
  id: string;
  question_id: string;
  body: string;
  created_by_id: string | null;
  created_by_email: string | null;
  created_at: string;
  updated_at: string;
};

// "mark.hacz@hdsecurity.systems" → "Mark"
// "mark@hdsecurity.systems"      → "Mark"
// null/undefined/blank           → "Anon"
export function firstNameFromEmail(
  email: string | null | undefined,
): string {
  const trimmed = email?.trim();
  if (!trimmed) return "Anon";
  const local = trimmed.split("@")[0]?.trim();
  if (!local) return "Anon";
  const first = local.split(/[._-]+/)[0]?.trim();
  if (!first) return "Anon";
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

// Deterministic pastel-ish hue for the avatar background. Same email
// always returns the same color across devices.
export function avatarColorForEmail(
  email: string | null | undefined,
): string {
  const e = email?.trim() ?? "";
  if (!e) return "hsl(0, 0%, 55%)";
  let hash = 0;
  for (let i = 0; i < e.length; i++) {
    hash = (hash << 5) - hash + e.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 48%)`;
}

type UploadOptions = {
  supabase: SupabaseClient;
  file: File;
  questionId: string;
};

export type UploadFaqQuestionPhotoResult =
  | { ok: true; photo: FaqQuestionPhoto }
  | { ok: false; error: string };

export async function uploadFaqQuestionPhoto({
  supabase,
  file,
  questionId,
}: UploadOptions): Promise<UploadFaqQuestionPhotoResult> {
  const validation = validatePhotoFile(file);
  if (!validation.ok) return validation;

  const photoId = crypto.randomUUID();
  const ext = guessExtension(file);
  const storagePath = `questions/${questionId}/${photoId}${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(FAQ_BUCKET)
    .upload(storagePath, file, { upsert: false, contentType: file.type });

  if (uploadError) return { ok: false, error: uploadError.message };

  const { data, error: insertError } = await supabase
    .from("faq_question_photos")
    .insert({
      id: photoId,
      question_id: questionId,
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

  return { ok: true, photo: data as FaqQuestionPhoto };
}

export async function deleteFaqQuestionPhoto(
  supabase: SupabaseClient,
  photo: FaqQuestionPhoto,
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
    .from("faq_question_photos")
    .delete()
    .eq("id", photo.id)
    .select("id");
  if (dbError) return { ok: false, error: dbError.message };
  if (!data || data.length === 0) {
    return { ok: false, error: "No rows were affected." };
  }
  return { ok: true };
}
