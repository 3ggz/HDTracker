export type Theme = "light" | "dark" | "system";
export type ThemeStyle = "standard" | "glass";

export const STORAGE_KEY = "hd-theme";
export const STYLE_STORAGE_KEY = "hd-theme-style";
// In-tab signal — native storage events only fire cross-tab, so we
// dispatch on this when the user picks a new value to wake any other
// subscribed components in the same tab (e.g. the layout-level sync
// + the toggle button in the header).
export const IN_TAB_EVENT = "hd-theme-change";

const LIGHT_META = "#fafafa";
const DARK_META = "#0a0a0a";
// Glass surfaces sit on an ambient tinted gradient — the browser
// chrome should blend into its top edge, not the standard neutrals.
const GLASS_LIGHT_META = "#e8edf7";
const GLASS_DARK_META = "#0b1020";

export function readStoredTheme(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark") return v;
  } catch {
    // localStorage unavailable — fall through.
  }
  return "system";
}

export function readStoredStyle(): ThemeStyle {
  try {
    if (localStorage.getItem(STYLE_STORAGE_KEY) === "glass") return "glass";
  } catch {
    // localStorage unavailable — fall through.
  }
  return "standard";
}

export function resolveDark(theme: Theme): boolean {
  if (theme === "dark") return true;
  if (theme === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyTheme(theme: Theme, style?: ThemeStyle) {
  const wantsDark = resolveDark(theme);
  const wantsGlass = (style ?? readStoredStyle()) === "glass";
  // Use toggle so a leftover class from a prior session also gets
  // removed when switching to light. classList.add was leaving stale
  // .dark in place on some transitions.
  document.documentElement.classList.toggle("dark", wantsDark);
  document.documentElement.classList.toggle("glass", wantsGlass);

  // iOS Safari and several Android browsers don't repaint the
  // browser chrome when theme-color's content attribute is mutated
  // in place — they only pick up a new value when the tag itself is
  // (re-)inserted. So we wipe every existing tag and append a fresh
  // one. Defensive against Next.js generating its own copy too.
  const color = wantsGlass
    ? wantsDark
      ? GLASS_DARK_META
      : GLASS_LIGHT_META
    : wantsDark
      ? DARK_META
      : LIGHT_META;
  document
    .querySelectorAll('meta[name="theme-color"]')
    .forEach((m) => m.remove());
  const meta = document.createElement("meta");
  meta.setAttribute("name", "theme-color");
  meta.setAttribute("content", color);
  document.head.appendChild(meta);
}

export function persistTheme(theme: Theme) {
  try {
    if (theme === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(IN_TAB_EVENT));
}

export function persistStyle(style: ThemeStyle) {
  try {
    if (style === "standard") localStorage.removeItem(STYLE_STORAGE_KEY);
    else localStorage.setItem(STYLE_STORAGE_KEY, style);
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(IN_TAB_EVENT));
}

export function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  window.addEventListener(IN_TAB_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(IN_TAB_EVENT, callback);
  };
}
