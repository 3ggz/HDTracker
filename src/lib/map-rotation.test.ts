import { describe, expect, it } from "vitest";
import { isRotation, nextRotation, normalizeRotation } from "./map-rotation";

describe("nextRotation", () => {
  it("steps a quarter turn and wraps back to upright", () => {
    expect(nextRotation(0)).toBe(90);
    expect(nextRotation(90)).toBe(180);
    expect(nextRotation(180)).toBe(270);
    expect(nextRotation(270)).toBe(0);
  });

  // Four taps must land exactly where it started, or a sheet someone
  // rotated past the one they wanted can never get back.
  it("returns to the start after four steps", () => {
    let r = 0;
    for (let i = 0; i < 4; i++) r = nextRotation(r);
    expect(r).toBe(0);
  });
});

describe("normalizeRotation", () => {
  it("keeps the four canonical values", () => {
    for (const r of [0, 90, 180, 270]) {
      expect(normalizeRotation(r)).toBe(r);
    }
  });

  it("wraps values at or past a full turn", () => {
    expect(normalizeRotation(360)).toBe(0);
    expect(normalizeRotation(450)).toBe(90);
  });

  // pdf.js tolerates negatives; the DB check constraint does not.
  it("brings negatives into range", () => {
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(-360)).toBe(0);
  });

  it("snaps an off-grid value to the nearest quarter turn", () => {
    expect(normalizeRotation(89)).toBe(90);
    expect(normalizeRotation(1)).toBe(0);
  });

  it("only ever produces a value the check constraint accepts", () => {
    for (let v = -720; v <= 720; v += 7) {
      expect(isRotation(normalizeRotation(v))).toBe(true);
    }
  });
});

describe("isRotation", () => {
  it("accepts the four steps and rejects everything else", () => {
    expect(isRotation(0)).toBe(true);
    expect(isRotation(270)).toBe(true);
    expect(isRotation(45)).toBe(false);
    expect(isRotation(360)).toBe(false);
    expect(isRotation("90")).toBe(false);
    expect(isRotation(null)).toBe(false);
  });
});
