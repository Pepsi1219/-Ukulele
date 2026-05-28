// Tests for pure timestamp-editor logic in timestampEditor.js
import { describe, it, expect, beforeEach } from "vitest";
import {
  buildEditorRows,
  applyStamp,
  shiftTime,
  exportToLyricsJson,
  countStamped,
  updateSegment,
  addSegment,
  removeSegment,
  insertLineRow,
  removeRow,
  insertSectionRow,
  updateSectionName,
} from "../../src/utils/timestampEditor.js";

// ─── Sample fixture ───────────────────────────────────────────────────────────

const SAMPLE_LYRICS = [
  { section: "Verse 1" },
  { time: 5.2, line: [{ chord: "C",  lyric: "เนื้อหาบรรทัดหนึ่ง" }] },
  { time: 8.0, line: [{ chord: "G",  lyric: "บรรทัดสอง" }, { chord: "Am", lyric: "ต่อ" }] },
  { section: "Chorus" },
  { time: 12.5, line: [{ chord: "F", lyric: "คอรัส" }] },
];

// ─── buildEditorRows ──────────────────────────────────────────────────────────

describe("buildEditorRows", () => {
  it("returns [] for non-array input", () => {
    expect(buildEditorRows(null)).toEqual([]);
    expect(buildEditorRows({})).toEqual([]);
    expect(buildEditorRows("string")).toEqual([]);
  });

  it("returns [] for empty array", () => {
    expect(buildEditorRows([])).toEqual([]);
  });

  it("builds section rows correctly", () => {
    const rows = buildEditorRows(SAMPLE_LYRICS);
    const sectionRows = rows.filter(r => r.type === "section");
    expect(sectionRows).toHaveLength(2);
    expect(sectionRows[0].sectionName).toBe("Verse 1");
    expect(sectionRows[0].originalIndex).toBe(0);
    expect(sectionRows[0].time).toBeNull();
    expect(sectionRows[1].sectionName).toBe("Chorus");
  });

  it("builds line rows correctly", () => {
    const rows = buildEditorRows(SAMPLE_LYRICS);
    const lineRows = rows.filter(r => r.type === "line");
    expect(lineRows).toHaveLength(3);
  });

  it("stores the correct time on line rows", () => {
    const rows = buildEditorRows(SAMPLE_LYRICS);
    const lineRows = rows.filter(r => r.type === "line");
    expect(lineRows[0].time).toBe(5.2);
    expect(lineRows[1].time).toBe(8.0);
    expect(lineRows[2].time).toBe(12.5);
  });

  it("stores null time when time is absent or invalid", () => {
    const lyrics = [
      { line: [{ chord: "C", lyric: "no time" }] },             // missing time
      { time: null,  line: [{ chord: "G", lyric: "null" }] },   // explicit null
      { time: "bad", line: [{ chord: "Am", lyric: "string" }] },// non-numeric string
    ];
    const rows = buildEditorRows(lyrics);
    expect(rows[0].time).toBeNull();
    expect(rows[1].time).toBeNull();
    expect(rows[2].time).toBeNull();
  });

  it("stores numeric string times as numbers", () => {
    const lyrics = [{ time: "5.5", line: [{ chord: "C", lyric: "x" }] }];
    const rows = buildEditorRows(lyrics);
    expect(rows[0].time).toBe(5.5);
  });

  it("extracts first chord for display", () => {
    const rows = buildEditorRows(SAMPLE_LYRICS);
    const lineRows = rows.filter(r => r.type === "line");
    expect(lineRows[0].chord).toBe("C");
    expect(lineRows[1].chord).toBe("G");  // first segment of multi-segment line
  });

  it("joins lyric text from multi-segment lines", () => {
    const rows = buildEditorRows(SAMPLE_LYRICS);
    const lineRows = rows.filter(r => r.type === "line");
    expect(lineRows[1].lyric).toContain("บรรทัดสอง");
    expect(lineRows[1].lyric).toContain("ต่อ");
  });

  it("preserves originalLine verbatim", () => {
    const rows = buildEditorRows(SAMPLE_LYRICS);
    const lineRows = rows.filter(r => r.type === "line");
    expect(lineRows[0].originalLine).toBe(SAMPLE_LYRICS[1].line); // same reference
  });

  it("skips null / unrecognised entries", () => {
    const lyrics = [
      null,
      { unknown: "field" },
      { time: 1, line: [{ chord: "C", lyric: "ok" }] },
    ];
    const rows = buildEditorRows(lyrics);
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("line");
  });
});

// ─── applyStamp ───────────────────────────────────────────────────────────────

describe("applyStamp", () => {
  let rows;
  beforeEach(() => { rows = buildEditorRows(SAMPLE_LYRICS); });

  it("sets the time on a line row", () => {
    const result = applyStamp(rows, 1, 6.3);
    expect(result[1].time).toBe(6.3);
  });

  it("does not modify the original rows array (pure)", () => {
    const originalTime = rows[1].time;
    applyStamp(rows, 1, 99);
    expect(rows[1].time).toBe(originalTime);
  });

  it("clamps negative time to 0", () => {
    const result = applyStamp(rows, 1, -5);
    expect(result[1].time).toBe(0);
  });

  it("treats non-finite time as 0", () => {
    expect(applyStamp(rows, 1, Infinity)[1].time).toBe(0);
    expect(applyStamp(rows, 1, NaN)[1].time).toBe(0);
  });

  it("returns original array when rowIndex is out of range", () => {
    expect(applyStamp(rows, -1,   5)).toBe(rows);
    expect(applyStamp(rows, 999,  5)).toBe(rows);
  });

  it("returns original array for section rows", () => {
    // rows[0] is a section row
    expect(applyStamp(rows, 0, 5)).toBe(rows);
  });

  it("returns original array for non-array input", () => {
    expect(applyStamp(null, 0, 5)).toBeNull();
  });
});

// ─── shiftTime ────────────────────────────────────────────────────────────────

describe("shiftTime", () => {
  let rows;
  beforeEach(() => { rows = buildEditorRows(SAMPLE_LYRICS); });

  it("adds deltaSeconds to a stamped line row", () => {
    const result = shiftTime(rows, 1, 0.1);
    expect(result[1].time).toBeCloseTo(5.3, 5);
  });

  it("subtracts deltaSeconds from a stamped line row", () => {
    const result = shiftTime(rows, 1, -0.1);
    expect(result[1].time).toBeCloseTo(5.1, 5);
  });

  it("clamps result to 0 (never negative)", () => {
    const smallTime = buildEditorRows([{ time: 0.05, line: [{ chord: "C", lyric: "x" }] }]);
    const result = shiftTime(smallTime, 0, -1.0);
    expect(result[0].time).toBe(0);
  });

  it("does not shift when row time is null", () => {
    const nullRows = buildEditorRows([{ line: [{ chord: "C", lyric: "x" }] }]);
    expect(shiftTime(nullRows, 0, 0.5)).toBe(nullRows);
  });

  it("does not shift section rows", () => {
    expect(shiftTime(rows, 0, 1)).toBe(rows);
  });

  it("returns original array when rowIndex is out of range", () => {
    expect(shiftTime(rows, -1, 0.1)).toBe(rows);
    expect(shiftTime(rows, 999, 0.1)).toBe(rows);
  });

  it("returns original array for non-finite delta", () => {
    expect(shiftTime(rows, 1, NaN)).toBe(rows);
    expect(shiftTime(rows, 1, Infinity)).toBe(rows);
  });

  it("is pure — does not mutate original rows", () => {
    const originalTime = rows[1].time;
    shiftTime(rows, 1, 2.0);
    expect(rows[1].time).toBe(originalTime);
  });
});

// ─── exportToLyricsJson ───────────────────────────────────────────────────────

describe("exportToLyricsJson", () => {
  it("returns '[]' for empty rows", () => {
    expect(exportToLyricsJson([])).toBe("[]");
  });

  it("returns '[]' for non-array input", () => {
    expect(exportToLyricsJson(null)).toBe("[]");
  });

  it("produces valid JSON", () => {
    const rows  = buildEditorRows(SAMPLE_LYRICS);
    const json  = exportToLyricsJson(rows);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it("round-trips section entries", () => {
    const rows   = buildEditorRows(SAMPLE_LYRICS);
    const parsed = JSON.parse(exportToLyricsJson(rows));
    expect(parsed[0]).toEqual({ section: "Verse 1" });
    expect(parsed[3]).toEqual({ section: "Chorus" });
  });

  it("round-trips line entries with their original time", () => {
    const rows   = buildEditorRows(SAMPLE_LYRICS);
    const parsed = JSON.parse(exportToLyricsJson(rows));
    expect(parsed[1].time).toBe(5.2);
    expect(parsed[1].line).toEqual(SAMPLE_LYRICS[1].line);
  });

  it("preserves multi-segment line arrays", () => {
    const rows   = buildEditorRows(SAMPLE_LYRICS);
    const parsed = JSON.parse(exportToLyricsJson(rows));
    expect(parsed[2].line).toHaveLength(2);
    expect(parsed[2].line[0].chord).toBe("G");
    expect(parsed[2].line[1].chord).toBe("Am");
  });

  it("exports time: 0 for unstamped lines (null time)", () => {
    const lyrics = [{ line: [{ chord: "C", lyric: "x" }] }];  // no time
    const rows   = buildEditorRows(lyrics);
    const parsed = JSON.parse(exportToLyricsJson(rows));
    expect(parsed[0].time).toBe(0);
  });

  it("round-trips a stamp applied after buildEditorRows", () => {
    let rows   = buildEditorRows(SAMPLE_LYRICS);
    rows       = applyStamp(rows, 1, 7.8);
    const parsed = JSON.parse(exportToLyricsJson(rows));
    expect(parsed[1].time).toBe(7.8);
  });
});

// ─── countStamped ─────────────────────────────────────────────────────────────

describe("countStamped", () => {
  it("returns { stamped: 0, total: 0 } for empty array", () => {
    expect(countStamped([])).toEqual({ stamped: 0, total: 0 });
  });

  it("returns { stamped: 0, total: 0 } for non-array input", () => {
    expect(countStamped(null)).toEqual({ stamped: 0, total: 0 });
  });

  it("ignores section rows in total count", () => {
    const rows = buildEditorRows(SAMPLE_LYRICS);
    const { total } = countStamped(rows);
    expect(total).toBe(3); // SAMPLE_LYRICS has 3 line entries
  });

  it("counts stamped line rows correctly", () => {
    const rows = buildEditorRows(SAMPLE_LYRICS);
    // All 3 lines in SAMPLE_LYRICS have times → all stamped
    expect(countStamped(rows)).toEqual({ stamped: 3, total: 3 });
  });

  it("counts unstamped (null time) rows correctly", () => {
    const lyrics = [
      { time: 1, line: [{ chord: "C", lyric: "a" }] },   // stamped
      { line: [{ chord: "G", lyric: "b" }] },             // unstamped
      { line: [{ chord: "Am", lyric: "c" }] },            // unstamped
    ];
    const rows = buildEditorRows(lyrics);
    expect(countStamped(rows)).toEqual({ stamped: 1, total: 3 });
  });

  it("reflects updated count after applyStamp", () => {
    const lyrics = [
      { line: [{ chord: "C", lyric: "a" }] },
      { line: [{ chord: "G", lyric: "b" }] },
    ];
    let rows = buildEditorRows(lyrics);
    expect(countStamped(rows)).toEqual({ stamped: 0, total: 2 });

    rows = applyStamp(rows, 0, 3.5);
    expect(countStamped(rows)).toEqual({ stamped: 1, total: 2 });

    rows = applyStamp(rows, 1, 7.0);
    expect(countStamped(rows)).toEqual({ stamped: 2, total: 2 });
  });
});

// ─── exportToLyricsJson (updated — chord stripping) ───────────────────────────

describe("exportToLyricsJson — chord stripping", () => {
  it("strips empty chord strings from exported segments", () => {
    const lyrics = [{ time: 1, line: [{ chord: "", lyric: "hello" }] }];
    const rows   = buildEditorRows(lyrics);
    const parsed = JSON.parse(exportToLyricsJson(rows));
    expect(parsed[0].line[0]).not.toHaveProperty("chord");
    expect(parsed[0].line[0].lyric).toBe("hello");
  });

  it("strips whitespace-only chord strings", () => {
    const lyrics = [{ time: 1, line: [{ chord: "   ", lyric: "hi" }] }];
    const rows   = buildEditorRows(lyrics);
    const parsed = JSON.parse(exportToLyricsJson(rows));
    expect(parsed[0].line[0]).not.toHaveProperty("chord");
  });

  it("preserves non-empty chord strings", () => {
    const lyrics = [{ time: 1, line: [{ chord: "Am7", lyric: "x" }] }];
    const rows   = buildEditorRows(lyrics);
    const parsed = JSON.parse(exportToLyricsJson(rows));
    expect(parsed[0].line[0].chord).toBe("Am7");
  });

  it("trims whitespace around chord before export", () => {
    const lyrics = [{ time: 1, line: [{ chord: "  G  ", lyric: "x" }] }];
    const rows   = buildEditorRows(lyrics);
    const parsed = JSON.parse(exportToLyricsJson(rows));
    expect(parsed[0].line[0].chord).toBe("G");
  });
});

// ─── updateSegment ────────────────────────────────────────────────────────────

describe("updateSegment", () => {
  let rows;
  beforeEach(() => { rows = buildEditorRows(SAMPLE_LYRICS); });

  it("updates the chord of a segment", () => {
    const result = updateSegment(rows, 1, 0, { chord: "Dm" });
    expect(result[1].originalLine[0].chord).toBe("Dm");
  });

  it("updates the lyric of a segment", () => {
    const result = updateSegment(rows, 1, 0, { lyric: "new text" });
    expect(result[1].originalLine[0].lyric).toBe("new text");
  });

  it("updates both chord and lyric in one call", () => {
    const result = updateSegment(rows, 2, 1, { chord: "E7", lyric: "updated" });
    expect(result[2].originalLine[1].chord).toBe("E7");
    expect(result[2].originalLine[1].lyric).toBe("updated");
  });

  it("does not mutate the original rows (pure)", () => {
    const origChord = rows[1].originalLine[0].chord;
    updateSegment(rows, 1, 0, { chord: "XX" });
    expect(rows[1].originalLine[0].chord).toBe(origChord);
  });

  it("returns original array for out-of-range rowIdx", () => {
    expect(updateSegment(rows, -1, 0, { chord: "C" })).toBe(rows);
    expect(updateSegment(rows, 999, 0, { chord: "C" })).toBe(rows);
  });

  it("returns original array for out-of-range segIdx", () => {
    expect(updateSegment(rows, 1, -1, { chord: "C" })).toBe(rows);
    expect(updateSegment(rows, 1, 99, { chord: "C" })).toBe(rows);
  });

  it("returns original array for section row", () => {
    // rows[0] is a section row
    expect(updateSegment(rows, 0, 0, { chord: "C" })).toBe(rows);
  });

  it("returns original array for non-array input", () => {
    expect(updateSegment(null, 0, 0, { chord: "C" })).toBeNull();
  });
});

// ─── addSegment ───────────────────────────────────────────────────────────────

describe("addSegment", () => {
  let rows;
  beforeEach(() => { rows = buildEditorRows(SAMPLE_LYRICS); });

  it("appends an empty segment to a line row", () => {
    const before = rows[1].originalLine.length;
    const result = addSegment(rows, 1);
    expect(result[1].originalLine).toHaveLength(before + 1);
  });

  it("new segment has chord '' and lyric ''", () => {
    const result = addSegment(rows, 1);
    const last   = result[1].originalLine.at(-1);
    expect(last.chord).toBe("");
    expect(last.lyric).toBe("");
  });

  it("does not mutate original rows (pure)", () => {
    const origLen = rows[1].originalLine.length;
    addSegment(rows, 1);
    expect(rows[1].originalLine).toHaveLength(origLen);
  });

  it("returns original array for section row", () => {
    expect(addSegment(rows, 0)).toBe(rows);
  });

  it("returns original array for out-of-range rowIdx", () => {
    expect(addSegment(rows, 999)).toBe(rows);
  });
});

// ─── removeSegment ────────────────────────────────────────────────────────────

describe("removeSegment", () => {
  let rows;
  beforeEach(() => { rows = buildEditorRows(SAMPLE_LYRICS); });

  it("removes the segment at segIdx", () => {
    // rows[2] has 2 segments (G + Am)
    const result = removeSegment(rows, 2, 0);
    expect(result[2].originalLine).toHaveLength(1);
    expect(result[2].originalLine[0].chord).toBe("Am");
  });

  it("refuses to remove the last remaining segment", () => {
    // rows[1] has only 1 segment
    expect(removeSegment(rows, 1, 0)).toBe(rows);
  });

  it("does not mutate original rows (pure)", () => {
    const origLen = rows[2].originalLine.length;
    removeSegment(rows, 2, 0);
    expect(rows[2].originalLine).toHaveLength(origLen);
  });

  it("returns original array for out-of-range segIdx", () => {
    expect(removeSegment(rows, 2, -1)).toBe(rows);
    expect(removeSegment(rows, 2, 99)).toBe(rows);
  });

  it("returns original array for section row", () => {
    expect(removeSegment(rows, 0, 0)).toBe(rows);
  });

  it("returns original array for out-of-range rowIdx", () => {
    expect(removeSegment(rows, -1, 0)).toBe(rows);
    expect(removeSegment(rows, 999, 0)).toBe(rows);
  });
});

// ─── insertLineRow ────────────────────────────────────────────────────────────

describe("insertLineRow", () => {
  let rows;
  beforeEach(() => { rows = buildEditorRows(SAMPLE_LYRICS); });

  it("inserts a new row after the given index", () => {
    const result = insertLineRow(rows, 1);
    expect(result).toHaveLength(rows.length + 1);
    expect(result[2].type).toBe("line");
  });

  it("new row has type 'line', time null, and one empty segment", () => {
    const result  = insertLineRow(rows, 1);
    const newRow  = result[2];
    expect(newRow.type).toBe("line");
    expect(newRow.time).toBeNull();
    expect(newRow.originalLine).toHaveLength(1);
    expect(newRow.originalLine[0]).toEqual({ chord: "", lyric: "" });
  });

  it("prepends when afterIdx is -1", () => {
    const result = insertLineRow(rows, -1);
    expect(result[0].type).toBe("line");
    expect(result[0].originalLine[0]).toEqual({ chord: "", lyric: "" });
    expect(result).toHaveLength(rows.length + 1);
  });

  it("is pure — does not mutate original rows", () => {
    const origLen = rows.length;
    insertLineRow(rows, 1);
    expect(rows).toHaveLength(origLen);
  });

  it("returns original ref for non-array input", () => {
    expect(insertLineRow(null, 0)).toBeNull();
  });
});

// ─── removeRow ────────────────────────────────────────────────────────────────

describe("removeRow", () => {
  let rows;
  beforeEach(() => { rows = buildEditorRows(SAMPLE_LYRICS); });

  it("removes a line row at the given index", () => {
    const result = removeRow(rows, 1);
    expect(result).toHaveLength(rows.length - 1);
    expect(result.every(r => r !== rows[1])).toBe(true);
  });

  it("removes a section row at the given index", () => {
    const result = removeRow(rows, 0);
    expect(result).toHaveLength(rows.length - 1);
    expect(result[0].type).toBe("line");
  });

  it("is pure — does not mutate original rows", () => {
    const origLen = rows.length;
    removeRow(rows, 0);
    expect(rows).toHaveLength(origLen);
  });

  it("returns original array for out-of-range idx", () => {
    expect(removeRow(rows, -1)).toBe(rows);
    expect(removeRow(rows, 999)).toBe(rows);
  });
});

// ─── insertSectionRow ─────────────────────────────────────────────────────────

describe("insertSectionRow", () => {
  let rows;
  beforeEach(() => { rows = buildEditorRows(SAMPLE_LYRICS); });

  it("inserts a section row after the given index", () => {
    const result = insertSectionRow(rows, 1, "Bridge");
    expect(result).toHaveLength(rows.length + 1);
    expect(result[2].type).toBe("section");
    expect(result[2].sectionName).toBe("Bridge");
  });

  it("new section row has time null", () => {
    const result = insertSectionRow(rows, 1, "Outro");
    expect(result[2].time).toBeNull();
  });

  it("prepends when afterIdx is -1", () => {
    const result = insertSectionRow(rows, -1, "Intro");
    expect(result[0].type).toBe("section");
    expect(result[0].sectionName).toBe("Intro");
  });

  it("defaults sectionName to empty string", () => {
    const result = insertSectionRow(rows, 0);
    expect(result[1].sectionName).toBe("");
  });

  it("is pure — does not mutate original rows", () => {
    const origLen = rows.length;
    insertSectionRow(rows, 0, "X");
    expect(rows).toHaveLength(origLen);
  });

  it("returns original ref for non-array input", () => {
    expect(insertSectionRow(null, 0, "X")).toBeNull();
  });
});

// ─── updateSectionName ────────────────────────────────────────────────────────

describe("updateSectionName", () => {
  let rows;
  beforeEach(() => { rows = buildEditorRows(SAMPLE_LYRICS); });

  it("updates the sectionName of a section row", () => {
    // rows[0] is 'Verse 1' section
    const result = updateSectionName(rows, 0, "Verse 2");
    expect(result[0].sectionName).toBe("Verse 2");
  });

  it("is pure — does not mutate original rows", () => {
    const origName = rows[0].sectionName;
    updateSectionName(rows, 0, "Changed");
    expect(rows[0].sectionName).toBe(origName);
  });

  it("returns original array for a line row", () => {
    // rows[1] is a line row
    expect(updateSectionName(rows, 1, "X")).toBe(rows);
  });

  it("returns original array for out-of-range idx", () => {
    expect(updateSectionName(rows, -1, "X")).toBe(rows);
    expect(updateSectionName(rows, 999, "X")).toBe(rows);
  });

  it("converts non-string name to string", () => {
    const result = updateSectionName(rows, 0, 42);
    expect(result[0].sectionName).toBe("42");
  });
});
