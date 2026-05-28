// Tests for pure strumming-pattern logic in strumEngine.js
import { describe, it, expect } from "vitest";
import {
  STRUM_PATTERNS,
  getPatternById,
  calcCurrentBeat,
} from "../../src/utils/strumEngine.js";

// ─── STRUM_PATTERNS shape ─────────────────────────────────────────────────────

describe("STRUM_PATTERNS", () => {
  it("is a non-empty array", () => {
    expect(Array.isArray(STRUM_PATTERNS)).toBe(true);
    expect(STRUM_PATTERNS.length).toBeGreaterThan(0);
  });

  it("every pattern has the required keys with correct types", () => {
    for (const p of STRUM_PATTERNS) {
      expect(typeof p.id).toBe("string");
      expect(p.id.length).toBeGreaterThan(0);

      expect(typeof p.label).toBe("string");
      expect(p.label.length).toBeGreaterThan(0);

      expect(Array.isArray(p.beats)).toBe(true);
      expect(p.beats.length).toBeGreaterThan(0);

      expect(typeof p.subDiv).toBe("number");
      expect(p.subDiv).toBeGreaterThan(0);

      expect(typeof p.note).toBe("string");
    }
  });

  it("every beat token is one of D, U, or -", () => {
    const valid = new Set(["D", "U", "-"]);
    for (const p of STRUM_PATTERNS) {
      for (const b of p.beats) {
        expect(valid.has(b), `Pattern "${p.id}" has invalid token "${b}"`).toBe(true);
      }
    }
  });

  it("pattern ids are unique", () => {
    const ids = STRUM_PATTERNS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("includes the 'island' pattern (most common ukulele strum)", () => {
    const island = STRUM_PATTERNS.find(p => p.id === "island");
    expect(island).toBeDefined();
    expect(island.beats).toHaveLength(8);
    expect(island.subDiv).toBe(2); // 8th-note subdivisions
  });
});

// ─── getPatternById ───────────────────────────────────────────────────────────

describe("getPatternById", () => {
  it("returns the correct pattern object for a known id", () => {
    const p = getPatternById("island");
    expect(p).not.toBeNull();
    expect(p.id).toBe("island");
    expect(Array.isArray(p.beats)).toBe(true);
  });

  it("returns the d4 pattern", () => {
    const p = getPatternById("d4");
    expect(p).not.toBeNull();
    expect(p.beats).toEqual(["D", "D", "D", "D"]);
    expect(p.subDiv).toBe(1);
  });

  it("returns null for an unknown id", () => {
    expect(getPatternById("unknown")).toBeNull();
    expect(getPatternById("")).toBeNull();
  });

  it("returns null for null / undefined input", () => {
    expect(getPatternById(null)).toBeNull();
    expect(getPatternById(undefined)).toBeNull();
  });

  it("is case-sensitive", () => {
    expect(getPatternById("ISLAND")).toBeNull();
    expect(getPatternById("Island")).toBeNull();
  });
});

// ─── calcCurrentBeat ─────────────────────────────────────────────────────────
//
// Quarter-note timing (@bpm=120):  beatDuration = 60/120 = 0.5 s
// 8th-note timing    (@bpm=240):   beatDuration = 60/240 = 0.25 s

describe("calcCurrentBeat", () => {
  // ── Basic quarter-note patterns (@120 BPM, patternLength=4) ──────────────
  it("returns beat 0 at elapsed=0", () => {
    expect(calcCurrentBeat(0, 120, 4)).toBe(0);
  });

  it("returns beat 1 after one quarter note (0.5 s @ 120 BPM)", () => {
    expect(calcCurrentBeat(0.5, 120, 4)).toBe(1);
  });

  it("returns beat 2 after two quarter notes", () => {
    expect(calcCurrentBeat(1.0, 120, 4)).toBe(2);
  });

  it("returns beat 3 after three quarter notes", () => {
    expect(calcCurrentBeat(1.5, 120, 4)).toBe(3);
  });

  it("wraps back to beat 0 after the full pattern (2.0 s @ 120 BPM, length=4)", () => {
    expect(calcCurrentBeat(2.0, 120, 4)).toBe(0);
  });

  it("wraps correctly for multiple cycles", () => {
    // 7 beats elapsed → 7 % 4 = 3
    expect(calcCurrentBeat(3.5, 120, 4)).toBe(3);
    // 8 beats elapsed → 8 % 4 = 0
    expect(calcCurrentBeat(4.0, 120, 4)).toBe(0);
  });

  // ── 8th-note subdivision (effective bpm = songBpm * 2) ──────────────────
  it("handles 8th-note pattern: returns correct cell (bpm=240, length=8)", () => {
    // 8th note @240 bpm = 60/240 = 0.25 s
    expect(calcCurrentBeat(0,    240, 8)).toBe(0);
    expect(calcCurrentBeat(0.25, 240, 8)).toBe(1);
    expect(calcCurrentBeat(0.5,  240, 8)).toBe(2);
    expect(calcCurrentBeat(1.75, 240, 8)).toBe(7);
    expect(calcCurrentBeat(2.0,  240, 8)).toBe(0); // wrap
  });

  // ── Edge: patternLength=1 ────────────────────────────────────────────────
  it("always returns 0 when patternLength=1", () => {
    expect(calcCurrentBeat(99, 120, 1)).toBe(0);
  });

  // ── Edge: patternLength=3 (waltz) ────────────────────────────────────────
  it("handles 3-beat waltz pattern", () => {
    // @120 BPM, quarter note = 0.5 s
    expect(calcCurrentBeat(0,   120, 3)).toBe(0); // beat 1
    expect(calcCurrentBeat(0.5, 120, 3)).toBe(1); // beat 2
    expect(calcCurrentBeat(1.0, 120, 3)).toBe(2); // beat 3
    expect(calcCurrentBeat(1.5, 120, 3)).toBe(0); // repeat beat 1
  });

  // ── Guard: invalid inputs return 0 ───────────────────────────────────────
  it("returns 0 for bpm <= 0", () => {
    expect(calcCurrentBeat(1, 0, 4)).toBe(0);
    expect(calcCurrentBeat(1, -120, 4)).toBe(0);
  });

  it("returns 0 for patternLength <= 0", () => {
    expect(calcCurrentBeat(1, 120, 0)).toBe(0);
    expect(calcCurrentBeat(1, 120, -1)).toBe(0);
  });

  it("returns 0 for negative elapsed time", () => {
    expect(calcCurrentBeat(-1, 120, 4)).toBe(0);
  });

  it("returns 0 for non-finite elapsed (Infinity, NaN)", () => {
    expect(calcCurrentBeat(Infinity, 120, 4)).toBe(0);
    expect(calcCurrentBeat(NaN,      120, 4)).toBe(0);
  });

  it("returns 0 for non-finite bpm", () => {
    expect(calcCurrentBeat(1, Infinity, 4)).toBe(0);
    expect(calcCurrentBeat(1, NaN,      4)).toBe(0);
  });

  // ── Speed multiplier simulated by caller ─────────────────────────────────
  it("correctly simulates 0.5x playback speed (bpm halved by caller)", () => {
    // At 0.5x speed, song plays slower, BPM effectively halved:
    // effectiveBpm = 120 * 0.5 = 60 → quarter note = 1.0 s
    expect(calcCurrentBeat(0,   60, 4)).toBe(0);
    expect(calcCurrentBeat(1.0, 60, 4)).toBe(1);
    expect(calcCurrentBeat(2.0, 60, 4)).toBe(2);
  });
});
