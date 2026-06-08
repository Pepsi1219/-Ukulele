// Tests for pure (non-DOM) logic in chordDiagram.js
import { describe, it, expect } from "vitest";
import {
  getChordData,
  calcBaseFret,
  buildDiagramModel,
  getRootNoteName,
  findFretForNote,
  pickNotePosition,
  buildNotePositionModel,
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

// ─── getRootNoteName ─────────────────────────────────────────────────────────

describe("getRootNoteName", () => {
  it("extracts a plain root note", () => {
    expect(getRootNoteName("C")).toBe("C");
    expect(getRootNoteName("G")).toBe("G");
  });

  it("extracts the root from minor / 7th / extended chord names", () => {
    expect(getRootNoteName("Cm")).toBe("C");
    expect(getRootNoteName("Cm7")).toBe("C");
    expect(getRootNoteName("Gmaj7")).toBe("G");
    expect(getRootNoteName("Dsus4")).toBe("D");
  });

  it("extracts flat / sharp roots", () => {
    expect(getRootNoteName("Bb")).toBe("Bb");
    expect(getRootNoteName("Bbmaj7")).toBe("Bb");
    expect(getRootNoteName("F#m")).toBe("F#");
  });

  it("trims whitespace before parsing", () => {
    expect(getRootNoteName(" Am ")).toBe("A");
  });

  it("returns null for unparsable / non-note input", () => {
    expect(getRootNoteName("Xyz")).toBeNull();
    expect(getRootNoteName("")).toBeNull();
    expect(getRootNoteName(null)).toBeNull();
    expect(getRootNoteName(undefined)).toBeNull();
  });
});

// ─── findFretForNote ─────────────────────────────────────────────────────────
// GCEA tuning — open-string pitch classes: G=7, C=0, E=4, A=9 (index 0..3)

describe("findFretForNote", () => {
  it("returns fret 0 when the note matches the open string", () => {
    expect(findFretForNote(0, "G")).toBe(0); // G string open
    expect(findFretForNote(1, "C")).toBe(0); // C string open
    expect(findFretForNote(2, "E")).toBe(0); // E string open
    expect(findFretForNote(3, "A")).toBe(0); // A string open
  });

  it("computes the correct fret for a fretted note on the A string", () => {
    // A string: 0=A, 1=A#/Bb, 2=B, 3=C — matches the user's reference mapping
    expect(findFretForNote(3, "A")).toBe(0);
    expect(findFretForNote(3, "Bb")).toBe(1);
    expect(findFretForNote(3, "B")).toBe(2);
    expect(findFretForNote(3, "C")).toBe(3);
  });

  it("finds the same note at different positions on different strings", () => {
    // Note "C" exists at: C string open (fret 0) AND A string fret 3
    expect(findFretForNote(1, "C")).toBe(0);
    expect(findFretForNote(3, "C")).toBe(3);
  });

  it("wraps around correctly when the note is below the open pitch", () => {
    // G string (open = G, pitch 7); note "E" (pitch 4) → (4-7+12)%12 = 9
    expect(findFretForNote(0, "E")).toBe(9);
  });

  it("returns null for an unrecognised note name", () => {
    expect(findFretForNote(0, "H")).toBeNull();
    expect(findFretForNote(0, "")).toBeNull();
  });
});

// ─── pickNotePosition ────────────────────────────────────────────────────────

describe("pickNotePosition", () => {
  it("forces the note onto the chosen string in single-string modes", () => {
    expect(pickNotePosition("C", "A")).toEqual({ stringIdx: 3, fret: 3 });
    expect(pickNotePosition("C", "C")).toEqual({ stringIdx: 1, fret: 0 });
    expect(pickNotePosition("G", "G")).toEqual({ stringIdx: 0, fret: 0 });
  });

  it("returns null in single-string mode for an unrecognised note", () => {
    expect(pickNotePosition("H", "A")).toBeNull();
  });

  it("returns null for an unrecognised mode", () => {
    expect(pickNotePosition("C", "Z")).toBeNull();
  });

  it("auto mode with no previous position picks the lowest-fret option (easiest reach)", () => {
    // Note "C": G str fret5, C str fret0, E str fret8, A str fret3 → lowest = C string open
    expect(pickNotePosition("C", "auto", null)).toEqual({ stringIdx: 1, fret: 0 });
  });

  it("auto mode favours the position closest to the previous one (least hand movement)", () => {
    // Coming from A string fret 3 (note C), next note "G":
    // candidates → G:[0,0] C:[1,7] E:[2,3] A:[3,10]
    // distance = |Δfret|*2 + |Δstring|  → G:9  C:10  E:1  A:14 → E string wins
    const prev = { stringIdx: 3, fret: 3 };
    expect(pickNotePosition("G", "auto", prev)).toEqual({ stringIdx: 2, fret: 3 });
  });

  it("auto mode returns null for an unrecognised note", () => {
    expect(pickNotePosition("H", "auto", null)).toBeNull();
  });
});

// ─── buildNotePositionModel ──────────────────────────────────────────────────

describe("buildNotePositionModel", () => {
  it("highlights an open string with a circle indicator", () => {
    const model = buildNotePositionModel({ stringIdx: 1, fret: 0 }, "C");
    expect(model.noteLabel).toBe("C");
    expect(model.opens).toEqual([1]);
    expect(model.dots).toEqual([]);
    expect(model.mutes).toEqual([]);
  });

  it("highlights a fretted position with a single dot", () => {
    const model = buildNotePositionModel({ stringIdx: 3, fret: 3 }, "C");
    expect(model.noteLabel).toBe("C");
    expect(model.dots).toEqual([{ stringIdx: 3, dotYIdx: 2 }]); // rel = 3-1+1 = 3 → idx 2
    expect(model.opens).toEqual([]);
    expect(model.baseFret).toBe(1);
    expect(model.showFretNum).toBe(false);
  });

  it("shows the base-fret number when the position is high up the neck", () => {
    const model = buildNotePositionModel({ stringIdx: 0, fret: 9 }, "E");
    expect(model.baseFret).toBe(9);
    expect(model.showFretNum).toBe(true);
    expect(model.dots).toEqual([{ stringIdx: 0, dotYIdx: 0 }]);
  });

  it("returns an empty highlight (with label) when no position is given", () => {
    const model = buildNotePositionModel(null, "C");
    expect(model.noteLabel).toBe("C");
    expect(model.dots).toEqual([]);
    expect(model.opens).toEqual([]);
  });
});
