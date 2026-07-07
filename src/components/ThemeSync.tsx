"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  applyTheme,
  readStoredStyle,
  readStoredTheme,
  subscribe,
  type Theme,
  type ThemeStyle,
} from "@/lib/theme-utils";

// Runs on every page (mounted in the root layout) and re-applies
// the resolved theme to <html> + the theme-color meta tag whenever
// the stored preference changes. Belt-and-suspenders for the inline
// bootstrap script — that script sets the class before first paint,
// but React's html hydration was clobbering the modification on some
// transitions (leaving the page in a "meta is dark, page is light"
// stuck state). This effect re-establishes the class right after
// hydration, so it can't drift.
//
// Also wires the matchMedia listener so a user in "System" mode sees
// the app flip live when they change their OS theme.
export function ThemeSync() {
  const theme = useSyncExternalStore<Theme>(
    subscribe,
    readStoredTheme,
    () => "system",
  );
  const style = useSyncExternalStore<ThemeStyle>(
    subscribe,
    readStoredStyle,
    () => "standard",
  );

  useEffect(() => {
    applyTheme(theme, style);
  }, [theme, style]);

  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  return null;
}
