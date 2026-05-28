// Tests for pure chord-editor logic in chordEditor.js
import { describe, it, expect, beforeEach } from "vitest";
import {
  buildChordRows,
  applyChordStamp,
  shiftChordTime,
  updateChordName,
  insertChordRow,
  removeChordRow,
  exportToChordJson,
  countChordStamped,
  importChordsFromLyrics,
  buildLyricContext,
  findLyricContextAt,
} from "../../src/utils/chordEditor.js";
import { buildEditorRows } from "../../src/utils/timestampEditor.js";

// ─── Fixture ──────────────────────────────────────────────────────────────────

const SAMPLE_CHORDS = [
  { time: 0.05,  chord: "C"  },
  { time: 4.0,   chord: "G"  },
  { time: 7.85,  chord: "Am" },
  { time: 12.05, chord: "F"  },
];

// ─── buildChordRows ───────────────────────────────────────────────────────────

describe("buildChordRows", () => {
  it("returns [] for non-array input", () => {
    expect(buildChordRows(null)).toEqual([]);
    expect(buildChordRows({})).toEqual([]);
    expect(buildChordRows("string")).toEqual([]);
  });

  it("returns [] for empty array", () => {
    expect(buildChordRows([])).toEqual([]);
  });

  it("builds the correct number of rows", () => {
    expect(buildChordRows(SAMPLE_CHORDS)).toHaveLength(4);
  });

  it("stores correct time values", () => {
    const rows = buildChordRows(SAMPLE_CHORDS);
    expect(rows[0].time).toBe(0.05);
    expect(rows[1].time).toBe(4.0);
    expect(rows[3].time).toBe(12.05);
  });

  it("stores correct chord names", () => {
    const rows = buildChordRows(SAMPLE_CHORDS);
    expect(rows[0].chord).toBe("C");
    expect(rows[2].chord).toBe("Am");
  });

  it("stores null time when time is missing or invalid", () => {
    const chords = [
      { chord: "C" },                        // missing time
      { time: null,  chord: "G" },           // explicit null
      { time: "bad", chord: "Am" },          // non-numeric string
    ];
    const rows = buildChordRows(chords);
    expect(rows[0].time).toBeNull();
    expect(rows[1].time).toBeNull();
    expect(rows[2].time).toBeNull();
  });

  it("stores numeric string times as numbers", () => {
    const rows = buildChordRows([{ time: "3.5", chord: "F" }]);
    expect(rows[0].time).toBe(3.5);
  });

  it("stores originalIndex correctly", () => {
    const rows = buildChordRows(SAMPLE_CHORDS);
    rows.forEach((row, i) => expect(row.originalIndex).toBe(i));
  });

  it("skips null and non-object entries silently", () => {
    const chords = [null, "bad", { time: 1, chord: "C" }];
    const rows = buildChordRows(chords);
    expect(rows).toHaveLength(1);
    expect(rows[0].chord).toBe("C");
  });
});

// ─── applyChordStamp ──────────────────────────────────────────────────────────

describe("applyChordStamp", () => {
  let rows;
  beforeEach(() => { rows = buildChordRows(SAMPLE_CHORDS); });

  it("sets the time on a row", () => {
    const result = applyChordStamp(rows, 1, 4.5);
    expect(result[1].time).toBe(4.5);
  });

  it("is pure — does not mutate original rows", () => {
    const origTime = rows[1].time;
    applyChordStamp(rows, 1, 99);
    expect(rows[1].time).toBe(origTime);
  });

  it("clamps negative time to 0", () => {
    expect(applyChordStamp(rows, 0, -3)[0].time).toBe(0);
  });

  it("treats non-finite time as 0", () => {
    expect(applyChordStamp(rows, 0, Infinity)[0].time).toBe(0);
    expect(applyChordStamp(rows, 0, NaN)[0].time).toBe(0);
  });

  it("returns original ref for out-of-range idx", () => {
    expect(applyChordStamp(rows, -1, 1)).toBe(rows);
    expect(applyChordStamp(rows, 999, 1)).toBe(rows);
  });

  it("returns original ref for non-array input", () => {
    expect(applyChordStamp(null, 0, 1)).toBeNull();
  });
});

// ─── shiftChordTime ───────────────────────────────────────────────────────────

describe("shiftChordTime", () => {
  let rows;
  beforeEach(() => { rows = buildChordRows(SAMPLE_CHORDS); });

  it("adds delta to a stamped row", () => {
    const result = shiftChordTime(rows, 0, 0.1);
    expect(result[0].time).toBeCloseTo(0.15, 5);
  });

  it("subtracts delta from a stamped row", () => {
    const result = shiftChordTime(rows, 1, -0.5);
    expect(result[1].time).toBeCloseTo(3.5, 5);
  });

  it("clamps result to 0", () => {
    const result = shiftChordTime(rows, 0, -99);
    expect(result[0].time).toBe(0);
  });

  it("does nothing when row time is null", () => {
    const nullRows = buildChordRows([{ chord: "C" }]);
    expect(shiftChordTime(nullRows, 0, 1)).toBe(nullRows);
  });

  it("returns original ref for non-finite delta", () => {
    expect(shiftChordTime(rows, 0, NaN)).toBe(rows);
    expect(shiftChordTime(rows, 0, Infinity)).toBe(rows);
  });

  it("is pure — does not mutate original rows", () => {
    const origTime = rows[0].time;
    shiftChordTime(rows, 0, 5);
    expect(rows[0].time).toBe(origTime);
  });

  it("returns original ref for out-of-range idx", () => {
    expect(shiftChordTime(rows, -1, 0.1)).toBe(rows);
    expect(shiftChordTime(rows, 999, 0.1)).toBe(rows);
  });
});

// ─── updateChordName ─────────────────────────────────────────────────────────

describe("updateChordName", () => {
  let rows;
  beforeEach(() => { rows = buildChordRows(SAMPLE_CHORDS); });

  it("updates the chord name", () => {
    const result = updateChordName(rows, 0, "Cmaj7");
    expect(result[0].chord).toBe("Cmaj7");
  });

  it("is pure — does not mutate original rows", () => {
    const origChord = rows[0].chord;
    updateChordName(rows, 0, "X");
    expect(rows[0].chord).toBe(origChord);
  });

  it("returns original ref for out-of-range idx", () => {
    expect(updateChordName(rows, -1, "C")).toBe(rows);
    expect(updateChordName(rows, 999, "C")).toBe(rows);
  });

  it("converts non-string to string", () => {
    const result = updateChordName(rows, 0, 42);
    expect(result[0].chord).toBe("42");
  });
});

// ─── insertChordRow ───────────────────────────────────────────────────────────

describe("insertChordRow", () => {
  let rows;
  beforeEach(() => { rows = buildChordRows(SAMPLE_CHORDS); });

  it("inserts a new empty row after the given index", () => {
    const result = insertChordRow(rows, 1);
    expect(result).toHaveLength(rows.length + 1);
    expect(result[2].chord).toBe("");
    expect(result[2].time).toBeNull();
  });

  it("prepends when afterIdx is -1", () => {
    const result = insertChordRow(rows, -1);
    expect(result[0].chord).toBe("");
    expect(result[0].time).toBeNull();
    expect(result).toHaveLength(rows.length + 1);
  });

  it("is pure — does not mutate original rows", () => {
    const origLen = rows.length;
    insertChordRow(rows, 0);
    expect(rows).toHaveLength(origLen);
  });

  it("returns original ref for non-array input", () => {
    expect(insertChordRow(null, 0)).toBeNull();
  });
});

// ─── removeChordRow ───────────────────────────────────────────────────────────

describe("removeChordRow", () => {
  let rows;
  beforeEach(() => { rows = buildChordRows(SAMPLE_CHORDS); });

  it("removes the row at the given index", () => {
    const result = removeChordRow(rows, 1);
    expect(result).toHaveLength(rows.length - 1);
    expect(result[1].chord).toBe("Am"); // G is gone, Am slides up
  });

  it("is pure — does not mutate original rows", () => {
    const origLen = rows.length;
    removeChordRow(rows, 0);
    expect(rows).toHaveLength(origLen);
  });

  it("returns original ref for out-of-range idx", () => {
    expect(removeChordRow(rows, -1)).toBe(rows);
    expect(removeChordRow(rows, 999)).toBe(rows);
  });
});

// ─── exportToChordJson ────────────────────────────────────────────────────────

describe("exportToChordJson", () => {
  it("returns '[]' for empty rows", () => {
    expect(exportToChordJson([])).toBe("[]");
  });

  it("returns '[]' for non-array input", () => {
    expect(exportToChordJson(null)).toBe("[]");
  });

  it("produces valid JSON", () => {
    const rows = buildChordRows(SAMPLE_CHORDS);
    expect(() => JSON.parse(exportToChordJson(rows))).not.toThrow();
  });

  it("round-trips time and chord correctly", () => {
    const rows   = buildChordRows(SAMPLE_CHORDS);
    const parsed = JSON.parse(exportToChordJson(rows));
    expect(parsed[0].time).toBe(0.05);
    expect(parsed[0].chord).toBe("C");
    expect(parsed[3].chord).toBe("F");
  });

  it("exports time: 0 for unstamped rows", () => {
    const rows   = buildChordRows([{ chord: "Am" }]);
    const parsed = JSON.parse(exportToChordJson(rows));
    expect(parsed[0].time).toBe(0);
    expect(parsed[0].chord).toBe("Am");
  });

  it("sorts output chronologically by time", () => {
    const unordered = [
      { time: 10, chord: "G" },
      { time: 2,  chord: "C" },
      { time: 6,  chord: "F" },
    ];
    const rows   = buildChordRows(unordered);
    const parsed = JSON.parse(exportToChordJson(rows));
    expect(parsed[0].time).toBe(2);
    expect(parsed[1].time).toBe(6);
    expect(parsed[2].time).toBe(10);
  });

  it("trims whitespace from chord names on export", () => {
    const rows   = buildChordRows([{ time: 1, chord: "  Dm  " }]);
    const parsed = JSON.parse(exportToChordJson(rows));
    expect(parsed[0].chord).toBe("Dm");
  });

  it("round-trips a stamp applied after build", () => {
    let rows   = buildChordRows(SAMPLE_CHORDS);
    rows       = applyChordStamp(rows, 0, 1.23);
    const parsed = JSON.parse(exportToChordJson(rows));
    const entry  = parsed.find(p => p.chord === "C");
    expect(entry.time).toBe(1.23);
  });
});

// ─── countChordStamped ────────────────────────────────────────────────────────

describe("countChordStamped", () => {
  it("returns { stamped: 0, total: 0 } for empty array", () => {
    expect(countChordStamped([])).toEqual({ stamped: 0, total: 0 });
  });

  it("returns { stamped: 0, total: 0 } for non-array", () => {
    expect(countChordStamped(null)).toEqual({ stamped: 0, total: 0 });
  });

  it("counts all stamped rows correctly", () => {
    const rows = buildChordRows(SAMPLE_CHORDS);
    expect(countChordStamped(rows)).toEqual({ stamped: 4, total: 4 });
  });

  it("counts unstamped rows correctly", () => {
    const chords = [
      { time: 1, chord: "C" },
      { chord: "G" },           // no time
      { chord: "Am" },          // no time
    ];
    const rows = buildChordRows(chords);
    expect(countChordStamped(rows)).toEqual({ stamped: 1, total: 3 });
  });

  it("reflects updated count after applyChordStamp", () => {
    const chords = [{ chord: "C" }, { chord: "G" }];
    let rows = buildChordRows(chords);
    expect(countChordStamped(rows)).toEqual({ stamped: 0, total: 2 });

    rows = applyChordStamp(rows, 0, 2.0);
    expect(countChordStamped(rows)).toEqual({ stamped: 1, total: 2 });
  });
});

// ─── importChordsFromLyrics ───────────────────────────────────────────────────

// Lyrics fixture that mirrors the real data format
const LYRICS_SOURCE = [
  { section: "Verse 1" },
  { time: 5.2,  line: [{ chord: "C",  lyric: "เนื้อหาบรรทัดหนึ่ง" }] },
  { time: 8.0,  line: [{ chord: "G",  lyric: "บรรทัดสอง" },
                        { chord: "Am", lyric: "ต่อ" }] },  // two chords on one line
  { section: "Chorus" },
  { time: 12.5, line: [{ chord: "F",  lyric: "คอรัส" }] },
  { time: 16.0, line: [{ lyric: "ไม่มีคอร์ด" }] },  // no chord segment
];

describe("importChordsFromLyrics", () => {
  it("returns [] for non-array input", () => {
    expect(importChordsFromLyrics(null)).toEqual([]);
    expect(importChordsFromLyrics({})).toEqual([]);
  });

  it("returns [] for empty array", () => {
    expect(importChordsFromLyrics([])).toEqual([]);
  });

  it("extracts one chord from a single-segment line", () => {
    const rows   = buildEditorRows(LYRICS_SOURCE);
    const result = importChordsFromLyrics(rows);
    expect(result.some(r => r.chord === "C")).toBe(true);
    expect(result.some(r => r.chord === "F")).toBe(true);
  });

  it("extracts all chords from a multi-segment line", () => {
    const rows   = buildEditorRows(LYRICS_SOURCE);
    const result = importChordsFromLyrics(rows);
    const gEntry  = result.find(r => r.chord === "G");
    const amEntry = result.find(r => r.chord === "Am");
    expect(gEntry).toBeDefined();
    expect(amEntry).toBeDefined();
  });

  it("multi-segment chords on the same line share the line timestamp", () => {
    const rows   = buildEditorRows(LYRICS_SOURCE);
    const result = importChordsFromLyrics(rows);
    const gEntry  = result.find(r => r.chord === "G");
    const amEntry = result.find(r => r.chord === "Am");
    expect(gEntry.time).toBe(8.0);
    expect(amEntry.time).toBe(8.0);
  });

  it("skips section rows", () => {
    const rows   = buildEditorRows(LYRICS_SOURCE);
    const result = importChordsFromLyrics(rows);
    expect(result.every(r => r.chord !== undefined && r.time !== undefined)).toBe(true);
    // should not contain section-shaped objects
    expect(result.every(r => !("section" in r))).toBe(true);
  });

  it("skips segments with empty or missing chord", () => {
    const rows   = buildEditorRows(LYRICS_SOURCE);
    const result = importChordsFromLyrics(rows);
    // line at t=16 has no chord — should not appear
    expect(result.filter(r => r.time === 16.0)).toHaveLength(0);
  });

  it("uses 0 for unstamped rows (time: null)", () => {
    const lyrics = [{ line: [{ chord: "C", lyric: "x" }] }];  // no time
    const rows   = buildEditorRows(lyrics);
    const result = importChordsFromLyrics(rows);
    expect(result[0].time).toBe(0);
    expect(result[0].chord).toBe("C");
  });

  it("sorts output chronologically", () => {
    const lyrics = [
      { time: 10, line: [{ chord: "G",  lyric: "b" }] },
      { time: 2,  line: [{ chord: "C",  lyric: "a" }] },
      { time: 6,  line: [{ chord: "Am", lyric: "c" }] },
    ];
    const rows   = buildEditorRows(lyrics);
    const result = importChordsFromLyrics(rows);
    expect(result[0].time).toBe(2);
    expect(result[1].time).toBe(6);
    expect(result[2].time).toBe(10);
  });

  it("trims whitespace from extracted chord names", () => {
    const lyrics = [{ time: 1, line: [{ chord: "  Dm  ", lyric: "x" }] }];
    const rows   = buildEditorRows(lyrics);
    const result = importChordsFromLyrics(rows);
    expect(result[0].chord).toBe("Dm");
  });

  it("total extracted count matches stamped segments with chords", () => {
    const rows   = buildEditorRows(LYRICS_SOURCE);
    const result = importChordsFromLyrics(rows);
    // C (t=5.2) + G, Am (t=8.0) + F (t=12.5) = 4  (line at t=16 has no chord)
    expect(result).toHaveLength(4);
  });

  it("is pure — does not mutate the input rows", () => {
    const rows  = buildEditorRows(LYRICS_SOURCE);
    const copy  = JSON.stringify(rows);
    importChordsFromLyrics(rows);
    expect(JSON.stringify(rows)).toBe(copy);
  });
});

// ─── buildLyricContext ────────────────────────────────────────────────────────

// Lyrics fixture with two sections and a mix of stamped/unstamped lines
const CTX_LYRICS = [
  { section: "Intro" },
  { time: 0.0, line: [{ chord: "C",  lyric: "บทนำ" }] },
  { time: 4.0, line: [{ chord: "G",  lyric: "ท่อนแรก" }] },
  { section: "Verse 1" },
  { time: 8.0,  line: [{ chord: "Am", lyric: "คืนนี้" }, { chord: "F", lyric: "คิดถึง" }] },
  { time: 12.0, line: [{ lyric: "ไม่มีคอร์ด" }] },       // no chord — still included for lyric
  {             line: [{ chord: "Em", lyric: "ไม่มีเวลา" }] }, // no time — excluded
];

describe("buildLyricContext", () => {
  it("returns [] for non-array input", () => {
    expect(buildLyricContext(null)).toEqual([]);
    expect(buildLyricContext("x")).toEqual([]);
  });

  it("returns [] for empty array", () => {
    expect(buildLyricContext([])).toEqual([]);
  });

  it("only includes line rows that have a non-null time", () => {
    const rows   = buildEditorRows(CTX_LYRICS);
    const result = buildLyricContext(rows);
    expect(result.every(e => e.time !== null)).toBe(true);
    // unstamped Em line must be excluded
    expect(result.find(e => e.lyricText.includes("ไม่มีเวลา"))).toBeUndefined();
  });

  it("carries correct sectionName from the preceding section header", () => {
    const rows   = buildEditorRows(CTX_LYRICS);
    const result = buildLyricContext(rows);
    const intro  = result.find(e => e.lyricText === "บทนำ");
    const verse  = result.find(e => e.lyricText.includes("คิดถึง"));
    expect(intro.sectionName).toBe("Intro");
    expect(verse.sectionName).toBe("Verse 1");
  });

  it("sectionName is null for lines before any section header", () => {
    const rows   = buildEditorRows([{ time: 1, line: [{ lyric: "ก" }] }]);
    const result = buildLyricContext(rows);
    expect(result[0].sectionName).toBeNull();
  });

  it("concatenates multi-segment lyrics into a single string", () => {
    const rows   = buildEditorRows(CTX_LYRICS);
    const result = buildLyricContext(rows);
    const multiSeg = result.find(e => e.time === 8.0);
    expect(multiSeg.lyricText).toBe("คืนนี้คิดถึง");
  });

  it("lyricText is empty string when all segments have no lyric", () => {
    const rows   = buildEditorRows([{ time: 2, line: [{ chord: "C" }] }]);
    const result = buildLyricContext(rows);
    expect(result[0].lyricText).toBe("");
  });

  it("output is sorted chronologically by time", () => {
    const rows   = buildEditorRows(CTX_LYRICS);
    const result = buildLyricContext(rows);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].time).toBeGreaterThanOrEqual(result[i - 1].time);
    }
  });

  it("is pure — does not mutate the input rows", () => {
    const rows = buildEditorRows(CTX_LYRICS);
    const copy = JSON.stringify(rows);
    buildLyricContext(rows);
    expect(JSON.stringify(rows)).toBe(copy);
  });
});

// ─── findLyricContextAt ───────────────────────────────────────────────────────

describe("findLyricContextAt", () => {
  const CTX = [
    { time: 0.0,  sectionName: "Intro",   lyricText: "ก" },
    { time: 4.0,  sectionName: "Intro",   lyricText: "ข" },
    { time: 8.0,  sectionName: "Verse 1", lyricText: "ค" },
    { time: 12.0, sectionName: "Verse 1", lyricText: "ง" },
  ];

  it("returns null for empty context", () => {
    expect(findLyricContextAt([], 5)).toBeNull();
  });

  it("returns null for non-array context", () => {
    expect(findLyricContextAt(null, 5)).toBeNull();
  });

  it("returns null for non-finite time", () => {
    expect(findLyricContextAt(CTX, NaN)).toBeNull();
    expect(findLyricContextAt(CTX, Infinity)).toBeNull();
  });

  it("returns null when t is before the first entry", () => {
    expect(findLyricContextAt(CTX, -1)).toBeNull();
  });

  it("returns the matching entry when t equals an entry's time exactly", () => {
    expect(findLyricContextAt(CTX, 8.0).lyricText).toBe("ค");
  });

  it("returns the last entry whose time is ≤ t (between entries)", () => {
    expect(findLyricContextAt(CTX, 5.5).lyricText).toBe("ข");
  });

  it("returns the last entry when t is past all entries", () => {
    expect(findLyricContextAt(CTX, 999).lyricText).toBe("ง");
  });

  it("returns the first entry when t equals 0.0", () => {
    expect(findLyricContextAt(CTX, 0.0).lyricText).toBe("ก");
  });

  it("includes sectionName in the returned entry", () => {
    expect(findLyricContextAt(CTX, 9.0).sectionName).toBe("Verse 1");
  });
});
