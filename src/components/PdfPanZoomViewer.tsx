"use client";

import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";

// Same worker the full editor uses — committed to /public, no CDN.
if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
}

const MAX_ZOOM = 40;
const BG_MAX_DIM = 2048;

type View = { z: number; ox: number; oy: number };

// Read-only pinch-zoom + pan PDF viewer used for the inline site-map
// preview and (with `multiPage`) the fullscreen modal. Two canvas
// layers: a low-res full-page backdrop that follows every gesture via
// CSS transform, and a container-sized foreground that re-renders the
// visible region at true resolution once a gesture settles. Site maps
// are huge architectural sheets — a single pre-rendered bitmap can't
// hold enough pixels to stay legible at deep zoom (and iOS caps
// canvas sizes), so sharpness has to come from re-rendering the crop,
// not from supersampling up front. Touch (pinch / pan / double-tap),
// trackpad pinch, ctrl+wheel, and mouse drag are all supported so the
// same component behaves on web and inside the Capacitor WebView.
export function PdfPanZoomViewer({
  pdfUrl,
  className,
  multiPage = false,
}: {
  pdfUrl: string;
  className?: string;
  multiPage?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const fgCanvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const docRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const pageRef = useRef<pdfjsLib.PDFPageProxy | null>(null);
  const baseRef = useRef({ w: 1, h: 1 });
  const fitRef = useRef(1);
  const dprRef = useRef(1);
  const sizeRef = useRef({ cw: 320, ch: 240 });
  const view = useRef<View>({ z: 1, ox: 0, oy: 0 });
  const fgView = useRef<View | null>(null);
  const renderSeq = useRef(0);
  const sharpTask = useRef<ReturnType<
    pdfjsLib.PDFPageProxy["render"]
  > | null>(null);
  const bgTask = useRef<ReturnType<pdfjsLib.PDFPageProxy["render"]> | null>(
    null,
  );
  const sharpTimer = useRef<number | null>(null);

  const [numPages, setNumPages] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [docGen, setDocGen] = useState(0);
  const [error, setError] = useState<string | null>(null);

  function clampView(v: View) {
    v.z = Math.min(MAX_ZOOM, Math.max(1, v.z));
    const { cw, ch } = sizeRef.current;
    const w = baseRef.current.w * fitRef.current * v.z;
    const h = baseRef.current.h * fitRef.current * v.z;
    v.ox = w <= cw ? (w - cw) / 2 : Math.min(w - cw, Math.max(0, v.ox));
    v.oy = h <= ch ? (h - ch) / 2 : Math.min(h - ch, Math.max(0, v.oy));
  }

  function applyTransforms() {
    const v = view.current;
    const bg = bgCanvasRef.current;
    if (bg) {
      bg.style.transform = `translate(${-v.ox}px, ${-v.oy}px) scale(${v.z})`;
    }
    const fg = fgCanvasRef.current;
    const f = fgView.current;
    if (fg && f) {
      const r = v.z / f.z;
      fg.style.transform = `translate(${f.ox * r - v.ox}px, ${
        f.oy * r - v.oy
      }px) scale(${r})`;
    }
  }

  function zoomAbout(fx: number, fy: number, zNext: number) {
    const v = view.current;
    const z2 = Math.min(MAX_ZOOM, Math.max(1, zNext));
    const r = z2 / v.z;
    v.ox = (v.ox + fx) * r - fx;
    v.oy = (v.oy + fy) * r - fy;
    v.z = z2;
    clampView(v);
    applyTransforms();
  }

  function setupViewport() {
    const el = containerRef.current;
    const fg = fgCanvasRef.current;
    const bg = bgCanvasRef.current;
    if (!el || !fg || !bg) return;
    const cw = el.clientWidth || 320;
    const ch = el.clientHeight || 240;
    sizeRef.current = { cw, ch };
    const { w, h } = baseRef.current;
    fitRef.current = Math.min(cw / w, ch / h);
    dprRef.current = Math.min(window.devicePixelRatio || 1, 3);
    fg.width = Math.round(cw * dprRef.current);
    fg.height = Math.round(ch * dprRef.current);
    fg.style.width = `${cw}px`;
    fg.style.height = `${ch}px`;
    bg.style.width = `${w * fitRef.current}px`;
    bg.style.height = `${h * fitRef.current}px`;
    view.current = { z: 1, ox: 0, oy: 0 };
    clampView(view.current);
    fgView.current = null;
    applyTransforms();
  }

  async function renderBg() {
    const page = pageRef.current;
    const bg = bgCanvasRef.current;
    if (!page || !bg) return;
    const { w, h } = baseRef.current;
    const bgScale = Math.min(
      BG_MAX_DIM / Math.max(w, h),
      fitRef.current * dprRef.current * 2,
    );
    bg.width = Math.max(1, Math.round(w * bgScale));
    bg.height = Math.max(1, Math.round(h * bgScale));
    const ctx = bg.getContext("2d");
    if (!ctx) return;
    bgTask.current?.cancel();
    const task = page.render({
      canvasContext: ctx,
      viewport: page.getViewport({ scale: bgScale }),
    });
    bgTask.current = task;
    try {
      await task.promise;
    } catch {
      // Cancelled by a page switch, or the page failed — the sharp
      // layer still renders on its own.
    }
  }

  async function renderSharpNow() {
    const page = pageRef.current;
    const fg = fgCanvasRef.current;
    if (!page || !fg) return;
    const seq = ++renderSeq.current;
    sharpTask.current?.cancel();
    const dpr = dprRef.current;
    const v = { ...view.current };
    let off = offscreenRef.current;
    if (!off) {
      off = document.createElement("canvas");
      offscreenRef.current = off;
    }
    if (off.width !== fg.width || off.height !== fg.height) {
      off.width = fg.width;
      off.height = fg.height;
    }
    const ctx = off.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, off.width, off.height);
    const task = page.render({
      canvasContext: ctx,
      viewport: page.getViewport({ scale: fitRef.current * v.z * dpr }),
      transform: [1, 0, 0, 1, -v.ox * dpr, -v.oy * dpr],
    });
    sharpTask.current = task;
    try {
      await task.promise;
    } catch {
      return;
    }
    if (seq !== renderSeq.current) return;
    const fctx = fg.getContext("2d");
    if (!fctx) return;
    const { w, h } = baseRef.current;
    fctx.setTransform(1, 0, 0, 1, 0, 0);
    fctx.clearRect(0, 0, fg.width, fg.height);
    fctx.save();
    fctx.beginPath();
    // Clip to the page bounds so the letterbox stays transparent —
    // pdf.js fills its whole canvas white before drawing.
    fctx.rect(
      -v.ox * dpr,
      -v.oy * dpr,
      w * fitRef.current * v.z * dpr,
      h * fitRef.current * v.z * dpr,
    );
    fctx.clip();
    fctx.drawImage(off, 0, 0);
    fctx.restore();
    fgView.current = v;
    applyTransforms();
  }

  function scheduleSharp(delay = 140) {
    if (sharpTimer.current) window.clearTimeout(sharpTimer.current);
    sharpTimer.current = window.setTimeout(() => {
      sharpTimer.current = null;
      void renderSharpNow();
    }, delay);
  }

  function resetView() {
    view.current = { z: 1, ox: 0, oy: 0 };
    clampView(view.current);
    applyTransforms();
    void renderSharpNow();
  }

  useEffect(() => {
    let cancelled = false;
    const loadingTask = pdfjsLib.getDocument(pdfUrl);
    loadingTask.promise
      .then((doc) => {
        if (cancelled) {
          void doc.destroy();
          return;
        }
        docRef.current = doc;
        setNumPages(doc.numPages);
        setPageNum(1);
        setDocGen((g) => g + 1);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      });
    return () => {
      cancelled = true;
      pageRef.current = null;
      void docRef.current?.destroy();
      docRef.current = null;
    };
  }, [pdfUrl]);

  useEffect(() => {
    const doc = docRef.current;
    if (!doc || docGen === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const page = await doc.getPage(pageNum);
        if (cancelled) return;
        pageRef.current = page;
        const vp = page.getViewport({ scale: 1 });
        baseRef.current = { w: vp.width, h: vp.height };
        setupViewport();
        await renderBg();
        if (cancelled) return;
        await renderSharpNow();
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
      bgTask.current?.cancel();
      sharpTask.current?.cancel();
      if (sharpTimer.current) window.clearTimeout(sharpTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docGen, pageNum]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let timer: number | null = null;
    const ro = new ResizeObserver(() => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        if (!pageRef.current) return;
        const { cw, ch } = sizeRef.current;
        if (
          Math.abs(el.clientWidth - cw) < 8 &&
          Math.abs(el.clientHeight - ch) < 8
        ) {
          return;
        }
        setupViewport();
        void renderBg().then(() => renderSharpNow());
      }, 200);
    });
    ro.observe(el);
    return () => {
      if (timer) window.clearTimeout(timer);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const g = {
      mode: "none" as "none" | "pan" | "pinch",
      moved: false,
      startDist: 0,
      startZ: 1,
      startOx: 0,
      startOy: 0,
      startX: 0,
      startY: 0,
      focalX: 0,
      focalY: 0,
      lastTap: null as { t: number; x: number; y: number } | null,
    };

    const isButton = (t: EventTarget | null) =>
      t instanceof Element && t.closest("button") !== null;

    function armPan(t: Touch) {
      g.mode = view.current.z > 1.001 ? "pan" : "none";
      g.startX = t.clientX;
      g.startY = t.clientY;
      g.startOx = view.current.ox;
      g.startOy = view.current.oy;
    }

    function onTouchStart(e: TouchEvent) {
      if (isButton(e.target)) {
        g.mode = "none";
        return;
      }
      if (e.touches.length >= 2) {
        e.preventDefault();
        const [t1, t2] = [e.touches[0], e.touches[1]];
        const rect = el!.getBoundingClientRect();
        g.mode = "pinch";
        g.moved = false;
        g.startDist = Math.hypot(
          t2.clientX - t1.clientX,
          t2.clientY - t1.clientY,
        );
        g.startZ = view.current.z;
        g.startOx = view.current.ox;
        g.startOy = view.current.oy;
        g.focalX = (t1.clientX + t2.clientX) / 2 - rect.left;
        g.focalY = (t1.clientY + t2.clientY) / 2 - rect.top;
      } else if (e.touches.length === 1) {
        g.moved = false;
        armPan(e.touches[0]);
      }
    }

    function onTouchMove(e: TouchEvent) {
      if (g.mode === "pinch" && e.touches.length >= 2) {
        e.preventDefault();
        g.moved = true;
        const [t1, t2] = [e.touches[0], e.touches[1]];
        const dist = Math.hypot(
          t2.clientX - t1.clientX,
          t2.clientY - t1.clientY,
        );
        const z2 = Math.min(
          MAX_ZOOM,
          Math.max(1, (g.startZ * dist) / g.startDist),
        );
        const r = z2 / g.startZ;
        const v = view.current;
        v.z = z2;
        v.ox = (g.startOx + g.focalX) * r - g.focalX;
        v.oy = (g.startOy + g.focalY) * r - g.focalY;
        clampView(v);
        applyTransforms();
      } else if (g.mode === "pan" && e.touches.length === 1) {
        e.preventDefault();
        const dx = e.touches[0].clientX - g.startX;
        const dy = e.touches[0].clientY - g.startY;
        if (Math.abs(dx) + Math.abs(dy) > 2) g.moved = true;
        const v = view.current;
        v.ox = g.startOx - dx;
        v.oy = g.startOy - dy;
        clampView(v);
        applyTransforms();
      }
    }

    function onTouchEnd(e: TouchEvent) {
      if (e.touches.length > 0) {
        // Pinch dropping to one finger hands off to a pan without a
        // re-render yet — the gesture is still live.
        armPan(e.touches[0]);
        return;
      }
      g.mode = "none";
      if (g.moved) {
        void renderSharpNow();
        g.lastTap = null;
        return;
      }
      if (isButton(e.target)) return;
      const touch = e.changedTouches[0];
      if (!touch) return;
      const rect = el!.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      const now = performance.now();
      if (
        g.lastTap &&
        now - g.lastTap.t < 300 &&
        Math.hypot(x - g.lastTap.x, y - g.lastTap.y) < 30
      ) {
        e.preventDefault();
        g.lastTap = null;
        if (view.current.z > 1.5) {
          view.current = { z: 1, ox: 0, oy: 0 };
          clampView(view.current);
          applyTransforms();
        } else {
          zoomAbout(x, y, 3);
        }
        void renderSharpNow();
      } else {
        g.lastTap = { t: now, x, y };
      }
    }

    function onWheel(e: WheelEvent) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const rect = el!.getBoundingClientRect();
        zoomAbout(
          e.clientX - rect.left,
          e.clientY - rect.top,
          view.current.z * Math.exp(-e.deltaY * 0.01),
        );
        scheduleSharp();
      } else if (view.current.z > 1.001) {
        e.preventDefault();
        const v = view.current;
        v.ox += e.deltaX;
        v.oy += e.deltaY;
        clampView(v);
        applyTransforms();
        scheduleSharp();
      }
    }

    let mouseDrag: { x: number; y: number; ox: number; oy: number } | null =
      null;
    function onMouseDown(e: MouseEvent) {
      if (e.button !== 0 || view.current.z <= 1.001 || isButton(e.target)) {
        return;
      }
      e.preventDefault();
      mouseDrag = {
        x: e.clientX,
        y: e.clientY,
        ox: view.current.ox,
        oy: view.current.oy,
      };
    }
    function onMouseMove(e: MouseEvent) {
      if (!mouseDrag) return;
      const v = view.current;
      v.ox = mouseDrag.ox - (e.clientX - mouseDrag.x);
      v.oy = mouseDrag.oy - (e.clientY - mouseDrag.y);
      clampView(v);
      applyTransforms();
    }
    function onMouseUp() {
      if (!mouseDrag) return;
      mouseDrag = null;
      void renderSharpNow();
    }
    function onDblClick(e: MouseEvent) {
      if (isButton(e.target)) return;
      const rect = el!.getBoundingClientRect();
      if (view.current.z > 1.5) {
        view.current = { z: 1, ox: 0, oy: 0 };
        clampView(view.current);
        applyTransforms();
      } else {
        zoomAbout(e.clientX - rect.left, e.clientY - rect.top, 3);
      }
      void renderSharpNow();
    }

    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("mousedown", onMouseDown);
    el.addEventListener("dblclick", onDblClick);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("mousedown", onMouseDown);
      el.removeEventListener("dblclick", onDblClick);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      data-ptr-exempt
      className={"relative overflow-hidden " + (className ?? "")}
      style={{ touchAction: "none" }}
    >
      {error ? (
        <a
          href={pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-full w-full items-center justify-center p-6 text-center text-sm text-neutral-600 dark:text-neutral-400"
        >
          Couldn&apos;t render the PDF here. Tap to open it.
        </a>
      ) : (
        <>
          <canvas
            ref={bgCanvasRef}
            aria-hidden
            className="absolute left-0 top-0"
            style={{ transformOrigin: "0 0", willChange: "transform" }}
          />
          <canvas
            ref={fgCanvasRef}
            className="absolute left-0 top-0"
            style={{ transformOrigin: "0 0", willChange: "transform" }}
          />
          <button
            type="button"
            onClick={resetView}
            className="absolute right-2 top-2 rounded-md bg-neutral-900/70 px-2 py-1 text-[11px] font-medium text-white backdrop-blur active:bg-neutral-900"
          >
            Reset
          </button>
          {multiPage && numPages > 1 && (
            <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-full bg-neutral-900/70 px-1 py-0.5 text-white backdrop-blur">
              <button
                type="button"
                aria-label="Previous page"
                disabled={pageNum <= 1}
                onClick={() => setPageNum((p) => Math.max(1, p - 1))}
                className="flex h-10 w-10 items-center justify-center rounded-full disabled:opacity-30 active:bg-white/10"
              >
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <span className="px-1 text-xs font-medium tabular-nums">
                {pageNum} / {numPages}
              </span>
              <button
                type="button"
                aria-label="Next page"
                disabled={pageNum >= numPages}
                onClick={() => setPageNum((p) => Math.min(numPages, p + 1))}
                className="flex h-10 w-10 items-center justify-center rounded-full disabled:opacity-30 active:bg-white/10"
              >
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
          )}
          {!multiPage && numPages > 1 && (
            <span className="absolute bottom-2 left-2 rounded bg-neutral-900/70 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur">
              Page 1 / {numPages} · open fullscreen for all
            </span>
          )}
        </>
      )}
    </div>
  );
}
