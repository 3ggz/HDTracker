import { describe, expect, it } from "vitest";
import {
  ALLOWED_PHOTO_MIME_TYPES,
  MAX_PHOTO_BYTES,
  buildStoragePath,
  guessExtension,
  publicPhotoUrl,
  validatePhotoFile,
} from "./vehicle-photos";

describe("validatePhotoFile", () => {
  it("accepts supported mime types under the size limit", () => {
    for (const type of ALLOWED_PHOTO_MIME_TYPES) {
      expect(
        validatePhotoFile({ type, size: 1024 }),
      ).toEqual({ ok: true });
    }
  });

  it("rejects non-image mime types", () => {
    const result = validatePhotoFile({ type: "application/pdf", size: 1024 });
    expect(result.ok).toBe(false);
  });

  // Some Android pickers report no usable type for a HEIC. Those
  // phones must still be able to upload — the normalizer converts the
  // file to JPEG afterwards.
  it("accepts a HEIC whose mime type the picker didn't fill in", () => {
    expect(
      validatePhotoFile({ name: "IMG_0042.HEIC", type: "", size: 1024 }),
    ).toEqual({ ok: true });
    expect(
      validatePhotoFile({
        name: "IMG_0042.heif",
        type: "application/octet-stream",
        size: 1024,
      }),
    ).toEqual({ ok: true });
  });

  it("still rejects a non-image that only has a misleading name", () => {
    expect(
      validatePhotoFile({ name: "notes.pdf", type: "", size: 1024 }).ok,
    ).toBe(false);
  });

  it("rejects oversized files even if the mime type is supported", () => {
    const result = validatePhotoFile({
      type: "image/jpeg",
      size: MAX_PHOTO_BYTES + 1,
    });
    expect(result).toEqual({
      ok: false,
      error: "File is over 10 MB. Try a smaller picture.",
    });
  });
});

describe("guessExtension", () => {
  // iOS Safari transcodes a HEIC to JPEG on upload but keeps the
  // original filename, so the name is the untrustworthy signal.
  it("prefers the mime type over a filename that disagrees", () => {
    expect(guessExtension({ name: "IMG_1234.HEIC", type: "image/jpeg" })).toBe(
      ".jpg",
    );
    expect(guessExtension({ name: "photo.jpg", type: "image/jpeg" })).toBe(
      ".jpg",
    );
  });

  it("uses the mime type when there is no extension", () => {
    expect(guessExtension({ name: "blob", type: "image/png" })).toBe(".png");
    expect(guessExtension({ name: "blob", type: "image/jpeg" })).toBe(".jpg");
  });

  it("falls back to the filename when the type is missing", () => {
    expect(guessExtension({ name: "IMG_1234.HEIC", type: "" })).toBe(".heic");
  });

  it("returns an empty string when both signals are unhelpful", () => {
    expect(guessExtension({ name: "blob", type: "application/oops" })).toBe(
      "",
    );
  });
});

describe("buildStoragePath", () => {
  it("scopes a photo's storage path under its vehicle id", () => {
    expect(
      buildStoragePath(
        "11111111-2222-3333-4444-555555555555",
        "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        ".jpg",
      ),
    ).toBe(
      "11111111-2222-3333-4444-555555555555/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg",
    );
  });
});

describe("publicPhotoUrl", () => {
  it("builds a Supabase Storage public URL from a path", () => {
    expect(
      publicPhotoUrl(
        "https://example.supabase.co",
        "vehicle-id/photo-id.jpg",
      ),
    ).toBe(
      "https://example.supabase.co/storage/v1/object/public/vehicle-photos/vehicle-id/photo-id.jpg",
    );
  });

  it("tolerates a trailing slash on the supabase url", () => {
    expect(
      publicPhotoUrl(
        "https://example.supabase.co/",
        "vehicle-id/photo-id.jpg",
      ),
    ).toBe(
      "https://example.supabase.co/storage/v1/object/public/vehicle-photos/vehicle-id/photo-id.jpg",
    );
  });
});
