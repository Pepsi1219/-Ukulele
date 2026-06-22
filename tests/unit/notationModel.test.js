// Tests for pure musical-semantics helpers in notationModel.js
import { describe, it, expect } from "vitest";
import {
  parsePitch,
  diatonicIndex,
  staffStepForPitch,
  parseDuration,
  isKnownKey,
  keySignature,
  normalizeConfig,
  parseNotation,
  chordsToNotation,
} from "../../src/utils/notationModel.js";

// ─── parsePitch ───────────────────────────────────────────────────────────────

describe("parsePitch", () => {
  it("parses a plain pitch", () => {
    expect(parsePitch("C4")).toEqual({ rest: false, step: "C", alter: 0, octave: 4 });
  });

  it("parses sharps and flats", () => {
    expect(parsePitch("F#4")).toEqual({ rest: false, step: "F", alter: 1, octave: 4 });
    expect(parsePitch("Bb3")).toEqual({ rest: false, step: "B", alter: -1, octave: 3 });
  });

  it("lowercases the step letter", () => {
    expect(parsePitch("a5").step).toBe("A");
  });

  it("recognises rests case-insensitively", () => {
    expect(parsePitch("rest")).toEqual({ rest: true });
    expect(parsePitch("REST")).toEqual({ rest: true });
  });

  it("returns null for invalid input", () => {
    expect(parsePitch("")).toBeNull();
    expect(parsePitch("H4")).toBeNull();
    expect(parsePitch("C")).toBeNull();
    expect(parsePitch(42)).toBeNull();
  });
});

// ─── diatonicIndex ──────────────────────────────────────────────────────────--

describe("diatonicIndex", () => {
  it("counts white-key steps from C0", () => {
    expect(diatonicIndex("C", 4)).toBe(28);
    expect(diatonicIndex("B", 4)).toBe(34);
    expect(diatonicIndex("C", 5)).toBe(35);
  });

  it("is monotonic across octaves", () => {
    expect(diatonicIndex("C", 5)).toBeGreaterThan(diatonicIndex("B", 4));
  });
});

// ─── staffStepForPitch ────────────────────────────────────────────────────────

describe("staffStepForPitch", () => {
  it("places E4 on the bottom treble line (step 0)", () => {
    expect(staffStepForPitch({ step: "E", octave: 4 }, "treble")).toBe(0);
  });

  it("places F5 on the top treble line (step 8)", () => {
    expect(staffStepForPitch({ step: "F", octave: 5 }, "treble")).toBe(8);
  });

  it("places middle C below the treble staff (step -2)", () => {
    expect(staffStepForPitch({ step: "C", octave: 4 }, "treble")).toBe(-2);
  });

  it("places G2 on the bottom bass line (step 0)", () => {
    expect(staffStepForPitch({ step: "G", octave: 2 }, "bass")).toBe(0);
  });
});

// ─── parseDuration ────────────────────────────────────────────────────────────

describe("parseDuration", () => {
  it("maps note values to beats", () => {
    expect(parseDuration("whole").beats).toBe(4);
    expect(parseDuration("half").beats).toBe(2);
    expect(parseDuration("quarter").beats).toBe(1);
    expect(parseDuration("eighth").beats).toBe(0.5);
    expect(parseDuration("sixteenth").beats).toBe(0.25);
  });

  it("applies the dotted multiplier", () => {
    expect(parseDuration("quarter.").beats).toBe(1.5);
    expect(parseDuration("half.").beats).toBe(3);
    expect(parseDuration("quarter.").dotted).toBe(true);
  });

  it("marks half/whole as hollow and shorter values as filled", () => {
    expect(parseDuration("half").filled).toBe(false);
    expect(parseDuration("whole").filled).toBe(false);
    expect(parseDuration("quarter").filled).toBe(true);
    expect(parseDuration("eighth").filled).toBe(true);
  });

  it("counts flags for eighth and sixteenth", () => {
    expect(parseDuration("quarter").flags).toBe(0);
    expect(parseDuration("eighth").flags).toBe(1);
    expect(parseDuration("sixteenth").flags).toBe(2);
  });

  it("defaults unknown values to a quarter note", () => {
    expect(parseDuration("bogus")).toMatchObject({ beats: 1, glyph: "quarter" });
    expect(parseDuration(undefined).glyph).toBe("quarter");
  });
});

// ─── key signature ────────────────────────────────────────────────────────────

describe("keySignature", () => {
  it("returns no accidentals for C major", () => {
    expect(keySignature("C")).toEqual({ type: "none", steps: [] });
  });

  it("returns sharps in order for sharp keys", () => {
    expect(keySignature("G")).toEqual({ type: "sharp", steps: ["F"] });
    expect(keySignature("D")).toEqual({ type: "sharp", steps: ["F", "C"] });
  });

  it("returns flats in order for flat keys", () => {
    expect(keySignature("F")).toEqual({ type: "flat", steps: ["B"] });
    expect(keySignature("Bb")).toEqual({ type: "flat", steps: ["B", "E"] });
  });

  it("treats unknown keys as C", () => {
    expect(keySignature("nonsense")).toEqual({ type: "none", steps: [] });
  });
});

describe("isKnownKey", () => {
  it("recognises valid keys and rejects others", () => {
    expect(isKnownKey("C")).toBe(true);
    expect(isKnownKey("F#")).toBe(true);
    expect(isKnownKey("Q")).toBe(false);
    expect(isKnownKey(null)).toBe(false);
  });
});

// ─── normalizeConfig ──────────────────────────────────────────────────────────

describe("normalizeConfig", () => {
  it("fills defaults for an empty config", () => {
    expect(normalizeConfig()).toEqual({
      clef: "treble",
      key: "C",
      timeSignature: [4, 4],
      measuresPerRow: 3,
      pickupBeats: 0,
    });
  });

  it("honours valid values", () => {
    const cfg = normalizeConfig({
      clef: "bass", key: "G", timeSignature: [3, 4], measuresPerRow: 2, pickupBeats: 1,
    });
    expect(cfg).toEqual({
      clef: "bass", key: "G", timeSignature: [3, 4], measuresPerRow: 2, pickupBeats: 1,
    });
  });

  it("clamps and rejects bad values", () => {
    const cfg = normalizeConfig({
      clef: "alto", key: "ZZ", timeSignature: "nope", measuresPerRow: 0, pickupBeats: -5,
    });
    expect(cfg.clef).toBe("treble");
    expect(cfg.key).toBe("C");
    expect(cfg.timeSignature).toEqual([4, 4]);
    expect(cfg.measuresPerRow).toBe(1);
    expect(cfg.pickupBeats).toBe(0);
  });
});

// ─── parseNotation ────────────────────────────────────────────────────────────

describe("parseNotation", () => {
  it("returns normalised config and notes with positions", () => {
    const model = parseNotation({
      config: { key: "C", timeSignature: [4, 4] },
      notes: [
        { pitch: "A4", dur: "quarter", time: 1.0 },
        { pitch: "rest", dur: "eighth" },
        { pitch: "C5", dur: "half", time: 2.0 },
      ],
    });
    expect(model.notes).toHaveLength(3);
    expect(model.notes[0]).toMatchObject({
      idx: 0, isRest: false, step: "A", octave: 4, durBeats: 1, time: 1.0,
    });
    expect(model.notes[1].isRest).toBe(true);
    expect(model.notes[2]).toMatchObject({ step: "C", durBeats: 2, time: 2.0 });
  });

  it("computes the staff step relative to the configured clef", () => {
    const model = parseNotation({ config: { clef: "treble" }, notes: [{ pitch: "E4", dur: "quarter" }] });
    expect(model.notes[0].staffStep).toBe(0);
  });

  it("builds a letter label including accidentals", () => {
    const model = parseNotation({ notes: [{ pitch: "F#4", dur: "quarter" }] });
    expect(model.notes[0].label).toBe("F♯");
  });

  it("tolerates missing/empty input", () => {
    expect(parseNotation(null).notes).toEqual([]);
    expect(parseNotation({}).notes).toEqual([]);
  });
});

// ─── chordsToNotation (legacy adapter) ────────────────────────────────────────

describe("chordsToNotation", () => {
  it("converts single-letter melody chords into notes at octave 4", () => {
    const model = chordsToNotation([
      { time: 0, chord: "A" },
      { time: 1, chord: "B" },
    ], 60); // 60 bpm → 1 beat = 1s
    expect(model.notes).toHaveLength(2);
    expect(model.notes[0]).toMatchObject({ step: "A", octave: 4 });
    expect(model.notes[1].step).toBe("B");
  });

  it("strips chord suffixes to the root letter", () => {
    const model = chordsToNotation([{ time: 0, chord: "Am7" }], 60);
    expect(model.notes[0].step).toBe("A");
  });

  it("infers duration from the gap to the next note", () => {
    const model = chordsToNotation([
      { time: 0, chord: "C" },   // 2s gap @60bpm → 2 beats → half
      { time: 2, chord: "D" },
    ], 60);
    expect(model.notes[0].glyph).toBe("half");
  });

  it("returns an empty model for empty input", () => {
    expect(chordsToNotation([]).notes).toEqual([]);
    expect(chordsToNotation(null).notes).toEqual([]);
  });
});
