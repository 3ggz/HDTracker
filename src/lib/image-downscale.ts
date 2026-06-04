// Photos from phone cameras are typically 12+ MP (4–8 MB each). For
// an inventory app that's massive overkill — and it makes the print
// "Save as PDF" output absurdly large because every photo gets
// embedded at full resolution. Downscale once on upload: cheaper
// storage, cheaper bandwidth, much smaller print PDFs going forward.

const MAX_DIM = 1600;
const JPEG_QUALITY = 0.85;
// Skip the downscale work for anything already comfortably small.
const SKIP_BELOW_BYTES = 800 * 1024;

export async function downscaleImageIfNeeded(file: File): Promise<File> {
  if (file.size < SKIP_BELOW_BYTES) return file;
  // GIFs may be animated; canvas would lose the animation.
  if (file.type === "image/gif") return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // HEIC on non-Safari browsers, corrupt files, etc — just upload
    // the original and let the server handle it.
    return file;
  }

  if (bitmap.width <= MAX_DIM && bitmap.height <= MAX_DIM) {
    bitmap.close();
    return file;
  }

  const scale = Math.min(MAX_DIM / bitmap.width, MAX_DIM / bitmap.height);
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  if (!blob || blob.size >= file.size) return file;

  const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";
  return new File([blob], `${baseName}.jpg`, {
    type: "image/jpeg",
    lastModified: file.lastModified,
  });
}
