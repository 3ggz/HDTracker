"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export function PendingResetsBanner({
  initialCount,
}: {
  initialCount: number;
}) {
  const [count, setCount] = useState(initialCount);

  useEffect(() => {
    const supabase = createClient();

    async function refreshCount() {
      const { count: nextCount } = await supabase
        .from("password_reset_requests")
        .select("*", { count: "exact", head: true })
        .is("approved_at", null);
      setCount(nextCount ?? 0);
    }

    const channel = supabase.channel("admin-resets-banner");
    channel.on(
      "postgres_changes" as never,
      { event: "*", schema: "public", table: "password_reset_requests" } as never,
      () => {
        void refreshCount();
      },
    );
    channel.subscribe();

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
      href="/admin/resets"
      className="block border-b border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-900 transition active:bg-sky-100 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-100 dark:active:bg-sky-950/50"
    >
      <strong>{count}</strong>{" "}
      {count === 1 ? "password reset" : "password resets"} waiting — tap to
      approve →
    </Link>
  );
}
