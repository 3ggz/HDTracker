"use client";

// Tiny shared "X deleted [Undo]" toast. Same look as the existing
// door-delete banner so every undoable destructive action in the
// editor reads the same way. Sized to slot into whatever section
// just removed something; not fixed-position so multiple banners
// across the page don't stack.
export function UndoBanner({
  message,
  onUndo,
}: {
  message: string;
  onUndo: () => void;
}) {
  return (
    <div className="mt-2 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
      <svg
        className="h-3.5 w-3.5 flex-shrink-0 text-amber-700 dark:text-amber-400"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      </svg>
      <span className="flex-1">{message}</span>
      <button
        type="button"
        onClick={onUndo}
        className="h-7 rounded-md bg-amber-600 px-2 text-[11px] font-semibold text-white shadow active:scale-95"
      >
        Undo
      </button>
    </div>
  );
}
