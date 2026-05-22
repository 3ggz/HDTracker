"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Drives auto-redirect off the pending-approval screen when the admin
// flips the user's approved_at. Uses two strategies in parallel:
//
//   1. Realtime subscription on the user's user_approvals row — fires
//      instantly when the row changes.
//   2. Polling every 6 seconds — safety net in case Realtime isn't
//      delivering (e.g. the table somehow isn't in the
//      `supabase_realtime` publication, the user's RLS gated the
//      event, a flaky WebSocket).
//
// Both call `router.refresh()`, which is idempotent: the server
// component re-fetches the row and the `if (approved_at) redirect("/")`
// branch fires once approval lands.
const POLL_MS = 6000;

export function PendingApprovalLive({ userId }: { userId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`approval-${userId}`);

    channel.on(
      "postgres_changes" as never,
      {
        event: "UPDATE",
        schema: "public",
        table: "user_approvals",
        filter: `user_id=eq.${userId}`,
      } as never,
      () => {
        router.refresh();
      },
    );

    channel.subscribe();

    const interval = setInterval(() => {
      router.refresh();
    }, POLL_MS);

    return () => {
      clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [userId, router]);

  return null;
}
