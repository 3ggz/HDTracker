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

// Storage's per-object ceiling. Lives here rather than in
// vehicle-photos because this module is what enforces it, and
// vehicle-photos already imports this one — the other direction would
// be a cycle.
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 10 MB

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

export type ImageKind =
  | "jpeg"
  | "png"
  | "gif"
  | "webp"
  | "avif"
  | "heif"
  | "unknown";

const ascii = (b: Uint8Array, start: number, end: number) =>
  String.fromCharCode(...b.subarray(start, end));

// HEIF and AVIF are both ISO base media files distinguished only by
// their brand, and a phone picker's filename and MIME type are both
// unreliable, so the bytes are the only honest signal. Twelve bytes is
// enough for every format here.
export function sniffImageKind(bytes: Uint8Array): ImageKind {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  if (
    bytes.length >= 8 &&
    ascii(bytes, 1, 4) === "PNG" &&
    bytes[0] === 0x89
  ) {
    return "png";
  }
  if (bytes.length >= 4 && ascii(bytes, 0, 4) === "GIF8") return "gif";
  if (
    bytes.length >= 12 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === "ftyp") {
    const brand = ascii(bytes, 8, 12).toLowerCase();
    if (brand === "avif" || brand === "avis") return "avif";
    return "heif";
  }
  return "unknown";
}

// AVIF is left alone: every browser this app targets renders it, and
// re-encoding would only lose quality.
export function needsConversion(kind: ImageKind): boolean {
  return kind === "heif" || kind === "unknown";
}

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
  maxDim: number,
): { w: number; h: number } {
  const scale = Math.min(1, maxDim / width, maxDim / height);
  return {
    w: Math.max(1, Math.round(width * scale)),
    h: Math.max(1, Math.round(height * scale)),
  };
}

async function drawToJpeg(
  bitmap: ImageBitmap,
  maxDim: number,
  quality: number,
): Promise<Blob | null> {
  const { w, h } = fitWithin(bitmap.width, bitmap.height, maxDim);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, w, h);
  return await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
}

// Progressively harder passes, used only if the standard one still
// doesn't fit. A photo of a MAC label has to stay readable, so
// quality drops before dimensions do.
const FALLBACK_PASSES: { maxDim: number; quality: number }[] = [
  { maxDim: MAX_DIM, quality: 0.7 },
  { maxDim: MAX_DIM, quality: 0.5 },
  { maxDim: 1200, quality: 0.5 },
  { maxDim: 900, quality: 0.45 },
  { maxDim: 640, quality: 0.4 },
];

// Always closes the bitmap.
async function encodeJpeg(
  bitmap: ImageBitmap,
  baseName: string,
  lastModified: number,
  maxBytes: number,
): Promise<File | null> {
  try {
    let blob = await drawToJpeg(bitmap, MAX_DIM, JPEG_QUALITY);
    if (!blob) return null;

    // Squeeze rather than reject. A tech in a parking lot can't do
    // anything useful with "that photo is too big" — the app is the
    // only thing here that can actually make it smaller.
    for (const pass of FALLBACK_PASSES) {
      if (blob.size <= maxBytes) break;
      const next = await drawToJpeg(bitmap, pass.maxDim, pass.quality);
      if (!next) break;
      blob = next;
    }

    const stem = baseName.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${stem}.jpg`, {
      type: "image/jpeg",
      lastModified,
    });
  } finally {
    bitmap.close();
  }
}

export async function normalizeImageForUpload(
  file: File,
  maxBytes: number = MAX_PHOTO_BYTES,
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
    const converted = await encodeJpeg(
      bitmap,
      file.name,
      file.lastModified,
      maxBytes,
    );
    return converted
      ? { ok: true, file: converted }
      : { ok: false, error: "Couldn't convert that image. Try another photo." };
  }

  // Format is already fine — from here it's purely a size question.
  const oversize = file.size > maxBytes;
  if (!oversize && file.size < SKIP_DOWNSCALE_BELOW_BYTES) {
    return { ok: true, file };
  }
  // GIFs may be animated; canvas would flatten them to one frame. Only
  // worth that trade when the alternative is refusing the upload.
  if (file.type.toLowerCase() === "image/gif" && !oversize) {
    return { ok: true, file };
  }

  const bitmap = await decodeNatively(file);
  if (!bitmap) {
    return oversize
      ? {
          ok: false,
          error: "Couldn't read that image. Try taking the photo again.",
        }
      : { ok: true, file };
  }
  // Already small enough in both senses — don't re-encode and lose
  // quality for nothing.
  if (!oversize && bitmap.width <= MAX_DIM && bitmap.height <= MAX_DIM) {
    bitmap.close();
    return { ok: true, file };
  }

  const downscaled = await encodeJpeg(
    bitmap,
    file.name,
    file.lastModified,
    maxBytes,
  );
  if (!downscaled) {
    return oversize
      ? { ok: false, error: "Couldn't shrink that image. Try another photo." }
      : { ok: true, file };
  }
  // Re-encoding an already-efficient image can make it bigger; keep
  // whichever is smaller, since both render everywhere. Never hand
  // back the original when it's the one that doesn't fit.
  if (!oversize && downscaled.size >= file.size) return { ok: true, file };
  return { ok: true, file: downscaled };
}
