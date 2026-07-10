"use client";

import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";

// Same worker the full editor uses — committed to /public, no CDN.
if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
}

const MAX_SCALE = 6;

// A contained, read-only pinch-zoom + pan viewer for a site-map PDF's first
// page. touch-action:"none" means the window handles its own gestures and
// never scrolls the page behind it (that's what the fullscreen editor is
// for — the "Open fullscreen" button covers multi-page + annotation). Zoom
// is a GPU CSS transform on the rendered canvas; it's a quick-look preview,
// so a little softness at extreme zoom is fine.
export function PdfPanZoomViewer({
  pdfUrl,
  className,
}: {
  pdfUrl: string;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [numPages, setNumPages] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const view = useRef({ scale: 1, tx: 0, ty: 0 });
  const apply = () => {
    const c = canvasRef.current;
    if (!c) return;
    const { scale, tx, ty } = view.current;
    c.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  };

  // Keep the canvas covering the window: don't let it be dragged so far
  // that a gap opens at an edge.
  const clamp = () => {
    const el = containerRef.current;
    const c = canvasRef.current;
    if (!el || !c) return;
    const v = view.current;
    v.scale = Math.max(1, Math.min(MAX_SCALE, v.scale));
    const maxX = Math.max(0, (c.offsetWidth * v.scale - el.clientWidth) / 2);
    const maxY = Math.max(0, (c.offsetHeight * v.scale - el.clientHeight) / 2);
    v.tx = Math.max(-maxX, Math.min(maxX, v.tx));
    v.ty = Math.max(-maxY, Math.min(maxY, v.ty));
  };

  useEffect(() => {
    let cancelled = false;
    let doc: pdfjsLib.PDFDocumentProxy | null = null;
    (async () => {
      try {
        doc = await pdfjsLib.getDocument(pdfUrl).promise;
        if (cancelled) return;
        setNumPages(doc.numPages);
        const page = await doc.getPage(1);
        if (cancelled) return;
        const el = containerRef.current;
        const canvas = canvasRef.current;
        if (!el || !canvas) return;
        const cw = el.clientWidth || 320;
        const base = page.getViewport({ scale: 1 });
        const fit = cw / base.width;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        // Supersample the bitmap so the map stays sharp when zoomed in
        // (zoom is a CSS transform on this canvas — a low-res bitmap would
        // just get stretched and blur). Fill as much resolution as iOS's
        // canvas limit allows by capping the largest dimension at 4000px.
        const MAX_DIM = 4000;
        const fitScale = fit * dpr;
        const quality = Math.max(
          1,
          Math.min(
            MAX_SCALE,
            MAX_DIM / Math.max(base.width * fitScale, base.height * fitScale),
          ),
        );
        const viewport = page.getViewport({ scale: fitScale * quality });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        // CSS size stays at fit; the extra bitmap pixels are the zoom
        // headroom, revealed crisply as the transform scales up.
        canvas.style.width = `${base.width * fit}px`;
        canvas.style.height = `${base.height * fit}px`;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        await page.render({ canvasContext: ctx, viewport }).promise;
        view.current = { scale: 1, tx: 0, ty: 0 };
        apply();
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
      doc?.destroy();
    };
  }, [pdfUrl]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const g = {
      mode: "none" as "none" | "pan" | "pinch",
      startX: 0,
      startY: 0,
      startTx: 0,
      startTy: 0,
      startDist: 0,
      startScale: 1,
      midX: 0,
      midY: 0,
    };

    function onStart(e: TouchEvent) {
      if (e.touches.length >= 2) {
        e.preventDefault();
        const [t1, t2] = [e.touches[0], e.touches[1]];
        const rect = el!.getBoundingClientRect();
        g.mode = "pinch";
        g.startDist = Math.hypot(
          t2.clientX - t1.clientX,
          t2.clientY - t1.clientY,
        );
        g.startScale = view.current.scale;
        g.startTx = view.current.tx;
        g.startTy = view.current.ty;
        // Pinch midpoint as an offset from the window's center.
        g.midX = (t1.clientX + t2.clientX) / 2 - rect.left - rect.width / 2;
        g.midY = (t1.clientY + t2.clientY) / 2 - rect.top - rect.height / 2;
      } else if (e.touches.length === 1 && view.current.scale > 1) {
        g.mode = "pan";
        g.startX = e.touches[0].clientX;
        g.startY = e.touches[0].clientY;
        g.startTx = view.current.tx;
        g.startTy = view.current.ty;
      } else {
        g.mode = "none";
      }
    }

    function onMove(e: TouchEvent) {
      if (g.mode === "pinch" && e.touches.length >= 2) {
        e.preventDefault();
        const [t1, t2] = [e.touches[0], e.touches[1]];
        const dist = Math.hypot(
          t2.clientX - t1.clientX,
          t2.clientY - t1.clientY,
        );
        const next = Math.max(
          1,
          Math.min(MAX_SCALE, (g.startScale * dist) / g.startDist),
        );
        const k = next / g.startScale;
        // Zoom about the pinch midpoint: keep the content under the fingers
        // fixed. tx1 = k*tx0 + midX*(1 - k).
        view.current.scale = next;
        view.current.tx = k * g.startTx + g.midX * (1 - k);
        view.current.ty = k * g.startTy + g.midY * (1 - k);
        clamp();
        apply();
      } else if (g.mode === "pan" && e.touches.length === 1) {
        e.preventDefault();
        view.current.tx = g.startTx + (e.touches[0].clientX - g.startX);
        view.current.ty = g.startTy + (e.touches[0].clientY - g.startY);
        clamp();
        apply();
      }
    }

    function onEnd(e: TouchEvent) {
      if (e.touches.length === 0) g.mode = "none";
    }

    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  function reset() {
    view.current = { scale: 1, tx: 0, ty: 0 };
    apply();
  }

  return (
    <div
      ref={containerRef}
      className={
        "relative flex items-center justify-center overflow-hidden " +
        (className ?? "")
      }
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
            ref={canvasRef}
            style={{
              transformOrigin: "center center",
              willChange: "transform",
              display: "block",
            }}
          />
          <button
            type="button"
            onClick={reset}
            className="absolute right-2 top-2 rounded-md bg-neutral-900/70 px-2 py-1 text-[11px] font-medium text-white backdrop-blur active:bg-neutral-900"
          >
            Reset
          </button>
          {numPages > 1 && (
            <span className="absolute bottom-2 left-2 rounded bg-neutral-900/70 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur">
              Page 1 / {numPages} · open fullscreen for all
            </span>
          )}
        </>
      )}
    </div>
  );
}
