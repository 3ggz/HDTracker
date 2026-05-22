"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/admin";

export type DeleteResult =
  | { ok: true }
  | { ok: false; error: string };

// Permanently remove a user from auth.users. Cascade-deletes their
// user_approvals row; data they created (vehicles, items, photos)
// stays put with FK columns nulled (already configured on those
// tables' references to auth.users).
//
// Two safety gates before the service-role delete fires:
//   1. The calling session must belong to the admin email.
//   2. The caller cannot target their own user_id.
export async function deleteUserAccount(
  userId: string,
): Promise<DeleteResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isAdminEmail(user?.email)) {
    return { ok: false, error: "Not authorized." };
  }

  if (user?.id === userId) {
    return {
      ok: false,
      error: "You can't delete the admin account from here.",
    };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/approvals");
  return { ok: true };
}
