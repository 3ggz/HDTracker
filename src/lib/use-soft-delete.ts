"use client";

import { useEffect, useRef, useState } from "react";

// Generic "soft delete with undo" state machine. Used by every list
// in JobDetailClient that has a destructive button — photos, door
// items, extras, panel-door links, manual workers, etc. — so the
// confirm + undo experience stays identical wherever a user might
// accidentally tap the wrong thing.
//
// Lifecycle per item:
//   1. arm(id)         → user tapped the destructive button once;
//                        UI should switch that row's button to a
//                        red "Confirm?" pill. Auto-disarms after
//                        `confirmTtlMs` (default 3 s) so an
//                        accidental tap doesn't linger.
//   2. confirm(item)   → second tap. The delete fn runs; on success
//                        we optimistically remove from the parent's
//                        state and stash the snapshot for undo.
//   3. undo() | timer  → an Undo banner is visible for
//                        `undoTtlMs` (default 8 s). Tapping Undo
//                        runs `restore`, putting the row back.
//                        After the timer elapses the snapshot is
//                        dropped and the row stays gone.
//
// All timers are cleared on unmount so a stale callback can't fire
// against a dead component.
export type SoftDeleteResult = { ok: true } | { ok: false; error: string };

export type SoftDeleteOptions<T extends { id: string }> = {
  delete: (item: T) => Promise<SoftDeleteResult>;
  restore: (
    item: T,
  ) => Promise<
    | { ok: true; restored: T }
    | { ok: false; error: string }
  >;
  onOptimisticRemove: (id: string) => void;
  onRestore: (item: T) => void;
  confirmTtlMs?: number;
  undoTtlMs?: number;
};

export function useSoftDelete<T extends { id: string }>(
  options: SoftDeleteOptions<T>,
) {
  // Stash the latest options in a ref so the timers (which capture
  // their closure at arm/confirm time) always invoke today's
  // callbacks, not the ones from the render they fired in. Keeps
  // the public API stable while letting callers pass inline arrow
  // functions without thrashing the hook's internals. Writing the
  // ref inside an effect (not render) keeps the React 19 hook lint
  // rules happy.
  const optsRef = useRef(options);
  useEffect(() => {
    optsRef.current = options;
  });

  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [recentlyDeleted, setRecentlyDeleted] = useState<T | null>(null);
  const confirmTimer = useRef<number | null>(null);
  const undoTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (confirmTimer.current) window.clearTimeout(confirmTimer.current);
      if (undoTimer.current) window.clearTimeout(undoTimer.current);
    },
    [],
  );

  function arm(id: string) {
    if (confirmTimer.current) window.clearTimeout(confirmTimer.current);
    setConfirmingId(id);
    confirmTimer.current = window.setTimeout(() => {
      setConfirmingId(null);
      confirmTimer.current = null;
    }, optsRef.current.confirmTtlMs ?? 3000);
  }

  function disarm() {
    if (confirmTimer.current) {
      window.clearTimeout(confirmTimer.current);
      confirmTimer.current = null;
    }
    setConfirmingId(null);
  }

  async function confirm(item: T) {
    disarm();
    const result = await optsRef.current.delete(item);
    if (!result.ok) {
      alert(result.error);
      return;
    }
    optsRef.current.onOptimisticRemove(item.id);
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
    setRecentlyDeleted(item);
    undoTimer.current = window.setTimeout(() => {
      setRecentlyDeleted(null);
      undoTimer.current = null;
    }, optsRef.current.undoTtlMs ?? 8000);
  }

  async function undo() {
    if (!recentlyDeleted) return;
    const snapshot = recentlyDeleted;
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
    undoTimer.current = null;
    setRecentlyDeleted(null);
    const result = await optsRef.current.restore(snapshot);
    if (!result.ok) {
      alert(`Couldn't undo: ${result.error}`);
      // Put the snapshot back so the user can retry.
      setRecentlyDeleted(snapshot);
      return;
    }
    optsRef.current.onRestore(result.restored);
  }

  return {
    confirmingId,
    recentlyDeleted,
    arm,
    disarm,
    confirm,
    undo,
  };
}
