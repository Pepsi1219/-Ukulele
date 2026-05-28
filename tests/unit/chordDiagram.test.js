// Tests for pure (non-DOM) logic in chordDiagram.js
import { describe, it, expect } from "vitest";
import {
  getChordData,
  calcBaseFret,
  buildDiagramModel,
} from "../../src/utils/chordDiagram.js";

// ─── getChordData ────────────────────────────────────────────────────────────

describe("getChordData", () => {
  it("returns chord data for a known chord", () => {
    const data = getChordData("C");
    expect(data).not.toBeNull();
    expect(data).toHaveProperty("frets");
    expect(Array.isArray(data.frets)).toBe(true);
    expect(data.frets).toHaveLength(4);
  });

  it("returns correct frets for C major", () => {
    expect(getChordData("C").frets).toEqual([0, 0, 0, 3]);
  });

  it("returns correct frets for Am", () => {
    expect(getChordData("Am").frets).toEqual([2, 0, 0, 0]);
  });

  it("returns correct frets for Dm", () => {
    expect(getChordData("Dm").frets).toEqual([2, 2, 1, 0]);
  });

  it("returns correct frets for G", () => {
    expect(getChordData("G").frets).toEqual([0, 2, 3, 2]);
  });

  it("trims whitespace from chord name", () => {
    expect(getChordData("C ")).toEqual(getChordData("C"));
    expect(getChordData(" Am")).toEqual(getChordData("Am"));
  });

  it("returns null for an unknown chord", () => {
    expect(getChordData("Xyz")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(getChordData("")).toBeNull();
  });

  it("returns null for null input", () => {
    expect(getChordData(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(getChordData(undefined)).toBeNull();
  });

  it("is case-sensitive (C ≠ c)", () => {
    expect(getChordData("c")).toBeNull();
  });
});

// ─── calcBaseFret ────────────────────────────────────────────────────────────

describe("calcBaseFret", () => {
  it("returns 1 for all-open strings", () => {
    expect(calcBaseFret([0, 0, 0, 0])).toBe(1);
  });

  it("returns 1 when all pressed frets fit in [1–4]", () => {
    expect(calcBaseFret([0, 2, 3, 2])).toBe(1); // G chord
    expect(calcBaseFret([2, 2, 1, 0])).toBe(1); // Dm chord
  });

  it("returns 1 when max pressed fret is exactly 4", () => {
    expect(calcBaseFret([4, 4, 4, 2])).toBe(1); // E chord
  });

  it("returns min pressed fret when max fret exceeds 4", () => {
    expect(calcBaseFret([5, 3, 4, 3])).toBe(3); // min=3
    expect(calcBaseFret([7, 5, 6, 5])).toBe(5); // min=5
  });

  it("ignores open strings when finding min pressed fret", () => {
    expect(calcBaseFret([0, 5, 0, 5])).toBe(5);
  });

  it("ignores muted strings (-1) when finding min pressed fret", () => {
    expect(calcBaseFret([-1, 6, -1, 5])).toBe(5);
  });

  it("handles all muted strings", () => {
    expect(calcBaseFret([-1, -1, -1, -1])).toBe(1);
  });
});

// ─── buildDiagramModel ───────────────────────────────────────────────────────

describe("buildDiagramModel", () => {
  it("produces correct model for C major [0,0,0,3]", () => {
    const model = buildDiagramModel({ frets: [0, 0, 0, 3] });
    expect(model.baseFret).toBe(1);
    expect(model.showFretNum).toBe(false);
    expect(model.opens).toEqual([0, 1, 2]); // G, C, E strings open
    expect(model.mutes).toEqual([]);
    expect(model.dots).toContainEqual({ stringIdx: 3, dotYIdx: 2 }); // A string, fret 3 → rel 3 → dotYIdx 2
  });

  it("produces correct model for Am [2,0,0,0]", () => {
    const model = buildDiagramModel({ frets: [2, 0, 0, 0] });
    expect(model.opens).toEqual([1, 2, 3]); // C, E, A open
    expect(model.dots).toContainEqual({ stringIdx: 0, dotYIdx: 1 }); // G string, fret 2 → rel 2 → dotYIdx 1
  });

  it("sets showFretNum=true when baseFret > 1", () => {
    const model = buildDiagramModel({ frets: [5, 3, 4, 3] });
    expect(model.baseFret).toBe(3);
    expect(model.showFretNum).toBe(true);
  });

  it("maps muted strings correctly", () => {
    const model = buildDiagramModel({ frets: [-1, 2, 2, 0] });
    expect(model.mutes).toEqual([0]);
    expect(model.opens).toEqual([3]);
  });

  it("clips dots that fall outside the display window (span > 4 frets)", () => {
    // frets: [2, 8, 3, 4] → baseFret = min(2,8,3,4) = 2
    // C string (fret 8): relative = 8-2+1 = 7 > FRETS_SHOW(4) → clipped
    const model = buildDiagramModel({ frets: [2, 8, 3, 4] });
    const dotStrings = model.dots.map(d => d.stringIdx);
    expect(dotStrings).not.toContain(1); // stringIdx 1 = C string (fret 8) clipped
    expect(dotStrings).toContain(0);    // G string fret 2 → rel 1 → included
    expect(dotStrings).toContain(2);    // E string fret 3 → rel 2 → included
  });
});
