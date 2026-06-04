"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/admin";
import {
  APPROVAL_EXPIRY_MS,
  PENDING_EXPIRY_MS,
} from "@/lib/admin-resets";

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
  revalidatePath("/admin/approvals");
  return { ok: true };
}

export type DismissResult =
  | { ok: true; deleted: number }
  | { ok: false; error: string };

// Hard-delete a single reset request row. Used by the Dismiss
// button on each pending / waiting / expired row.
export async function dismissPasswordReset(
  requestId: string,
): Promise<DismissResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdminEmail(user?.email)) {
    return { ok: false, error: "Not authorized." };
  }

  // Service-role client because the row has permissive RLS but we
  // also want to make sure we can see the delete count back.
  const admin = createAdminClient();
  const { error, count } = await admin
    .from("password_reset_requests")
    .delete({ count: "exact" })
    .eq("id", requestId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/approvals");
  return { ok: true, deleted: count ?? 0 };
}

// Bulk-purge anything that's currently considered expired by the
// admin page. Same TTLs as the page so what you see really is what
// you're clearing.
export async function clearExpiredPasswordResets(): Promise<DismissResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdminEmail(user?.email)) {
    return { ok: false, error: "Not authorized." };
  }

  const admin = createAdminClient();
  const now = Date.now();
  const pendingCutoff = new Date(now - PENDING_EXPIRY_MS).toISOString();
  const approvalCutoff = new Date(now - APPROVAL_EXPIRY_MS).toISOString();

  let deleted = 0;

  // Stale pending — never approved AND requested too long ago.
  const { error: pendingError, count: pendingCount } = await admin
    .from("password_reset_requests")
    .delete({ count: "exact" })
    .is("approved_at", null)
    .is("fulfilled_at", null)
    .lt("requested_at", pendingCutoff);
  if (pendingError) return { ok: false, error: pendingError.message };
  deleted += pendingCount ?? 0;

  // Stale approvals — approved but the user never used it in time.
  const { error: waitingError, count: waitingCount } = await admin
    .from("password_reset_requests")
    .delete({ count: "exact" })
    .not("approved_at", "is", null)
    .is("fulfilled_at", null)
    .lt("approved_at", approvalCutoff);
  if (waitingError) return { ok: false, error: waitingError.message };
  deleted += waitingCount ?? 0;

  revalidatePath("/admin/approvals");
  return { ok: true, deleted };
}
