export type Theme = "light" | "dark" | "system";

export const STORAGE_KEY = "hd-theme";
// In-tab signal — native storage events only fire cross-tab, so we
// dispatch on this when the user picks a new value to wake any other
// subscribed components in the same tab (e.g. the layout-level sync
// + the toggle button in the header).
export const IN_TAB_EVENT = "hd-theme-change";

const LIGHT_META = "#fafafa";
const DARK_META = "#0a0a0a";

export function readStoredTheme(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark") return v;
  } catch {
    // localStorage unavailable — fall through.
  }
  return "system";
}

export function resolveDark(theme: Theme): boolean {
  if (theme === "dark") return true;
  if (theme === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyTheme(theme: Theme) {
  const wantsDark = resolveDark(theme);
  // Use toggle so a leftover class from a prior session also gets
  // removed when switching to light. classList.add was leaving stale
  // .dark in place on some transitions.
  document.documentElement.classList.toggle("dark", wantsDark);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", wantsDark ? DARK_META : LIGHT_META);
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

export function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  window.addEventListener(IN_TAB_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(IN_TAB_EVENT, callback);
  };
}
