"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Subscribes to this user's user_approvals row so the moment an admin
// flips their approved_at, the pending-approval page re-renders and
// the server redirects them to "/".
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

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, router]);

  return null;
}
