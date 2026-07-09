"use client";

import { useEffect, useState, type RefObject } from "react";

// Viewport-space rect of a dropdown's trigger, live-updated while
// the menu is open. Dropdown menus render into a document.body
// portal (position: fixed) so no ancestor stacking context or
// overflow clip can swallow them — glass theme cards carry
// backdrop-filter, which makes every card its own stacking context
// and paints later siblings over any in-card z-index. The portal +
// this rect is the only arrangement that is genuinely always on top.
export function useAnchorRect(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!open) return;
    const update = () =>
      setRect(anchorRef.current?.getBoundingClientRect() ?? null);
    update();
    // Capture-phase scroll so scrolls inside nested containers also
    // reposition the menu instead of leaving it stranded.
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      // Reset in cleanup so a reopen can't paint one frame at the
      // previous position before the fresh measurement lands.
      setRect(null);
    };
  }, [open, anchorRef]);

  return rect;
}
