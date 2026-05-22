"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export function PendingApprovalsBanner({
  initialCount,
}: {
  initialCount: number;
}) {
  const [count, setCount] = useState(initialCount);

  useEffect(() => {
    const supabase = createClient();

    async function refreshCount() {
      const { count: nextCount } = await supabase
        .from("user_approvals")
        .select("*", { count: "exact", head: true })
        .is("approved_at", null);
      setCount(nextCount ?? 0);
    }

    // Realtime is the instant path.
    const channel = supabase.channel("admin-approvals-banner");
    channel.on(
      "postgres_changes" as never,
      { event: "*", schema: "public", table: "user_approvals" } as never,
      () => {
        void refreshCount();
      },
    );
    channel.subscribe();

    // Safety-net poll — if Realtime isn't delivering for any reason
    // (publication, RLS, flaky WebSocket), the banner still catches up
    // within a few seconds.
    const interval = setInterval(() => {
      void refreshCount();
    }, 12000);

    return () => {
      clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, []);

  if (count === 0) return null;

  return (
    <Link
      href="/admin/approvals"
      className="block border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 transition active:bg-amber-100 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100 dark:active:bg-amber-950/50"
    >
      <strong>{count}</strong>{" "}
      {count === 1 ? "account" : "accounts"} waiting for approval — tap to
      review →
    </Link>
  );
}
