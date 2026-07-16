"use client";

import { useEffect, useRef } from "react";

const MAX_ZOOM = 8;

type View = { z: number; ox: number; oy: number };

// Pinch-zoom + pan viewer for a single raster photo. Unlike the PDF
// viewer there's no re-render pipeline: the browser resamples the
// full-resolution source through the CSS transform, so a plain <img>
// stays sharp at any zoom. Gestures mirror the PDF viewer — pinch,
// one-finger pan when zoomed, double-tap toggle, trackpad /
// ctrl+wheel zoom, wheel pan, mouse drag. Taps on the letterbox
// (outside the photo) call onBackdropTap so modal hosts keep their
// dismiss-on-backdrop behavior.
export function PinchZoomImage({
  src,
  alt,
  className,
  onBackdropTap,
}: {
  src: string;
  alt?: string;
  className?: string;
  onBackdropTap?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const sizeRef = useRef({ cw: 0, ch: 0, iw: 0, ih: 0 });
  const view = useRef<View>({ z: 1, ox: 0, oy: 0 });
  const suppressTapUntil = useRef(0);

  function clampView(v: View) {
    v.z = Math.min(MAX_ZOOM, Math.max(1, v.z));
    const { cw, ch, iw, ih } = sizeRef.current;
    const w = iw * v.z;
    const h = ih * v.z;
    v.ox = w <= cw ? (w - cw) / 2 : Math.min(w - cw, Math.max(0, v.ox));
    v.oy = h <= ch ? (h - ch) / 2 : Math.min(h - ch, Math.max(0, v.oy));
  }

  function apply() {
    const img = imgRef.current;
    if (!img) return;
    const { z, ox, oy } = view.current;
    img.style.transform = `translate(${-ox}px, ${-oy}px) scale(${z})`;
  }

  function zoomAbout(fx: number, fy: number, zNext: number) {
    const v = view.current;
    const z2 = Math.min(MAX_ZOOM, Math.max(1, zNext));
    const r = z2 / v.z;
    v.ox = (v.ox + fx) * r - fx;
    v.oy = (v.oy + fy) * r - fy;
    v.z = z2;
    clampView(v);
    apply();
  }

  function layout() {
    const el = containerRef.current;
    const img = imgRef.current;
    if (!el || !img || img.naturalWidth === 0) return;
    const cw = el.clientWidth || 320;
    const ch = el.clientHeight || 240;
    const fit = Math.min(cw / img.naturalWidth, ch / img.naturalHeight);
    const iw = img.naturalWidth * fit;
    const ih = img.naturalHeight * fit;
    sizeRef.current = { cw, ch, iw, ih };
    img.style.width = `${iw}px`;
    img.style.height = `${ih}px`;
    view.current = { z: 1, ox: 0, oy: 0 };
    clampView(view.current);
    apply();
  }

  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth > 0) layout();
    const el = containerRef.current;
    if (!el) return;
    let timer: number | null = null;
    const ro = new ResizeObserver(() => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        layout();
      }, 150);
    });
    ro.observe(el);
    return () => {
      if (timer) window.clearTimeout(timer);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

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

    function armPan(t: Touch) {
      g.mode = view.current.z > 1.001 ? "pan" : "none";
      g.startX = t.clientX;
      g.startY = t.clientY;
      g.startOx = view.current.ox;
      g.startOy = view.current.oy;
    }

    function onTouchStart(e: TouchEvent) {
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
        apply();
      } else if (g.mode === "pan" && e.touches.length === 1) {
        e.preventDefault();
        const dx = e.touches[0].clientX - g.startX;
        const dy = e.touches[0].clientY - g.startY;
        if (Math.abs(dx) + Math.abs(dy) > 2) g.moved = true;
        const v = view.current;
        v.ox = g.startOx - dx;
        v.oy = g.startOy - dy;
        clampView(v);
        apply();
      }
    }

    function onTouchEnd(e: TouchEvent) {
      if (e.touches.length > 0) {
        armPan(e.touches[0]);
        return;
      }
      g.mode = "none";
      if (g.moved) {
        suppressTapUntil.current = performance.now() + 350;
        g.lastTap = null;
        return;
      }
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
        suppressTapUntil.current = now + 350;
        g.lastTap = null;
        if (view.current.z > 1.5) {
          view.current = { z: 1, ox: 0, oy: 0 };
          clampView(view.current);
          apply();
        } else {
          zoomAbout(x, y, 2.5);
        }
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
      } else if (view.current.z > 1.001) {
        e.preventDefault();
        const v = view.current;
        v.ox += e.deltaX;
        v.oy += e.deltaY;
        clampView(v);
        apply();
      }
    }

    let mouseDrag: { x: number; y: number; ox: number; oy: number } | null =
      null;
    function onMouseDown(e: MouseEvent) {
      if (e.button !== 0 || view.current.z <= 1.001) return;
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
      apply();
    }
    function onMouseUp() {
      if (!mouseDrag) return;
      mouseDrag = null;
      suppressTapUntil.current = performance.now() + 350;
    }
    function onDblClick(e: MouseEvent) {
      const rect = el!.getBoundingClientRect();
      if (view.current.z > 1.5) {
        view.current = { z: 1, ox: 0, oy: 0 };
        clampView(view.current);
        apply();
      } else {
        zoomAbout(e.clientX - rect.left, e.clientY - rect.top, 2.5);
      }
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
      onClick={(e) => {
        if (
          e.target === containerRef.current &&
          performance.now() > suppressTapUntil.current
        ) {
          onBackdropTap?.();
        }
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={src}
        alt={alt ?? ""}
        draggable={false}
        onLoad={layout}
        className="absolute left-0 top-0 max-w-none select-none"
        style={{ transformOrigin: "0 0", willChange: "transform" }}
      />
    </div>
  );
}
