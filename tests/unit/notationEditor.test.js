// Tests for pure Notation-editor logic in notationEditor.js
import { describe, it, expect } from "vitest";
import {
  buildNotationConfig,
  buildNoteRows,
  updateNoteField,
  stampNoteTime,
  shiftNoteTime,
  insertNoteRow,
  removeNoteRow,
  updateConfigField,
  countNotationStamped,
  exportToNotationJson,
  computeMeasureMap,
} from "../../src/utils/notationEditor.js";

/** Quick row factory for measure-map tests. */
const note = dur => ({ pitch: "A4", dur, time: null });

const sample = {
  config: { clef: "treble", key: "G", timeSignature: [3, 4], measuresPerRow: 2, pickupBeats: 1 },
  notes: [
    { pitch: "A4", dur: "quarter", time: 1.0 },
    { pitch: "B4", dur: "half" },
  ],
};

describe("buildNotationConfig", () => {
  it("normalises an existing config", () => {
    expect(buildNotationConfig(sample)).toEqual({
      clef: "treble", key: "G", timeSignature: [3, 4], measuresPerRow: 2, pickupBeats: 1,
    });
  });

  it("returns defaults for null", () => {
    expect(buildNotationConfig(null)).toEqual({
      clef: "treble", key: "C", timeSignature: [4, 4], measuresPerRow: 3, pickupBeats: 0,
    });
  });
});

describe("buildNoteRows", () => {
  it("maps notes to rows with string fields and null time when absent", () => {
    const rows = buildNoteRows(sample);
    expect(rows).toEqual([
      { pitch: "A4", dur: "quarter", time: 1.0 },
      { pitch: "B4", dur: "half", time: null },
    ]);
  });

  it("returns [] for missing notes", () => {
    expect(buildNoteRows(null)).toEqual([]);
    expect(buildNoteRows({})).toEqual([]);
  });
});

describe("updateNoteField", () => {
  it("merges a patch immutably", () => {
    const rows = buildNoteRows(sample);
    const next = updateNoteField(rows, 0, { pitch: "C5" });
    expect(next[0].pitch).toBe("C5");
    expect(next[0].dur).toBe("quarter");
    expect(rows[0].pitch).toBe("A4"); // original untouched
  });

  it("ignores out-of-range idx", () => {
    const rows = buildNoteRows(sample);
    expect(updateNoteField(rows, 9, { pitch: "X" })).toBe(rows);
  });
});

describe("stampNoteTime / shiftNoteTime", () => {
  it("stamps a time clamped to ≥ 0", () => {
    const rows = buildNoteRows(sample);
    expect(stampNoteTime(rows, 1, 5.5)[1].time).toBe(5.5);
    expect(stampNoteTime(rows, 1, -3)[1].time).toBe(0);
  });

  it("shifts an existing time but ignores unstamped rows", () => {
    const rows = buildNoteRows(sample);
    expect(shiftNoteTime(rows, 0, 0.1)[0].time).toBeCloseTo(1.1, 5);
    expect(shiftNoteTime(rows, 1, 0.1)[1].time).toBeNull(); // was null → unchanged
  });
});

describe("insertNoteRow / removeNoteRow", () => {
  it("inserts after the given index", () => {
    const rows = buildNoteRows(sample);
    const next = insertNoteRow(rows, 0);
    expect(next).toHaveLength(3);
    expect(next[1]).toEqual({ pitch: "", dur: "quarter", time: null });
  });

  it("prepends with afterIdx = -1", () => {
    const next = insertNoteRow(buildNoteRows(sample), -1);
    expect(next[0].pitch).toBe("");
  });

  it("removes the row at idx", () => {
    const next = removeNoteRow(buildNoteRows(sample), 0);
    expect(next).toHaveLength(1);
    expect(next[0].pitch).toBe("B4");
  });
});

describe("updateConfigField", () => {
  it("applies and renormalises a patch", () => {
    const cfg = updateConfigField(buildNotationConfig(sample), { key: "F" });
    expect(cfg.key).toBe("F");
    expect(cfg.timeSignature).toEqual([3, 4]); // others preserved
  });
});

describe("countNotationStamped", () => {
  it("counts stamped vs total", () => {
    expect(countNotationStamped(buildNoteRows(sample))).toEqual({ stamped: 1, total: 2 });
  });
});

describe("exportToNotationJson", () => {
  it("round-trips config + notes and preserves order", () => {
    const rows = buildNoteRows(sample);
    const json = JSON.parse(exportToNotationJson(buildNotationConfig(sample), rows));
    expect(json.config.key).toBe("G");
    expect(json.notes).toEqual([
      { pitch: "A4", dur: "quarter", time: 1.0 },
      { pitch: "B4", dur: "half" }, // no time key when unstamped
    ]);
  });

  it("drops empty-pitch rows", () => {
    const rows = [
      { pitch: "A4", dur: "quarter", time: null },
      { pitch: "",   dur: "quarter", time: null },
      { pitch: "  ", dur: "half",    time: null },
    ];
    const json = JSON.parse(exportToNotationJson({}, rows));
    expect(json.notes).toHaveLength(1);
    expect(json.notes[0].pitch).toBe("A4");
  });

  it("does not reorder notes by time", () => {
    const rows = [
      { pitch: "C5", dur: "quarter", time: 9 },
      { pitch: "A4", dur: "quarter", time: 1 },
    ];
    const json = JSON.parse(exportToNotationJson({}, rows));
    expect(json.notes.map(n => n.pitch)).toEqual(["C5", "A4"]);
  });
});

describe("computeMeasureMap", () => {
  it("flags the note that completes each 4/4 measure", () => {
    const rows = [note("quarter"), note("quarter"), note("quarter"), note("quarter"), note("quarter")];
    const map = computeMeasureMap(rows, [4, 4]);
    expect(map.map(m => m.completesMeasure)).toEqual([false, false, false, true, false]);
    expect(map[3].endBeat).toBe(4);
    expect(map[4].measureIndex).toBe(1);
  });

  it("completes a 3/4 measure after three quarters", () => {
    const rows = [note("quarter"), note("quarter"), note("quarter")];
    const map = computeMeasureMap(rows, [3, 4]);
    expect(map[2].completesMeasure).toBe(true);
  });

  it("completes a measure with two half notes in 4/4", () => {
    const map = computeMeasureMap([note("half"), note("half")], [4, 4]);
    expect(map.map(m => m.completesMeasure)).toEqual([false, true]);
  });

  it("flags a note that spills across a bar line", () => {
    // 3 quarters (beats 0–3), then a half note → ends at 5, crossing the bar at 4.
    const map = computeMeasureMap(
      [note("quarter"), note("quarter"), note("quarter"), note("half")], [4, 4]);
    expect(map[3].overflowsBar).toBe(true);
    expect(map[3].completesMeasure).toBe(false);
  });

  it("treats 6/8 as three quarter-beats per measure", () => {
    const map = computeMeasureMap([note("quarter"), note("quarter"), note("quarter")], [6, 8]);
    expect(map[2].completesMeasure).toBe(true);
  });

  it("returns [] for empty input", () => {
    expect(computeMeasureMap([], [4, 4])).toEqual([]);
  });
});
