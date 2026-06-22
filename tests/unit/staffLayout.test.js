// Tests for pure staff-geometry logic in staffLayout.js
import { describe, it, expect } from "vitest";
import {
  layoutStaff,
  PAD_L, CLEF_W, TSIG_W, HEADER_PAD, NOTE_INSET,
} from "../../src/utils/staffLayout.js";
import { parseNotation } from "../../src/utils/notationModel.js";

/** Builds a layout from a compact list of {pitch,dur} note specs + config. */
function layoutFrom(notes, config = {}) {
  return layoutStaff(parseNotation({ config, notes }));
}

/** A run of N quarter notes on A4. */
function quarters(n) {
  return Array.from({ length: n }, () => ({ pitch: "A4", dur: "quarter" }));
}

describe("layoutStaff — note placement", () => {
  it("preserves every note across rows", () => {
    const L = layoutFrom(quarters(20), { measuresPerRow: 3 });
    const total = L.rows.reduce((sum, r) => sum + r.notes.length, 0);
    expect(total).toBe(20);
  });

  it("keeps each note's source idx for highlight sync", () => {
    const L = layoutFrom(quarters(8), { measuresPerRow: 3 });
    const idxs = L.rows.flatMap(r => r.notes.map(n => n.idx)).sort((a, b) => a - b);
    expect(idxs).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("derives x from cumulative duration, not playback time", () => {
    // Two notes with wildly different times but equal durations are spaced evenly.
    const L = layoutFrom([
      { pitch: "A4", dur: "quarter", time: 0 },
      { pitch: "B4", dur: "quarter", time: 99 },
      { pitch: "C5", dur: "quarter", time: 100 },
    ], { measuresPerRow: 4 });
    const [a, b, c] = L.rows[0].notes;
    expect(b.x - a.x).toBeCloseTo(c.x - b.x, 6);
  });
});

describe("layoutStaff — rows and measures", () => {
  it("wraps measures onto multiple rows at measuresPerRow", () => {
    // 6 measures of 4/4 = 24 quarter notes, 3 measures/row → 2 rows.
    const L = layoutFrom(quarters(24), { measuresPerRow: 3, timeSignature: [4, 4] });
    expect(L.numRows).toBe(2);
  });

  it("gives every measure the same width (constant beat-width)", () => {
    const L = layoutFrom(quarters(24), { measuresPerRow: 3 });
    // bar-to-bar distance within a full row must be identical everywhere.
    const widths = [];
    for (const row of L.rows) {
      let prev = L.measuresOriginX;
      for (const bar of row.bars) {
        widths.push(bar.x - prev);
        prev = bar.x;
      }
    }
    for (const w of widths) expect(w).toBeCloseTo(widths[0], 6);
  });

  it("aligns measures vertically — bars share x across full rows", () => {
    const L = layoutFrom(quarters(24), { measuresPerRow: 3 });
    const row0First = L.rows[0].bars[0].x;
    const row1First = L.rows[1].bars[0].x;
    expect(row1First).toBeCloseTo(row0First, 6);
  });

  it("does not stretch a short final row", () => {
    // 4 measures, 3/row → row 0 full (3), row 1 short (1 measure).
    const L = layoutFrom(quarters(16), { measuresPerRow: 3 });
    expect(L.numRows).toBe(2);
    expect(L.rows[1].bars).toHaveLength(1);
    // The single final bar sits one measure-width from the origin, not at the edge.
    const oneMeasure = L.rows[0].bars[0].x - L.measuresOriginX;
    expect(L.rows[1].bars[0].x - L.measuresOriginX).toBeCloseTo(oneMeasure, 6);
    expect(L.rows[1].bars[0].x).toBeLessThan(L.rightEdge - 1);
  });

  it("marks the very last bar as final", () => {
    const L = layoutFrom(quarters(16), { measuresPerRow: 3 });
    const lastRow = L.rows[L.numRows - 1];
    expect(lastRow.bars[lastRow.bars.length - 1].isFinal).toBe(true);
  });
});

describe("layoutStaff — pickup (anacrusis)", () => {
  it("puts pickup notes in row 0 left of the first measure origin", () => {
    // 1-beat pickup + 4 full beats.
    const L = layoutFrom([
      { pitch: "G4", dur: "quarter" },                 // pickup
      { pitch: "A4", dur: "quarter" },
      { pitch: "B4", dur: "quarter" },
      { pitch: "C5", dur: "quarter" },
      { pitch: "D5", dur: "quarter" },
    ], { pickupBeats: 1, measuresPerRow: 4 });

    const pickupNote = L.rows[0].notes[0];
    expect(pickupNote.x).toBeLessThan(L.measuresOriginX);
  });

  it("places the first downbeat note one inset past the measure origin", () => {
    const L = layoutFrom([
      { pitch: "G4", dur: "quarter" },                 // pickup
      { pitch: "A4", dur: "quarter" },                 // first downbeat
    ], { pickupBeats: 1, measuresPerRow: 4 });
    expect(L.rows[0].notes[1].x).toBeCloseTo(L.measuresOriginX + NOTE_INSET, 6);
  });
});

describe("layoutStaff — note insets", () => {
  it("clears the first note from the header (HEADER_PAD + NOTE_INSET)", () => {
    const L = layoutFrom(quarters(4), { key: "C" }); // no key sig → keySigW 0
    const headerEnd = PAD_L + CLEF_W + TSIG_W;
    expect(L.rows[0].notes[0].x).toBeCloseTo(headerEnd + HEADER_PAD + NOTE_INSET, 6);
    expect(L.rows[0].notes[0].x).toBeGreaterThan(headerEnd);
  });

  it("insets an interior downbeat note past the bar line it follows", () => {
    // 8 quarters = 2 measures (fits one row at mpr 3). Note 4 = downbeat of M2.
    const L = layoutFrom(quarters(8), { measuresPerRow: 3 });
    const barM1 = L.rows[0].bars[0].x;          // bar line between M1 and M2 (on the grid)
    const downbeatM2 = L.rows[0].notes[4].x;
    expect(downbeatM2).toBeGreaterThan(barM1);
    expect(downbeatM2).toBeCloseTo(barM1 + NOTE_INSET, 6);
  });

  it("keeps bar lines on the grid (final bar still at the right edge)", () => {
    const L = layoutFrom(quarters(24), { measuresPerRow: 3 }); // 2 full rows
    const lastBarRow0 = L.rows[0].bars[L.rows[0].bars.length - 1];
    expect(lastBarRow0.x).toBeCloseTo(L.rightEdge, 6);
  });
});

describe("layoutStaff — key signature width", () => {
  it("shifts the measure origin right when a key signature is present", () => {
    const plain  = layoutFrom(quarters(4), { key: "C" });
    const sharps = layoutFrom(quarters(4), { key: "D" }); // 2 sharps
    expect(sharps.measuresOriginX).toBeGreaterThan(plain.measuresOriginX);
  });
});

describe("layoutStaff — empty", () => {
  it("still returns one row for empty notes", () => {
    const L = layoutFrom([], {});
    expect(L.numRows).toBe(1);
    expect(L.rows[0].notes).toEqual([]);
  });
});
