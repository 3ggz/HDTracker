"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Approval = {
  user_id: string;
  email: string;
  approved_at: string | null;
  created_at: string;
};

export function ApprovalRow({ approval }: { approval: Approval }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onApprove() {
    setPending(true);
    setError(null);
    const supabase = createClient();
    const { error: dbError } = await supabase
      .from("user_approvals")
      .update({ approved_at: new Date().toISOString() })
      .eq("user_id", approval.user_id);

    if (dbError) {
      setError(dbError.message);
      setPending(false);
      return;
    }

    router.refresh();
  }

  const isApproved = !!approval.approved_at;
  const dateLabel = isApproved
    ? `Approved ${formatDate(approval.approved_at!)}`
    : `Signed up ${formatDate(approval.created_at)}`;

  return (
    <li className="rounded-lg border border-neutral-200 px-4 py-3 dark:border-neutral-800">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{approval.email}</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {dateLabel}
          </p>
        </div>
        {isApproved ? (
          <span className="flex-shrink-0 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            Approved
          </span>
        ) : (
          <button
            type="button"
            onClick={onApprove}
            disabled={pending}
            className="flex h-10 flex-shrink-0 items-center justify-center rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white transition active:scale-[0.98] disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900"
          >
            {pending ? "..." : "Approve"}
          </button>
        )}
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
