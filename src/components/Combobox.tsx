"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAnchorRect } from "@/lib/use-anchor-rect";

type Props = {
  value: string;
  onChange: (value: string) => void;
  suggestions: readonly string[];
  placeholder?: string;
  className?: string;
  autoCapitalize?:
    | "off"
    | "none"
    | "on"
    | "sentences"
    | "words"
    | "characters";
  ariaLabel?: string;
};

const MAX_VISIBLE_SUGGESTIONS = 50;

export function Combobox({
  value,
  onChange,
  suggestions,
  placeholder,
  className,
  autoCapitalize,
  ariaLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  // Suggestions portal into document.body — an in-flow absolute list
  // gets clipped/out-stacked by ancestor overflow or backdrop-filter
  // stacking contexts (the glass theme gives every card one).
  const listRef = useRef<HTMLUListElement>(null);
  const listRect = useAnchorRect(open, containerRef);

  const filtered = useMemo(() => {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) return suggestions.slice(0, MAX_VISIBLE_SUGGESTIONS);
    const matches: string[] = [];
    for (const suggestion of suggestions) {
      if (suggestion.toLowerCase().includes(trimmed)) {
        matches.push(suggestion);
        if (matches.length >= MAX_VISIBLE_SUGGESTIONS) break;
      }
    }
    return matches;
  }, [value, suggestions]);

  // Close on outside tap/click. Don't close on input blur — taps on a
  // suggestion blur the input first, which would race with the click
  // handler if we used onBlur.
  useEffect(() => {
    if (!open) return;
    function onDocumentInteract(e: MouseEvent | TouchEvent) {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (listRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocumentInteract);
    document.addEventListener("touchstart", onDocumentInteract, {
      passive: true,
    });
    return () => {
      document.removeEventListener("mousedown", onDocumentInteract);
      document.removeEventListener("touchstart", onDocumentInteract);
    };
  }, [open]);

  // Suggestion selection: use pointerdown + preventDefault so the
  // surrounding input doesn't blur before we apply the value (which
  // on iOS would dismiss the keyboard and could re-flow the layout).
  function selectSuggestion(suggestion: string) {
    onChange(suggestion);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        autoCapitalize={autoCapitalize}
        autoComplete="off"
        aria-label={ariaLabel}
        className={className}
      />
      {open &&
        filtered.length > 0 &&
        listRect &&
        createPortal(
          <ul
            ref={listRef}
            role="listbox"
            style={{
              position: "fixed",
              top: listRect.bottom + 4,
              left: listRect.left,
              width: listRect.width,
            }}
            className="z-50 max-h-48 overflow-auto rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
          >
            {filtered.map((suggestion) => (
              <li
                key={suggestion}
                role="option"
                aria-selected={suggestion === value}
              >
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    selectSuggestion(suggestion);
                  }}
                  className="block w-full px-3 py-2 text-left text-sm transition active:bg-neutral-100 hover:bg-neutral-100 dark:active:bg-neutral-800 dark:hover:bg-neutral-800"
                >
                  {suggestion}
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </div>
  );
}
