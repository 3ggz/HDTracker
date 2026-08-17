export type PrintOutcome = "printed" | "blocked";

type PrintHost = {
  print?: () => void;
  addEventListener: (type: string, handler: () => void) => void;
  removeEventListener: (type: string, handler: () => void) => void;
};

// Let the print-only markup paint before the snapshot is taken.
export const PRINT_PAINT_DELAY_MS = 100;
// How long to wait for a dialog that never announced itself.
export const PRINT_DIALOG_WATCHDOG_MS = 1500;
// A print() call that took at least this long sat behind a dialog a
// human had to dismiss, even on a browser that fires no print events.
export const PRINT_BLOCKING_CALL_MS = 300;

// Fires window.print() and reports back whether a dialog actually
// opened. The Capacitor shells are plain WebViews with no print
// bridge: window.print() exists, returns instantly, and does nothing
// at all — no dialog, no beforeprint, no afterprint. Callers that
// waited on afterprint alone therefore hung forever there, which left
// their print button dead for the rest of the page's life. Exactly one
// outcome is ever reported. Returns a cleanup function.
export function requestPrint(
  host: PrintHost,
  onFinish: (outcome: PrintOutcome) => void,
): () => void {
  let settled = false;
  let dialogOpened = false;
  let watchdog: ReturnType<typeof setTimeout> | undefined;

  const finish = (outcome: PrintOutcome) => {
    if (settled) return;
    settled = true;
    onFinish(outcome);
  };

  const opened = () => {
    dialogOpened = true;
    if (watchdog !== undefined) clearTimeout(watchdog);
  };
  const closed = () => finish("printed");

  host.addEventListener("beforeprint", opened);
  host.addEventListener("afterprint", closed);

  const paint = setTimeout(() => {
    if (typeof host.print !== "function") {
      finish("blocked");
      return;
    }
    const startedAt = Date.now();
    try {
      host.print();
    } catch {
      finish("blocked");
      return;
    }
    // A dialog that announced itself will announce its close too, and
    // tearing the print-only markup down early would leave whatever is
    // still on screen to regenerate the preview from.
    if (dialogOpened) return;
    if (Date.now() - startedAt > PRINT_BLOCKING_CALL_MS) {
      finish("printed");
      return;
    }
    watchdog = setTimeout(() => {
      if (!dialogOpened) finish("blocked");
    }, PRINT_DIALOG_WATCHDOG_MS);
  }, PRINT_PAINT_DELAY_MS);

  return () => {
    clearTimeout(paint);
    if (watchdog !== undefined) clearTimeout(watchdog);
    host.removeEventListener("beforeprint", opened);
    host.removeEventListener("afterprint", closed);
  };
}
