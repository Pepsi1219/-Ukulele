import { describe, it, expect } from "vitest";
import {
  renderTab,
  renderCombined,
  renderTabRowBody,
  TAB_LINE_GAP,
  TAB_H,
  TAB_SYSTEM_H,
  COMBINED_SYSTEM_H,
} from "../../src/utils/tabRenderer.js";
import { parseNotation } from "../../src/utils/notationModel.js";
import { layoutStaff } from "../../src/utils/staffLayout.js";
import { computeTabPositions } from "../../src/utils/tabModel.js";

// Helpers to build models the same way the app does at runtime.
function modelOf(notes, config = {}) {
  return parseNotation({ config, notes });
}
function simpleModel() {
  return modelOf([
    { pitch: "C4", dur: "quarter" },
    { pitch: "E4", dur: "quarter" },
    { pitch: "G4", dur: "quarter" },
    { pitch: "A4", dur: "quarter" },
  ]);
}

// ─── Empty / null guard ────────────────────────────────────────────────────
describe("renderTab / renderCombined — empty inputs", () => {
  it("returns '' for null model", () => {
    expect(renderTab(null)).toBe("");
    expect(renderCombined(null)).toBe("");
  });
  it("returns '' for empty notes", () => {
    expect(renderTab({ config: {}, notes: [] })).toBe("");
    expect(renderCombined({ config: {}, notes: [] })).toBe("");
  });
  it("returns '' when notes is missing", () => {
    expect(renderTab({ config: {} })).toBe("");
    expect(renderCombined({ config: {} })).toBe("");
  });
});

// ─── renderTab structure ───────────────────────────────────────────────────
describe("renderTab — structure", () => {
  const svg = renderTab(simpleModel());

  it("emits an <svg> with the tab-svg class", () => {
    expect(svg).toMatch(/^<svg\b[^>]*class="tab-svg"/);
  });

  it("draws all 4 tab lines per row", () => {
    // Simple 4-note model fits in one row → 4 <line class="tab-line">
    const matches = svg.match(/class="tab-line"/g) || [];
    expect(matches.length).toBe(4);
  });

  it("includes the T A B letters (label repeated on every row)", () => {
    // 4 notes = 1 row → one label group with T, A, B
    expect(svg).toMatch(/>T<\/text>/);
    expect(svg).toMatch(/>A<\/text>/);
    expect(svg).toMatch(/>B<\/text>/);
  });

  it("emits one tab-note group per pitched note", () => {
    // 4 pitched notes → 4 tab-note groups
    const notes = svg.match(/class="tab-note"/g) || [];
    expect(notes.length).toBe(4);
  });

  it("carries data-idx on every tab-note (matches staff notehead data-idx)", () => {
    // Indices 0,1,2,3 should each appear
    for (let i = 0; i < 4; i++) {
      expect(svg).toMatch(new RegExp(`data-idx="${i}"`));
    }
  });

  it("prints the fret number as text inside the tab-note", () => {
    // C4 is only playable on C string open (fret 0), E4 on E string open (0)
    // — both render "0". Just confirm digits appear in tab-num text nodes.
    expect(svg).toMatch(/class="tab-num">0</);
  });
});

// ─── Rests handling ────────────────────────────────────────────────────────
describe("renderTab — rests", () => {
  it("does NOT emit a tab-note for rest rows", () => {
    const svg = renderTab(modelOf([
      { pitch: "C4",   dur: "quarter" },
      { pitch: "rest", dur: "quarter" },
      { pitch: "E4",   dur: "quarter" },
    ]));
    const notes = svg.match(/class="tab-note"/g) || [];
    expect(notes.length).toBe(2); // rest excluded
  });
});

// ─── Bar-line alignment (this is the finding-8 regression guard) ───────────
describe("renderTab bar-line x matches staff bar-line x", () => {
  it("uses the same layoutStaff bar positions as the staff would", () => {
    const model = modelOf([
      { pitch: "C4", dur: "quarter" },
      { pitch: "D4", dur: "quarter" },
      { pitch: "E4", dur: "quarter" },
      { pitch: "F4", dur: "quarter" },
      // Second measure
      { pitch: "G4", dur: "quarter" },
      { pitch: "A4", dur: "quarter" },
    ]);
    const L = layoutStaff(model);
    const svg = renderTab(model);
    // Every bar's `x` from layoutStaff must appear as a barline x in the SVG.
    for (const row of L.rows) {
      for (const bar of row.bars) {
        // Bar line svg attr: `x1="${bar.x}"` (or bar.x - 4 for isFinal thin part)
        const primaryX = bar.x.toString();
        expect(svg).toContain(`x1="${primaryX}"`);
      }
    }
  });
});

// ─── renderCombined structure + accepts optional positions ────────────────
describe("renderCombined", () => {
  const model = simpleModel();

  it("emits an <svg> carrying BOTH tab-combined-svg and note-staff-svg classes", () => {
    const svg = renderCombined(model);
    // The staff highlight selector queries `.note-staff-svg, .tab-svg`
    // and the combined view piggybacks on `.note-staff-svg` so a single
    // matcher hits it — do not remove either class without updating
    // _applyStaffHighlight in script.js.
    expect(svg).toMatch(/class="tab-combined-svg note-staff-svg"/);
  });

  it("contains BOTH staff notes (note-head) and tab notes (tab-note)", () => {
    const svg = renderCombined(model);
    expect(svg).toMatch(/class="note-head/);
    expect(svg).toMatch(/class="tab-note"/);
  });

  it("uses supplied tabPositions instead of recomputing when provided", () => {
    // Build positions where every A4 is pinned to G-string fret 2 (auto
    // would pick A-string open). If the caller-supplied positions win,
    // the SVG must contain the pinned fret "2" not the auto "0".
    const forced = model.notes.map(n => {
      if (!n.isRest && n.step === "A" && n.octave === 4) {
        return { stringIdx: 0, fret: 2 };
      }
      return null;
    });
    // Merge with auto for non-A notes so the SVG still renders all notes.
    const positions = computeTabPositions(model).map((auto, i) =>
      forced[i] || auto
    );
    const svg = renderCombined(model, positions);
    // Look for the pinned fret in a tab-num text
    expect(svg).toMatch(/class="tab-num">2</);
  });
});

// ─── Multi-row wrap: labels + lines repeat per row ────────────────────────
describe("renderTab — multi-row wrap", () => {
  it("draws the T A B label once per row (matches printed-tab convention)", () => {
    // Force wrap: 6 measures at measuresPerRow:2 → 3 rows.
    const notes = [];
    for (let m = 0; m < 6; m++) {
      for (let b = 0; b < 4; b++) notes.push({ pitch: "C4", dur: "quarter" });
    }
    const svg = renderTab(modelOf(notes, {
      measuresPerRow: 2,
      timeSignature: [4, 4],
    }));
    // 3 rows × 3 letters (T, A, B) = 9 label text nodes for T alone? No —
    // exactly one T per row. Count "T</text>" occurrences.
    const tCount = (svg.match(/>T<\/text>/g) || []).length;
    expect(tCount).toBe(3);
    // Lines: 4 per row × 3 rows = 12
    const lineCount = (svg.match(/class="tab-line"/g) || []).length;
    expect(lineCount).toBe(12);
  });
});

// ─── Geometry constants exposed for external composition ──────────────────
describe("geometry constants", () => {
  it("TAB_H = TAB_LINE_GAP * 3 (4 lines span 3 gaps)", () => {
    expect(TAB_H).toBe(TAB_LINE_GAP * 3);
  });
  it("COMBINED_SYSTEM_H accommodates one staff + gap + tab", () => {
    // Sanity: combined must be strictly taller than tab-only.
    expect(COMBINED_SYSTEM_H).toBeGreaterThan(TAB_SYSTEM_H);
  });
});

// ─── renderTabRowBody exposed helper ──────────────────────────────────────
describe("renderTabRowBody — helper for combined view", () => {
  it("respects the includeLabel flag", () => {
    const model = simpleModel();
    const L = layoutStaff(model);
    const positions = computeTabPositions(model);
    const row = L.rows[0];

    const withLabel = renderTabRowBody(row, L, positions, 0, true);
    const withoutLabel = renderTabRowBody(row, L, positions, 0, false);

    expect(withLabel).toMatch(/>T<\/text>/);
    expect(withoutLabel).not.toMatch(/>T<\/text>/);
  });
});
