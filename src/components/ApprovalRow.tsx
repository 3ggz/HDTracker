"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Approval = {
  user_id: string;
  email: string;
  approved_at: string | null;
  denied_at: string | null;
  created_at: string;
};

type Action = "approve" | "deny";

export function ApprovalRow({ approval }: { approval: Approval }) {
  const router = useRouter();
  const [pending, setPending] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function setState(action: Action) {
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

  const isApproved = !!approval.approved_at;
  const isDenied = !!approval.denied_at;

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
          {!isApproved && (
            <button
              type="button"
              onClick={() => setState("approve")}
              disabled={pending !== null}
              className="flex h-10 items-center justify-center rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white transition active:scale-[0.98] disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900"
            >
              {pending === "approve" ? "..." : "Approve"}
            </button>
          )}
          {!isDenied && (
            <button
              type="button"
              onClick={() => setState("deny")}
              disabled={pending !== null}
              className="flex h-10 items-center justify-center rounded-lg border border-red-300 bg-white px-4 text-sm font-medium text-red-600 transition active:scale-[0.98] disabled:opacity-60 dark:border-red-900/60 dark:bg-neutral-900 dark:text-red-400"
            >
              {pending === "deny" ? "..." : "Deny"}
            </button>
          )}
        </div>
      </div>
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
