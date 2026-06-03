"use client";

import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import type {
  PDFDocumentProxy,
  PDFPageProxy,
} from "pdfjs-dist/types/src/display/api";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

// Configure the worker — using a CDN URL keeps the bundle slim and
// works in production without needing to host the worker file
// ourselves. The version is pinned to whatever's installed.
if (typeof window !== "undefined") {
  // pdfjs-dist@4 ships an ESM worker. The matching CDN path:
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
}

type Color = "#dc2626" | "#2563eb" | "#16a34a" | "#facc15" | "#111827";
const COLORS: { value: Color; label: string }[] = [
  { value: "#dc2626", label: "Red" },
  { value: "#2563eb", label: "Blue" },
  { value: "#16a34a", label: "Green" },
  { value: "#facc15", label: "Yellow" },
  { value: "#111827", label: "Black" },
];

type Stroke = {
  kind: "pen";
  color: string;
  width: number;
  points: [number, number][]; // 0..1 normalized to page
};
type TextMark = {
  kind: "text";
  x: number; // 0..1
  y: number; // 0..1
  text: string;
  color: string;
  size: number; // px at base scale
};
type Annotation = Stroke | TextMark;
export type { Annotation };

type Tool = "view" | "pen" | "text" | "eraser";

export function PdfMapEditor({
  jobId,
  jobName,
  pdfUrl,
  initialAnnotationsByPage,
}: {
  jobId: string;
  jobName: string;
  pdfUrl: string;
  initialAnnotationsByPage: Record<number, Annotation[]>;
}) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [tool, setTool] = useState<Tool>("view");
  const [color, setColor] = useState<Color>("#dc2626");
  const [penWidth, setPenWidth] = useState(3);
  const [textSize, setTextSize] = useState(18);
  const [showEdits, setShowEdits] = useState(true);
  const [scale, setScale] = useState(1);

  const [annotationsByPage, setAnnotationsByPage] = useState(
    initialAnnotationsByPage,
  );
  const [dirtyPages, setDirtyPages] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    let cancelled = false;
    pdfjsLib
      .getDocument(pdfUrl)
      .promise.then((doc) => {
        if (cancelled) return;
        setPdf(doc);
        setNumPages(doc.numPages);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err?.message ?? String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [pdfUrl]);

  function updatePageAnnotations(
    pageIndex: number,
    updater: (current: Annotation[]) => Annotation[],
  ) {
    setAnnotationsByPage((current) => ({
      ...current,
      [pageIndex]: updater(current[pageIndex] ?? []),
    }));
    setDirtyPages((current) => new Set(current).add(pageIndex));
  }

  function undoLast(pageIndex: number) {
    updatePageAnnotations(pageIndex, (current) => current.slice(0, -1));
  }

  function clearPage(pageIndex: number) {
    if (!confirm("Clear all edits on this page?")) return;
    updatePageAnnotations(pageIndex, () => []);
  }

  async function saveAll() {
    if (dirtyPages.size === 0) {
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1200);
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const rows = Array.from(dirtyPages).map((pageIndex) => ({
      job_id: jobId,
      page_index: pageIndex,
      data: annotationsByPage[pageIndex] ?? [],
    }));
    const { error } = await supabase
      .from("job_map_annotations")
      .upsert(rows, { onConflict: "job_id,page_index" });
    setSaving(false);
    if (error) {
      alert(`Couldn't save: ${error.message}`);
      return;
    }
    setDirtyPages(new Set());
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1500);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-900">
      <header className="flex items-center gap-2 border-b border-neutral-800 bg-neutral-950/95 px-2 py-2 backdrop-blur">
        <Link
          href={`/jobs/${jobId}`}
          aria-label="Back to job"
          className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-300 active:bg-neutral-800"
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
        </Link>
        <p className="truncate flex-1 text-xs font-medium text-neutral-100">
          {jobName}
        </p>
        <button
          type="button"
          onClick={() => setShowEdits((v) => !v)}
          aria-pressed={showEdits}
          className={
            "h-9 rounded-md px-2.5 text-[11px] font-medium " +
            (showEdits
              ? "bg-neutral-200 text-neutral-900"
              : "border border-neutral-700 text-neutral-300")
          }
        >
          {showEdits ? "Hide edits" : "Show edits"}
        </button>
        <button
          type="button"
          onClick={saveAll}
          disabled={saving}
          className={
            "h-9 rounded-md px-3 text-[11px] font-semibold disabled:opacity-50 " +
            (dirtyPages.size > 0
              ? "bg-emerald-500 text-white"
              : savedFlash
                ? "bg-emerald-500 text-white"
                : "border border-neutral-700 text-neutral-300")
          }
        >
          {saving
            ? "Saving..."
            : savedFlash
              ? "✓ Saved"
              : dirtyPages.size > 0
                ? `Save (${dirtyPages.size})`
                : "Saved"}
        </button>
      </header>

      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-neutral-800 bg-neutral-950 px-2 py-1.5">
        <ToolButton
          active={tool === "view"}
          onClick={() => setTool("view")}
          label="View"
          icon="M2.5 12C4.5 7 8 5 12 5s7.5 2 9.5 7c-2 5-5.5 7-9.5 7s-7.5-2-9.5-7Z M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z"
        />
        <ToolButton
          active={tool === "pen"}
          onClick={() => setTool("pen")}
          label="Pen"
          icon="M12 19l7-7 3 3-7 7-3-3z M18 13l-1.5-7.5L2 2l3.5 14.5L13 18z"
        />
        <ToolButton
          active={tool === "text"}
          onClick={() => setTool("text")}
          label="Text"
          icon="M4 7V4h16v3 M9 20h6 M12 4v16"
        />
        <ToolButton
          active={tool === "eraser"}
          onClick={() => setTool("eraser")}
          label="Eraser"
          icon="M18 13l-6-6-9 9 6 6 5-5 4 4 4-4-4-4z"
        />
        <div className="ml-1 flex items-center gap-1">
          {COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              aria-label={c.label}
              onClick={() => setColor(c.value)}
              className={
                "h-6 w-6 rounded-full border-2 transition " +
                (color === c.value
                  ? "border-white"
                  : "border-neutral-700 opacity-70")
              }
              style={{ backgroundColor: c.value }}
            />
          ))}
        </div>
        {tool === "pen" && (
          <select
            aria-label="Pen thickness"
            value={penWidth}
            onChange={(e) => setPenWidth(Number(e.target.value))}
            className="h-8 rounded border border-neutral-700 bg-neutral-900 px-1 text-[11px] text-neutral-200"
          >
            <option value={2}>Thin</option>
            <option value={3}>Med</option>
            <option value={5}>Thick</option>
            <option value={8}>X-Thick</option>
          </select>
        )}
        {tool === "text" && (
          <select
            aria-label="Text size"
            value={textSize}
            onChange={(e) => setTextSize(Number(e.target.value))}
            className="h-8 rounded border border-neutral-700 bg-neutral-900 px-1 text-[11px] text-neutral-200"
          >
            <option value={14}>S</option>
            <option value={18}>M</option>
            <option value={24}>L</option>
            <option value={32}>XL</option>
          </select>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => setScale((s) => Math.max(0.5, s - 0.25))}
            className="h-8 w-8 rounded border border-neutral-700 text-neutral-300"
          >
            −
          </button>
          <span className="w-10 text-center text-[11px] text-neutral-400 tabular-nums">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => setScale((s) => Math.min(4, s + 0.25))}
            className="h-8 w-8 rounded border border-neutral-700 text-neutral-300"
          >
            +
          </button>
        </div>
      </div>

      <div
        className="flex-1 overflow-auto bg-neutral-100 p-2"
        style={{ touchAction: tool === "view" ? "auto" : "none" }}
      >
        {loadError && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            Couldn&apos;t load PDF: {loadError}
          </p>
        )}
        {!pdf && !loadError && (
          <p className="p-6 text-center text-sm text-neutral-500">
            Loading PDF…
          </p>
        )}
        {pdf &&
          Array.from({ length: numPages }, (_, i) => i).map((pageIndex) => (
            <PdfPageView
              key={pageIndex}
              pdf={pdf}
              pageIndex={pageIndex}
              scale={scale}
              tool={tool}
              color={color}
              penWidth={penWidth}
              textSize={textSize}
              showEdits={showEdits}
              annotations={annotationsByPage[pageIndex] ?? []}
              onChange={(updater) =>
                updatePageAnnotations(pageIndex, updater)
              }
              onUndo={() => undoLast(pageIndex)}
              onClear={() => clearPage(pageIndex)}
            />
          ))}
      </div>
    </div>
  );
}

function ToolButton({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={
        "flex h-8 items-center gap-1 rounded px-2 text-[11px] font-medium transition " +
        (active
          ? "bg-neutral-200 text-neutral-900"
          : "border border-neutral-700 text-neutral-300")
      }
    >
      <svg
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={icon} />
      </svg>
      {label}
    </button>
  );
}

function PdfPageView({
  pdf,
  pageIndex,
  scale,
  tool,
  color,
  penWidth,
  textSize,
  showEdits,
  annotations,
  onChange,
  onUndo,
  onClear,
}: {
  pdf: PDFDocumentProxy;
  pageIndex: number;
  scale: number;
  tool: Tool;
  color: string;
  penWidth: number;
  textSize: number;
  showEdits: boolean;
  annotations: Annotation[];
  onChange: (updater: (current: Annotation[]) => Annotation[]) => void;
  onUndo: () => void;
  onClear: () => void;
}) {
  const pageCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState<PDFPageProxy | null>(null);
  const [baseSize, setBaseSize] = useState<{ w: number; h: number } | null>(
    null,
  );
  const [textInput, setTextInput] = useState<{
    x: number;
    y: number;
    value: string;
  } | null>(null);
  const drawingRef = useRef<Stroke | null>(null);

  // Load page once.
  useEffect(() => {
    let cancelled = false;
    pdf.getPage(pageIndex + 1).then((p) => {
      if (!cancelled) setPage(p);
    });
    return () => {
      cancelled = true;
    };
  }, [pdf, pageIndex]);

  // Render PDF page to canvas whenever scale or page changes.
  useEffect(() => {
    if (!page) return;
    const canvas = pageCanvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const viewport = page.getViewport({ scale: scale * dpr });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = `${viewport.width / dpr}px`;
    canvas.style.height = `${viewport.height / dpr}px`;
    setBaseSize({
      w: viewport.width / dpr,
      h: viewport.height / dpr,
    });
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const renderTask = page.render({
      canvasContext: ctx,
      viewport,
    });
    renderTask.promise.catch(() => {
      // Render can be cancelled by a re-render — swallow.
    });
    return () => {
      renderTask.cancel();
    };
  }, [page, scale]);

  // Redraw annotation overlay.
  useEffect(() => {
    const overlay = overlayCanvasRef.current;
    if (!overlay || !baseSize) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    overlay.width = baseSize.w * dpr;
    overlay.height = baseSize.h * dpr;
    overlay.style.width = `${baseSize.w}px`;
    overlay.style.height = `${baseSize.h}px`;
    const ctx = overlay.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, baseSize.w, baseSize.h);
    if (!showEdits) return;
    for (const a of annotations) {
      if (a.kind === "pen") {
        ctx.strokeStyle = a.color;
        ctx.lineWidth = a.width;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        a.points.forEach((pt, i) => {
          const px = pt[0] * baseSize.w;
          const py = pt[1] * baseSize.h;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();
      } else if (a.kind === "text") {
        ctx.fillStyle = a.color;
        ctx.font = `${a.size}px system-ui, -apple-system, sans-serif`;
        ctx.textBaseline = "top";
        ctx.fillText(a.text, a.x * baseSize.w, a.y * baseSize.h);
      }
    }
  }, [annotations, baseSize, showEdits]);

  function toNormalized(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (tool === "view" || !baseSize) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const { x, y } = toNormalized(e);
    if (tool === "pen") {
      drawingRef.current = {
        kind: "pen",
        color,
        width: penWidth,
        points: [[x, y]],
      };
    } else if (tool === "text") {
      setTextInput({ x, y, value: "" });
    } else if (tool === "eraser") {
      // Hit-test: remove any annotation under the pointer.
      const hitTol = 0.02; // 2% of page
      onChange((current) =>
        current.filter((a) => {
          if (a.kind === "text") {
            const charW = (a.size / baseSize.w) * 0.55;
            const w = charW * a.text.length;
            const h = a.size / baseSize.h;
            return !(x >= a.x && x <= a.x + w && y >= a.y && y <= a.y + h);
          }
          for (const [px, py] of a.points) {
            const dx = px - x;
            const dy = py - y;
            if (dx * dx + dy * dy < hitTol * hitTol) return false;
          }
          return true;
        }),
      );
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (tool !== "pen") return;
    const stroke = drawingRef.current;
    if (!stroke) return;
    const { x, y } = toNormalized(e);
    stroke.points.push([x, y]);
    // Live-draw the latest segment without going through state.
    const overlay = overlayCanvasRef.current;
    if (!overlay || !baseSize) return;
    const ctx = overlay.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // ctx is already pre-scaled by dpr from the last redraw, so we
    // draw in CSS pixels.
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const last = stroke.points[stroke.points.length - 2];
    if (!last) return;
    ctx.beginPath();
    ctx.moveTo(last[0] * baseSize.w, last[1] * baseSize.h);
    ctx.lineTo(x * baseSize.w, y * baseSize.h);
    ctx.stroke();
    void dpr;
  }

  function onPointerUp() {
    if (tool !== "pen") return;
    const stroke = drawingRef.current;
    drawingRef.current = null;
    if (!stroke || stroke.points.length < 2) return;
    onChange((current) => [...current, stroke]);
  }

  function commitText() {
    if (!textInput) return;
    const trimmed = textInput.value.trim();
    if (trimmed) {
      onChange((current) => [
        ...current,
        {
          kind: "text",
          x: textInput.x,
          y: textInput.y,
          text: trimmed,
          color,
          size: textSize,
        },
      ]);
    }
    setTextInput(null);
  }

  return (
    <div className="mb-3 flex flex-col items-center">
      <div className="mb-1 flex w-full items-center justify-between px-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
          Page {pageIndex + 1}
        </span>
        <span className="flex gap-1">
          <button
            type="button"
            onClick={onUndo}
            disabled={annotations.length === 0}
            className="h-7 rounded border border-neutral-300 px-2 text-[10px] font-medium text-neutral-700 disabled:opacity-40"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={annotations.length === 0}
            className="h-7 rounded border border-red-300 px-2 text-[10px] font-medium text-red-600 disabled:opacity-40"
          >
            Clear
          </button>
        </span>
      </div>
      <div
        ref={wrapperRef}
        className="relative inline-block bg-white shadow"
      >
        <canvas ref={pageCanvasRef} className="block" />
        <canvas
          ref={overlayCanvasRef}
          className="absolute left-0 top-0"
          style={{ cursor: tool === "view" ? "default" : "crosshair" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        {textInput && baseSize && (
          <div
            className="absolute"
            style={{
              left: textInput.x * baseSize.w,
              top: textInput.y * baseSize.h,
            }}
          >
            <input
              autoFocus
              type="text"
              value={textInput.value}
              onChange={(e) =>
                setTextInput((cur) =>
                  cur ? { ...cur, value: e.target.value } : null,
                )
              }
              onBlur={commitText}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitText();
                if (e.key === "Escape") setTextInput(null);
              }}
              placeholder="Type here"
              className="rounded border border-neutral-400 bg-white px-1.5 py-0.5 shadow"
              style={{ color, fontSize: textSize }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
