// Everything that lands in a storage bucket has to be readable by
// every phone on the crew, not just the one that uploaded it.
//
// That is not automatic. iOS Safari quietly transcodes HEIC to JPEG
// when you pick a photo through a file input, so an iPhone upload is
// already a JPEG. Android does not — a phone with HEIF camera output
// (OnePlus, recent Samsung/Pixel) hands us the raw .heic, and Chrome
// has never been able to decode HEIC, so the uploader gets a broken
// image icon for the picture he just took while iPhone users see it
// fine. That asymmetry is exactly the bug this file exists to close.
//
// So: normalize the FORMAT first and unconditionally, then downscale
// by size. The old code did size first and bailed out of the whole
// function under 800 KB — HEIC is efficient enough that a 12 MP photo
// often lands under that, which let raw HEIC through untouched.

const MAX_DIM = 1600;
const JPEG_QUALITY = 0.85;
// Photos from phone cameras are typically 12+ MP (4–8 MB each). For an
// inventory app that's massive overkill — and it makes the print "Save
// as PDF" output absurdly large because every photo gets embedded at
// full resolution. Anything already comfortably small skips the work.
const SKIP_DOWNSCALE_BELOW_BYTES = 800 * 1024;

// Formats every browser the crew uses can actually render. Anything
// outside this set gets re-encoded to JPEG before upload.
const RENDERABLE_EVERYWHERE = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export type NormalizedImage =
  | { ok: true; file: File }
  | { ok: false; error: string };

export function isRenderableEverywhere(type: string): boolean {
  return RENDERABLE_EVERYWHERE.has(type.toLowerCase());
}

// Android pickers are unreliable about the MIME type on HEIC — some
// report image/heic, some report an empty string, some report
// application/octet-stream. The extension is the more dependable
// signal, so check both.
export function looksLikeHeic(file: { name: string; type: string }): boolean {
  const type = file.type.toLowerCase();
  if (type === "image/heic" || type === "image/heif") return true;
  return /\.(heic|heif)$/i.test(file.name);
}

async function decodeNatively(file: Blob): Promise<ImageBitmap | null> {
  try {
    // Without from-image, EXIF-rotated phone photos decode upright-as-
    // stored and then canvas re-encoding drops the EXIF tag that would
    // have corrected them — portrait shots come out sideways.
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return null;
  }
}

// The wasm decoder is ~3 MB, so it is imported only on the path that
// genuinely needs it: a HEIC on a browser that can't decode HEIC. A
// top-level import would put it in the bundle for every page.
async function decodeHeicViaWasm(file: File): Promise<ImageBitmap | null> {
  try {
    const { isHeic, heicTo } = await import("heic-to/next");
    if (!(await isHeic(file))) return null;
    return await heicTo({ blob: file, type: "bitmap" });
  } catch {
    return null;
  }
}

function fitWithin(
  width: number,
  height: number,
): { w: number; h: number } {
  const scale = Math.min(1, MAX_DIM / width, MAX_DIM / height);
  return { w: Math.round(width * scale), h: Math.round(height * scale) };
}

async function encodeJpeg(
  bitmap: ImageBitmap,
  baseName: string,
  lastModified: number,
): Promise<File | null> {
  const { w, h } = fitWithin(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return null;
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  if (!blob) return null;

  const stem = baseName.replace(/\.[^.]+$/, "") || "photo";
  return new File([blob], `${stem}.jpg`, {
    type: "image/jpeg",
    lastModified,
  });
}

export async function normalizeImageForUpload(
  file: File,
): Promise<NormalizedImage> {
  if (!isRenderableEverywhere(file.type) || looksLikeHeic(file)) {
    // Native decode first: it costs nothing and already handles HEIC on
    // iOS, so only the Android/desktop case pays for the wasm download.
    const bitmap =
      (await decodeNatively(file)) ?? (await decodeHeicViaWasm(file));
    if (!bitmap) {
      // Storing a file we could not decode is what produced the broken
      // thumbnails in the first place. Fail loudly instead.
      return {
        ok: false,
        error:
          "Couldn't read that image. Try taking the photo again, or switch your camera to JPEG in its settings.",
      };
    }
    const converted = await encodeJpeg(bitmap, file.name, file.lastModified);
    return converted
      ? { ok: true, file: converted }
      : { ok: false, error: "Couldn't convert that image. Try another photo." };
  }

  // Format is already fine — from here it's purely a size question.
  if (file.size < SKIP_DOWNSCALE_BELOW_BYTES) return { ok: true, file };
  // GIFs may be animated; canvas would flatten them to one frame.
  if (file.type.toLowerCase() === "image/gif") return { ok: true, file };

  const bitmap = await decodeNatively(file);
  if (!bitmap) return { ok: true, file };
  if (bitmap.width <= MAX_DIM && bitmap.height <= MAX_DIM) {
    bitmap.close();
    return { ok: true, file };
  }

  const downscaled = await encodeJpeg(bitmap, file.name, file.lastModified);
  // Re-encoding a small or already-efficient image can make it bigger;
  // keep whichever is smaller since both render everywhere.
  if (!downscaled || downscaled.size >= file.size) return { ok: true, file };
  return { ok: true, file: downscaled };
}
