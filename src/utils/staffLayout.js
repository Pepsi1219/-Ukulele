/**
 * staffLayout.js — Pure geometry for a multi-row musical staff.
 *
 * Consumes a parsed notation model (`{ config, notes }` from notationModel.js)
 * and produces a fully positioned layout: row offsets, per-measure bar-line
 * x-coordinates, and an x for every note. It owns NO musical semantics (that's
 * notationModel) and emits NO SVG (that's staffRenderer) — it is pure maths and
 * is unit-testable on its own.
 *
 * ── Horizontal model ───────────────────────────────────────────────────────
 * A note's horizontal position is derived from its *beat* position, which is
 * the running sum of preceding note durations (NOT the playback time). So the
 * drawn rhythm is fully determined by each note's `durBeats`.
 *
 * Every row reserves an identical left header (clef + key signature + time
 * signature) and an identical pickup lead-zone, and uses one constant
 * beat-width. The result: every measure has the same width and measures line
 * up vertically across all rows. A short final row simply ends early — it does
 * not stretch to fill the width.
 *
 * @module staffLayout
 */

import { keySignature } from "./notationModel.js";

// ── Staff geometry (shared with the renderer) ───────────────────────────────
export const LINE_GAP = 14;
export const STAFF_H  = LINE_GAP * 4;          // 56 — distance bottom→top line
export const MARGIN_T = 42;                    // room above staff for ledgers/labels
export const MARGIN_B = 34;                    // room below staff for stems/labels
export const SYSTEM_H = MARGIN_T + STAFF_H + MARGIN_B;

export const ROW_WIDTH = 680;                  // viewBox units per row
export const ROW_GAP   = 26;                   // vertical gap between rows
export const ROW_TOTAL = SYSTEM_H + ROW_GAP;

export const PAD_L = 12;
export const PAD_R = 16;
export const CLEF_W     = 30;
export const TSIG_W     = 22;                  // reserved on every row, drawn row 0 only
export const KEYSIG_W   = 9;                   // width per key-signature accidental
export const HEADER_PAD = 9;                   // extra gap reserved after the header
export const NOTE_INSET = 25;                   // gap between every bar line and the note after it
                                               // (first note of a row clears the header by HEADER_PAD + NOTE_INSET)

/**
 * Computes the full staff layout.
 *
 * @param {{config:Object, notes:Array}} parsed  output of parseNotation()
 * @returns {{
 *   config:Object, width:number, height:number, numRows:number,
 *   beatWidth:number, measuresOriginX:number, rightEdge:number,
 *   keySig:{type:string, steps:string[]},
 *   rows:Array<{
 *     index:number, yOffset:number,
 *     bars:Array<{x:number, isFinal:boolean}>,
 *     notes:Array<Object>      // each note + { x }
 *   }>
 * }}
 */
export function layoutStaff(parsed) {
  const { config, notes } = parsed;
  // Measure length expressed in quarter-note beats (durations are quarter-based),
  // so any meter lines up: 4/4→4, 3/4→3, 6/8→3, 2/2→4.
  const [tsNum, tsDen]  = config.timeSignature;
  const beatsPerMeasure = tsNum * (4 / tsDen);
  const mpr    = config.measuresPerRow;
  const pickup = config.pickupBeats;

  // 1. Assign each note a beat position from the running duration sum.
  let cursor = 0;
  const placed = notes.map(n => {
    const startBeat = cursor;
    cursor += n.durBeats || 0;
    return { ...n, startBeat };
  });
  const totalBeats = cursor;

  // 2. How many *full* measures (the pickup is a partial measure, not counted).
  const fullBeats      = Math.max(0, totalBeats - pickup);
  const numFullMeasures = Math.max(1, Math.ceil(fullBeats / beatsPerMeasure - 1e-9));
  const numRows         = Math.max(1, Math.ceil(numFullMeasures / mpr));

  // 3. Reserved widths (identical on every row → measures align vertically).
  const keySig    = keySignature(config.key);
  const keySigW   = keySig.steps.length * KEYSIG_W;
  const headerW   = CLEF_W + keySigW + TSIG_W;
  // HEADER_PAD is subtracted from the usable width too, so the final bar line
  // still lands exactly at rightEdge while the grid clears the header.
  const beatWidth = (ROW_WIDTH - PAD_R - PAD_L - headerW - HEADER_PAD) /
                    (mpr * beatsPerMeasure + pickup);
  const leadW     = pickup * beatWidth;             // pickup lead-zone
  const measuresOriginX = PAD_L + headerW + HEADER_PAD + leadW;  // grid origin (bar lines)
  const rightEdge = ROW_WIDTH - PAD_R;

  // First full-measure downbeat (absolute beat) at the left of row r.
  const rowFirstFullBeat = r => pickup + r * mpr * beatsPerMeasure;

  // Absolute beat → x within row r. This is the GRID position (used for bar
  // lines). Notes are inset by NOTE_INSET from it so a downbeat note never sits
  // on top of the preceding bar line.
  const xAtBeat = (beat, r) =>
    measuresOriginX + (beat - rowFirstFullBeat(r)) * beatWidth;

  // Which row a note's beat belongs to.
  const rowOfBeat = beat => {
    if (beat < pickup) return 0;                    // pickup → row 0
    const fullIdx = Math.floor((beat - pickup) / beatsPerMeasure + 1e-9);
    return Math.min(numRows - 1, Math.floor(fullIdx / mpr));
  };

  // 4. Build rows: bar lines + notes.
  const rows = [];
  for (let r = 0; r < numRows; r++) {
    const measuresInRow = Math.min(mpr, numFullMeasures - r * mpr);
    const bars = [];
    for (let m = 1; m <= measuresInRow; m++) {
      const beat   = rowFirstFullBeat(r) + m * beatsPerMeasure;
      const isFinal = (r === numRows - 1) && (m === measuresInRow);
      bars.push({ x: xAtBeat(beat, r), isFinal });
    }
    rows.push({ index: r, yOffset: r * ROW_TOTAL, bars, notes: [] });
  }

  // 5. Place notes into their rows, inset from the grid so they clear bar lines.
  for (const n of placed) {
    const r = rowOfBeat(n.startBeat);
    rows[r].notes.push({ ...n, x: xAtBeat(n.startBeat, r) + NOTE_INSET });
  }

  return {
    config,
    width:  ROW_WIDTH,
    height: numRows * ROW_TOTAL - ROW_GAP,
    numRows,
    beatWidth,
    measuresOriginX,
    rightEdge,
    keySig,
    rows,
  };
}
