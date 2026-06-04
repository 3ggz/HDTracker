"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { clearExpiredPasswordResets } from "@/app/admin/resets/actions";

export function ClearExpiredResetsButton({ count }: { count: number }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClear() {
    if (
      !confirm(
        `Permanently delete ${count} expired reset ${count === 1 ? "request" : "requests"}?`,
      )
    )
      return;
    setPending(true);
    setError(null);
    const result = await clearExpiredPasswordResets();
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      {error && (
        <span className="text-[11px] text-red-600 dark:text-red-400">
          {error}
        </span>
      )}
      <button
        type="button"
        onClick={onClear}
        disabled={pending || count === 0}
        className="h-8 rounded-md border border-neutral-300 px-2 text-[11px] font-medium text-neutral-700 transition active:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:active:bg-neutral-800"
      >
        {pending ? "Clearing…" : "Clear all"}
      </button>
    </div>
  );
}
