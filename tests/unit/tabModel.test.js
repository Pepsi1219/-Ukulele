import { describe, it, expect } from "vitest";
import {
  UKE_OPEN_MIDI,
  UKE_TAB_ROW_ORDER,
  MAX_FRET,
  midiFromPitch,
  midiFromNote,
  positionsForMidi,
  pickBestPosition,
  computeTabPositions,
} from "../../src/utils/tabModel.js";
import { parseNotation } from "../../src/utils/notationModel.js";

describe("UKE_OPEN_MIDI (reentrant G-C-E-A)", () => {
  it("has G4=67, C4=60, E4=64, A4=69 in that order", () => {
    expect(UKE_OPEN_MIDI).toEqual([67, 60, 64, 69]);
  });
});

describe("UKE_TAB_ROW_ORDER", () => {
  it("draws A on top, G on bottom (standard uke-tab convention)", () => {
    expect(UKE_TAB_ROW_ORDER).toEqual([3, 2, 1, 0]);
  });
});

describe("midiFromPitch", () => {
  it("C4 → 60, A4 → 69, F#4 → 66, Bb3 → 58", () => {
    expect(midiFromPitch({ step: "C", octave: 4, alter: 0 })).toBe(60);
    expect(midiFromPitch({ step: "A", octave: 4, alter: 0 })).toBe(69);
    expect(midiFromPitch({ step: "F", octave: 4, alter: 1 })).toBe(66);
    expect(midiFromPitch({ step: "B", octave: 3, alter: -1 })).toBe(58);
  });

  it("returns null for rest / invalid input", () => {
    expect(midiFromPitch(null)).toBeNull();
    expect(midiFromPitch({ rest: true })).toBeNull();
    expect(midiFromPitch({ step: "H", octave: 4 })).toBeNull();
    expect(midiFromPitch({ step: "C" })).toBeNull(); // no octave
  });
});

describe("midiFromNote", () => {
  it("reads step/octave/alter from a parsed note", () => {
    expect(midiFromNote({ isRest: false, step: "C", octave: 4, alter: 0 })).toBe(60);
    expect(midiFromNote({ isRest: false, step: "A", octave: 4, alter: 0 })).toBe(69);
  });
  it("returns null for rests", () => {
    expect(midiFromNote({ isRest: true })).toBeNull();
  });
});

describe("positionsForMidi", () => {
  it("returns one position per string that can play the pitch", () => {
    // C4 (MIDI 60) plays on: G(-7 invalid), C(0), E(-4 invalid), A(-9 invalid)
    // → only C string, fret 0
    const p = positionsForMidi(60);
    expect(p).toEqual([{ stringIdx: 1, fret: 0 }]);
  });

  it("A4 plays on multiple strings (open A, or higher frets on lower-pitched strings)", () => {
    // A4 = MIDI 69
    // G string open=67 → fret 2, C string open=60 → fret 9, E string open=64 → fret 5, A string → fret 0
    const p = positionsForMidi(69);
    expect(p).toEqual([
      { stringIdx: 0, fret: 2 },
      { stringIdx: 1, fret: 9 },
      { stringIdx: 2, fret: 5 },
      { stringIdx: 3, fret: 0 },
    ]);
  });

  it("respects maxFret", () => {
    // Very high MIDI: filter out impossible frets
    const p = positionsForMidi(100, MAX_FRET);
    expect(p.every(x => x.fret >= 0 && x.fret <= MAX_FRET)).toBe(true);
  });

  it("returns [] for null (rest)", () => {
    expect(positionsForMidi(null)).toEqual([]);
  });
});

describe("pickBestPosition", () => {
  it("without prev, picks lowest fret (breaking ties by string index)", () => {
    const positions = [
      { stringIdx: 0, fret: 2 },
      { stringIdx: 3, fret: 0 },
    ];
    expect(pickBestPosition(positions, null)).toEqual({ stringIdx: 3, fret: 0 });
  });

  it("with prev, picks the position closest to it", () => {
    const positions = [
      { stringIdx: 0, fret: 2 },  // string dist 3 * 2 + fret dist 2 = 8
      { stringIdx: 3, fret: 0 },  // string dist 0 * 2 + fret dist 0 = 0
    ];
    const prev = { stringIdx: 3, fret: 0 };
    expect(pickBestPosition(positions, prev)).toEqual({ stringIdx: 3, fret: 0 });
  });

  it("returns null when no positions", () => {
    expect(pickBestPosition([], null)).toBeNull();
    expect(pickBestPosition([], { stringIdx: 0, fret: 0 })).toBeNull();
  });
});

describe("computeTabPositions — smart fingering", () => {
  it("returns one entry per note, in the same order (null for rests)", () => {
    const model = parseNotation({
      notes: [
        { pitch: "C4", dur: "quarter" },
        { pitch: "rest", dur: "quarter" },
        { pitch: "E4", dur: "quarter" },
      ],
    });
    const positions = computeTabPositions(model);
    expect(positions).toHaveLength(3);
    expect(positions[1]).toBeNull();
  });

  it("first note (no prev) picks lowest fret", () => {
    const model = parseNotation({ notes: [{ pitch: "A4", dur: "quarter" }] });
    // Lowest-fret A4 = open A string
    expect(computeTabPositions(model)[0]).toEqual({ stringIdx: 3, fret: 0 });
  });

  it("smart pick keeps hand close to previous note", () => {
    // Start with a hand position deep in the neck, then play a note that
    // *could* be an open string but is nearer to the current hand as a
    // higher fret. The smart picker should prefer proximity.
    const model = parseNotation({
      notes: [
        { pitch: "C5", dur: "quarter", tabString: 3, tabFret: 3 }, // pin: A string fret 3
        { pitch: "E5", dur: "quarter" },                            // could be A fret 7 or E fret 12
      ],
    });
    const pos = computeTabPositions(model);
    expect(pos[0]).toEqual({ stringIdx: 3, fret: 3 });
    // From A-string fret 3, the closest E5 is A-string fret 7 (dist=4),
    // not E-string fret 12 (dist=1*2+9=11).
    expect(pos[1]).toEqual({ stringIdx: 3, fret: 7 });
  });

  it("per-note override wins even if algorithm would choose differently", () => {
    const model = parseNotation({
      notes: [
        { pitch: "A4", dur: "quarter", tabString: 0, tabFret: 2 }, // force G-string fret 2
      ],
    });
    // Auto would pick A-string open (lowest fret). Override forces G string fret 2.
    expect(computeTabPositions(model)[0]).toEqual({ stringIdx: 0, fret: 2 });
  });

  it("partial override (only string, or only fret) is ignored", () => {
    const model = parseNotation({
      notes: [
        { pitch: "A4", dur: "quarter", tabString: 0 }, // no tabFret — ignore
      ],
    });
    // Falls back to algorithm: open A
    expect(computeTabPositions(model)[0]).toEqual({ stringIdx: 3, fret: 0 });
  });

  it("out-of-range override is ignored (safe fallback to auto)", () => {
    const model = parseNotation({
      notes: [
        { pitch: "A4", dur: "quarter", tabString: 9, tabFret: 3 },   // bad string
        { pitch: "C4", dur: "quarter", tabString: 1, tabFret: -1 },  // bad fret
      ],
    });
    const pos = computeTabPositions(model);
    expect(pos[0]).toEqual({ stringIdx: 3, fret: 0 });
    expect(pos[1]).toEqual({ stringIdx: 1, fret: 0 });
  });

  it("handles empty / null model gracefully", () => {
    expect(computeTabPositions(null)).toEqual([]);
    expect(computeTabPositions({})).toEqual([]);
    expect(computeTabPositions({ notes: [] })).toEqual([]);
  });
});
