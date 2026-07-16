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

    // Realtime can't fill gaps: iOS suspends the WebView's websocket
    // in the background and missed events are gone for good. Refresh
    // whenever the app comes back to the foreground (throttled so tab
    // switches don't hammer the server).
    let lastVisibleRefresh = 0;
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastVisibleRefresh < 3000) return;
      lastVisibleRefresh = now;
      router.refresh();
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [channelName, table, filter, router]);

  return null;
}
