"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Props = {
  channelName: string;
  table: string;
  filter?: string;
};

// Drops a Supabase Realtime subscription into a server-rendered page.
// Any INSERT / UPDATE / DELETE on the watched table (optionally
// filtered) triggers router.refresh(), which re-runs the page's
// server component and re-renders with fresh data — no full page
// reload, no flash.
//
// Renders nothing visible.
export function LiveUpdater({ channelName, table, filter }: Props) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(channelName);

    channel.on(
      // The supabase-js types for `.on` are restrictive; this is the
      // documented payload shape for postgres_changes.
      "postgres_changes" as never,
      {
        event: "*",
        schema: "public",
        table,
        ...(filter ? { filter } : {}),
      } as never,
      () => {
        router.refresh();
      },
    );

    channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [channelName, table, filter, router]);

  return null;
}
