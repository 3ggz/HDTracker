"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";

export type ApproveResult = { ok: true } | { ok: false; error: string };

export async function approvePasswordReset(
  requestId: string,
): Promise<ApproveResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdminEmail(user?.email) || !user) {
    return { ok: false, error: "Not authorized." };
  }

  const { error } = await supabase
    .from("password_reset_requests")
    .update({
      approved_at: new Date().toISOString(),
      approved_by: user.id,
    })
    .eq("id", requestId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/resets");
  return { ok: true };
}
