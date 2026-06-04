"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "hd-theme";
// In-tab signal that something updated the theme — native storage
// events only fire cross-tab, so we dispatch on this when the user
// picks a new value to wake any subscribed components in the same tab.
const IN_TAB_EVENT = "hd-theme-change";

function readStoredTheme(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark") return v;
  } catch {
    // localStorage unavailable (private mode etc) — fall through.
  }
  return "system";
}

function applyTheme(theme: Theme) {
  const wantsDark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", wantsDark);
}

function persistTheme(theme: Theme) {
  try {
    if (theme === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(IN_TAB_EVENT));
}

function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  window.addEventListener(IN_TAB_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(IN_TAB_EVENT, callback);
  };
}

export function ThemeToggle() {
  // useSyncExternalStore is the React 19 pattern for "state lives
  // in localStorage" — no setState-in-effect dance, and it handles
  // SSR cleanly via the third arg (always "system" on the server
  // so hydration matches before the inline bootstrap script's
  // effect on <html> ).
  const theme = useSyncExternalStore<Theme>(
    subscribe,
    readStoredTheme,
    () => "system",
  );
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // When the user picks "system", track OS theme changes live so
  // toggling dark mode in macOS / Windows / Android settings flips
  // the app without requiring a reload.
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  // Dismiss the popover on outside tap.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent | TouchEvent) {
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      if (!wrapper.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open]);

  function pick(next: Theme) {
    persistTheme(next);
    applyTheme(next);
    setOpen(false);
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        aria-label="Theme"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-md text-neutral-600 transition active:bg-neutral-100 dark:text-neutral-300 dark:active:bg-neutral-800"
      >
        <ThemeIcon theme={theme} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 w-36 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-neutral-800 dark:bg-neutral-900"
        >
          <ThemeOption
            value="light"
            current={theme}
            label="Light"
            onSelect={pick}
          />
          <ThemeOption
            value="dark"
            current={theme}
            label="Dark"
            onSelect={pick}
          />
          <ThemeOption
            value="system"
            current={theme}
            label="System"
            onSelect={pick}
          />
        </div>
      )}
    </div>
  );
}

function ThemeOption({
  value,
  current,
  label,
  onSelect,
}: {
  value: Theme;
  current: Theme;
  label: string;
  onSelect: (theme: Theme) => void;
}) {
  const selected = current === value;
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      onClick={() => onSelect(value)}
      className={
        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition active:bg-neutral-100 dark:active:bg-neutral-800 " +
        (selected
          ? "text-neutral-900 dark:text-neutral-50"
          : "text-neutral-600 dark:text-neutral-300")
      }
    >
      <ThemeIcon theme={value} />
      <span className="flex-1">{label}</span>
      {selected && (
        <svg
          className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </button>
  );
}

function ThemeIcon({ theme }: { theme: Theme }) {
  if (theme === "light") {
    return (
      <svg
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
    );
  }
  if (theme === "dark") {
    return (
      <svg
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    );
  }
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}
