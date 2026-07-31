"use client";

import { useState } from "react";
import { Combobox } from "./Combobox";
import { isFloorDirty, normalizeFloor } from "@/lib/floors";

// Pick an existing floor or type a new one. Floors are free text on
// purpose (migration 0018: "3rd floor", "NICU", "Mother-Baby") so a
// plain dropdown of what already exists is a dead end the first time
// gear lands somewhere new — hence the combobox rather than a select.
//
// Tapping a suggestion saves immediately, which is the common case.
// Free text waits for Enter or the Set button: saving per keystroke
// would write "Floor 2" on the way to typing "Floor 20", and on doors
// every write lands in the job's activity log.
export function FloorPicker({
  value,
  floors,
  onCommit,
  ariaLabel,
  className,
}: {
  value: string | null;
  floors: readonly string[];
  onCommit: (floor: string | null) => void;
  ariaLabel: string;
  className?: string;
}) {
  const current = value ?? "";
  const [draft, setDraft] = useState(current);
  // Synced-pair: adopt an outside change (realtime, or a floor rename)
  // without stomping what the user is part-way through typing.
  const [synced, setSynced] = useState(current);
  if (current !== synced) {
    if (draft === synced) setDraft(current);
    setSynced(current);
  }

  const normalized = normalizeFloor(draft);
  const dirty = isFloorDirty(draft, value);

  function commit(next: string | null) {
    if (next !== (value ?? null)) onCommit(next);
  }

  return (
    <div className="flex items-center gap-1">
      <div className="min-w-0 flex-1">
        <Combobox
          value={draft}
          onChange={setDraft}
          onPick={(picked) => commit(picked.trim() || null)}
          onEnter={() => commit(normalized)}
          suggestions={floors}
          placeholder="Unassigned"
          ariaLabel={ariaLabel}
          autoCapitalize="words"
          className={
            className ??
            "h-9 w-full rounded-md border border-neutral-300 bg-white px-2 text-xs text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          }
        />
      </div>
      {dirty && (
        <button
          type="button"
          onClick={() => commit(normalized)}
          className="h-9 shrink-0 rounded-md bg-neutral-900 px-2.5 text-xs font-medium text-white active:scale-95 dark:bg-neutral-100 dark:text-neutral-900"
        >
          Set
        </button>
      )}
    </div>
  );
}
