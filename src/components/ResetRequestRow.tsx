"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { approvePasswordReset } from "@/app/admin/resets/actions";

type ResetRequest = {
  id: string;
  email: string;
  requested_at: string;
  approved_at: string | null;
  fulfilled_at: string | null;
};

export function ResetRequestRow({
  request,
  expired = false,
}: {
  request: ResetRequest;
  expired?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onApprove() {
    setPending(true);
    setError(null);
    const result = await approvePasswordReset(request.id);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  const isFulfilled = !!request.fulfilled_at;
  const isApproved = !!request.approved_at && !isFulfilled;
  const isPendingApproval = !request.approved_at && !expired;

  const statusLabel = isFulfilled
    ? `Completed ${formatDate(request.fulfilled_at!)}`
    : isApproved
      ? `Approved ${formatDate(request.approved_at!)} — waiting for user`
      : expired
        ? `Expired — requested ${formatDate(request.requested_at)}`
        : `Requested ${formatDate(request.requested_at)}`;

  const statusColor = isFulfilled
    ? "text-emerald-600 dark:text-emerald-400"
    : isApproved
      ? "text-amber-600 dark:text-amber-400"
      : expired
        ? "text-neutral-400 dark:text-neutral-500"
        : "text-neutral-500 dark:text-neutral-400";

  return (
    <li
      className={
        "rounded-lg border px-4 py-3 " +
        (expired
          ? "border-neutral-200 bg-neutral-50 opacity-70 dark:border-neutral-800 dark:bg-neutral-950"
          : "border-neutral-200 dark:border-neutral-800")
      }
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p
            className={
              "truncate text-sm font-medium " +
              (expired
                ? "text-neutral-500 line-through dark:text-neutral-500"
                : "")
            }
          >
            {request.email}
          </p>
          <p className={`text-xs ${statusColor}`}>{statusLabel}</p>
        </div>
        {isPendingApproval && (
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
    hour: "numeric",
    minute: "2-digit",
  });
}
