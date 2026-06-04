"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  approvePasswordReset,
  dismissPasswordReset,
} from "@/app/admin/resets/actions";

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
  const [pending, setPending] = useState<"approve" | "dismiss" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onApprove() {
    setPending("approve");
    setError(null);
    const result = await approvePasswordReset(request.id);
    setPending(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function onDismiss() {
    setPending("dismiss");
    setError(null);
    const result = await dismissPasswordReset(request.id);
    setPending(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  const isFulfilled = !!request.fulfilled_at;
  const isApproved = !!request.approved_at && !isFulfilled;
  const isPendingApproval = !request.approved_at && !expired;
  // Anything not yet completed can be dismissed — pending, approved-
  // but-waiting, and already-expired all qualify.
  const canDismiss = !isFulfilled;

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
        <div className="flex flex-shrink-0 items-center gap-2">
          {isPendingApproval && (
            <button
              type="button"
              onClick={onApprove}
              disabled={pending !== null}
              className="flex h-10 items-center justify-center rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white transition active:scale-[0.98] disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900"
            >
              {pending === "approve" ? "..." : "Approve"}
            </button>
          )}
          {canDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              disabled={pending !== null}
              aria-label="Dismiss request"
              className="flex h-10 w-10 items-center justify-center rounded-lg text-neutral-400 active:bg-neutral-100 active:text-red-600 disabled:opacity-50 dark:active:bg-neutral-800 dark:active:text-red-400"
            >
              {pending === "dismiss" ? (
                "…"
              ) : (
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              )}
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
    hour: "numeric",
    minute: "2-digit",
  });
}
