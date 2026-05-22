"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { deleteUserAccount } from "@/app/admin/approvals/actions";

type Approval = {
  user_id: string;
  email: string;
  approved_at: string | null;
  denied_at: string | null;
  created_at: string;
};

type Action = "approve" | "deny" | "delete";

export function ApprovalRow({ approval }: { approval: Approval }) {
  const router = useRouter();
  const [pending, setPending] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function setApprovalState(action: "approve" | "deny") {
    setPending(action);
    setError(null);
    const supabase = createClient();
    const now = new Date().toISOString();
    const payload =
      action === "approve"
        ? { approved_at: now, denied_at: null }
        : { approved_at: null, denied_at: now };

    const { error: dbError } = await supabase
      .from("user_approvals")
      .update(payload)
      .eq("user_id", approval.user_id);

    if (dbError) {
      setError(dbError.message);
      setPending(null);
      return;
    }

    router.refresh();
  }

  async function onConfirmDelete() {
    setPending("delete");
    setError(null);
    const result = await deleteUserAccount(approval.user_id);
    if (!result.ok) {
      setError(result.error);
      setPending(null);
      return;
    }
    // The action calls revalidatePath; refresh picks up the new
    // server-rendered list (this row is gone).
    setConfirmDelete(false);
    router.refresh();
  }

  const isApproved = !!approval.approved_at;
  const isDenied = !!approval.denied_at && !isApproved;
  const isPendingState = !isApproved && !isDenied;

  const statusLabel = isApproved
    ? `Approved ${formatDate(approval.approved_at!)}`
    : isDenied
      ? `Denied ${formatDate(approval.denied_at!)}`
      : `Signed up ${formatDate(approval.created_at)}`;

  const statusColor = isApproved
    ? "text-emerald-600 dark:text-emerald-400"
    : isDenied
      ? "text-red-600 dark:text-red-400"
      : "text-neutral-500 dark:text-neutral-400";

  return (
    <li className="rounded-lg border border-neutral-200 px-4 py-3 dark:border-neutral-800">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{approval.email}</p>
          <p className={`text-xs ${statusColor}`}>{statusLabel}</p>
        </div>
        <div className="flex flex-shrink-0 gap-2">
          {isPendingState && (
            <>
              <button
                type="button"
                onClick={() => setApprovalState("approve")}
                disabled={pending !== null}
                className="flex h-10 items-center justify-center rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white transition active:scale-[0.98] disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900"
              >
                {pending === "approve" ? "..." : "Approve"}
              </button>
              <button
                type="button"
                onClick={() => setApprovalState("deny")}
                disabled={pending !== null}
                className="flex h-10 items-center justify-center rounded-lg border border-red-300 bg-white px-4 text-sm font-medium text-red-600 transition active:scale-[0.98] disabled:opacity-60 dark:border-red-900/60 dark:bg-neutral-900 dark:text-red-400"
              >
                {pending === "deny" ? "..." : "Deny"}
              </button>
            </>
          )}
          {isDenied && !confirmDelete && (
            <>
              <button
                type="button"
                onClick={() => setApprovalState("approve")}
                disabled={pending !== null}
                className="flex h-10 items-center justify-center rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white transition active:scale-[0.98] disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900"
              >
                {pending === "approve" ? "..." : "Approve"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                disabled={pending !== null}
                className="flex h-10 items-center justify-center rounded-lg bg-red-600 px-4 text-sm font-medium text-white transition active:scale-[0.98] disabled:opacity-60"
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      {isDenied && confirmDelete && (
        <div className="mt-3 space-y-2 rounded-lg border border-red-300 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/30">
          <p className="text-sm text-red-900 dark:text-red-100">
            Permanently delete <strong>{approval.email}</strong>? Their
            account is removed from auth and they&apos;ll have to sign up
            again to come back. Data they created (vehicles, items, photos)
            stays put.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              disabled={pending === "delete"}
              className="flex h-10 flex-1 items-center justify-center rounded-lg border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-900 transition active:scale-[0.98] disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirmDelete}
              disabled={pending === "delete"}
              className="flex h-10 flex-1 items-center justify-center rounded-lg bg-red-600 px-4 text-sm font-medium text-white transition active:scale-[0.98] disabled:opacity-60"
            >
              {pending === "delete" ? "Deleting..." : "Yes, delete"}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-2 rounded bg-red-50 px-3 py-1.5 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}
    </li>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
