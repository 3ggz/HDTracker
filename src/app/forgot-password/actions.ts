"use server";

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { APPROVAL_EXPIRY_MS } from "@/lib/admin-resets";

// Match the admin-page expiry exactly — what shows as "Expired" on
// the page is what the server refuses to complete.
const APPROVAL_TTL_MS = APPROVAL_EXPIRY_MS;

export type CompleteResult =
  | { ok: true; email: string }
  | { ok: false; error: string };

// Finalise a password reset request. The request must be approved,
// not yet used, and still inside the TTL window. Looks up the auth
// user via the user_approvals mirror (email → user_id) and updates
// their password with the service-role client.
export async function completePasswordReset(
  email: string,
  newPassword: string,
): Promise<CompleteResult> {
  try {
    if (newPassword.length < 8) {
      return { ok: false, error: "Password must be at least 8 characters." };
    }

    const normalizedEmail = email.trim().toLowerCase();
    const supabase = await createClient();
    const { data: reqs, error: reqError } = await supabase
      .from("password_reset_requests")
      .select("id, email, approved_at, fulfilled_at")
      .eq("email", normalizedEmail)
      .order("requested_at", { ascending: false })
      .limit(1);
    if (reqError) return { ok: false, error: reqError.message };
    const req = reqs?.[0];

    if (!req) return { ok: false, error: "No reset request on file." };
    if (!req.approved_at) return { ok: false, error: "Not approved yet." };
    if (req.fulfilled_at) {
      return { ok: false, error: "This reset was already used." };
    }

    const approvedAge = Date.now() - new Date(req.approved_at).getTime();
    if (approvedAge > APPROVAL_TTL_MS) {
      return {
        ok: false,
        error: "Approval expired. Start a new request.",
      };
    }

    // user_approvals has restrictive RLS — only the row's owner (matched
    // via auth.uid()) or the admin can read it. The caller here is
    // unauthenticated (they're trying to reset because they can't log
    // in), so we read through the service-role client to bypass RLS.
    // Safe because we already confirmed an approved, unfulfilled,
    // unexpired reset request exists for this exact email above.
    let admin;
    try {
      admin = createAdminClient();
    } catch (err) {
      return {
        ok: false,
        error:
          err instanceof Error
            ? `Server misconfigured: ${err.message}`
            : "Server misconfigured: service role unavailable.",
      };
    }

    const { data: approval, error: approvalError } = await admin
      .from("user_approvals")
      .select("user_id")
      .eq("email", normalizedEmail)
      .maybeSingle();
    if (approvalError) return { ok: false, error: approvalError.message };
    if (!approval) {
      return { ok: false, error: "Account not found for this email." };
    }

    const { error: updateError } = await admin.auth.admin.updateUserById(
      approval.user_id,
      { password: newPassword },
    );
    if (updateError) return { ok: false, error: updateError.message };

    await supabase
      .from("password_reset_requests")
      .update({ fulfilled_at: new Date().toISOString() })
      .eq("id", req.id);

    return { ok: true, email: req.email };
  } catch (err) {
    // Anything else — network blip, hung admin call, unexpected throw.
    // Surface it instead of letting the client spin on "Saving…".
    console.error("completePasswordReset failed", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unexpected server error.",
    };
  }
}
