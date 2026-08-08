import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PRINT_DIALOG_WATCHDOG_MS,
  PRINT_PAINT_DELAY_MS,
  requestPrint,
  type PrintOutcome,
} from "./print";

function makeHost(print?: () => void) {
  const handlers = new Map<string, Set<() => void>>();
  return {
    print,
    addEventListener(type: string, handler: () => void) {
      const set = handlers.get(type) ?? new Set();
      set.add(handler);
      handlers.set(type, set);
    },
    removeEventListener(type: string, handler: () => void) {
      handlers.get(type)?.delete(handler);
    },
    dispatch(type: string) {
      for (const handler of handlers.get(type) ?? []) handler();
    },
    listenerCount() {
      let total = 0;
      for (const set of handlers.values()) total += set.size;
      return total;
    },
  };
}

describe("requestPrint", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("reports printed when the browser announces the dialog", () => {
    const outcomes: PrintOutcome[] = [];
    const host = makeHost(() => {
      host.dispatch("beforeprint");
    });

    requestPrint(host, (o) => outcomes.push(o));
    vi.advanceTimersByTime(PRINT_PAINT_DELAY_MS);
    expect(outcomes).toEqual([]);

    host.dispatch("afterprint");
    expect(outcomes).toEqual(["printed"]);

    // The watchdog must not second-guess a print that already ran.
    vi.advanceTimersByTime(PRINT_DIALOG_WATCHDOG_MS * 2);
    expect(outcomes).toEqual(["printed"]);
  });

  it("reports blocked when print() silently does nothing (WebViews)", () => {
    const outcomes: PrintOutcome[] = [];
    const print = vi.fn();
    const host = makeHost(print);

    requestPrint(host, (o) => outcomes.push(o));
    vi.advanceTimersByTime(PRINT_PAINT_DELAY_MS);
    expect(print).toHaveBeenCalledOnce();
    expect(outcomes).toEqual([]);

    vi.advanceTimersByTime(PRINT_DIALOG_WATCHDOG_MS);
    expect(outcomes).toEqual(["blocked"]);
  });

  it("reports printed when print() blocks on a dialog without events", () => {
    const outcomes: PrintOutcome[] = [];
    const host = makeHost(() => {
      vi.setSystemTime(Date.now() + 4000);
    });

    requestPrint(host, (o) => outcomes.push(o));
    vi.advanceTimersByTime(PRINT_PAINT_DELAY_MS);
    expect(outcomes).toEqual(["printed"]);
  });

  it("reports blocked when printing is unavailable or throws", () => {
    const missing: PrintOutcome[] = [];
    requestPrint(makeHost(undefined), (o) => missing.push(o));
    vi.advanceTimersByTime(PRINT_PAINT_DELAY_MS);
    expect(missing).toEqual(["blocked"]);

    const throwing: PrintOutcome[] = [];
    requestPrint(
      makeHost(() => {
        throw new Error("nope");
      }),
      (o) => throwing.push(o),
    );
    vi.advanceTimersByTime(PRINT_PAINT_DELAY_MS);
    expect(throwing).toEqual(["blocked"]);
  });

  it("never reports twice, and stops reporting once cleaned up", () => {
    const outcomes: PrintOutcome[] = [];
    const host = makeHost(vi.fn());

    const stop = requestPrint(host, (o) => outcomes.push(o));
    vi.advanceTimersByTime(PRINT_PAINT_DELAY_MS + PRINT_DIALOG_WATCHDOG_MS);
    expect(outcomes).toEqual(["blocked"]);

    host.dispatch("afterprint");
    expect(outcomes).toEqual(["blocked"]);

    stop();
    expect(host.listenerCount()).toBe(0);
  });

  it("prints nothing when cleaned up before the paint delay elapses", () => {
    const outcomes: PrintOutcome[] = [];
    const print = vi.fn();
    const host = makeHost(print);

    requestPrint(host, (o) => outcomes.push(o))();
    vi.advanceTimersByTime(PRINT_PAINT_DELAY_MS + PRINT_DIALOG_WATCHDOG_MS);
    expect(print).not.toHaveBeenCalled();
    expect(outcomes).toEqual([]);
    expect(host.listenerCount()).toBe(0);
  });
});
