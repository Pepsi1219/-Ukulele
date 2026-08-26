/**
 * tabRenderer.js — Renders ukulele tablature as an SVG string.
 *
 * Two exports:
 *   - renderTab(model)      → standalone 4-line tab
 *   - renderCombined(model) → staff on top + tab below, per row (like a
 *                             printed lesson sheet), sharing the exact same
 *                             bar-line x positions as the staff so the two
 *                             views line up vertically.
 *
 * Both consume the same layout as staffRenderer.js (via layoutStaff), so
 * measure widths and per-note x-coordinates are identical between staff and
 * tab — a note at beat 2 in the staff sits directly above the same beat's
 * fret number in the tab.
 *
 * @module tabRenderer
 */

import {
  layoutStaff,
  ROW_GAP, MARGIN_T, STAFF_H, SYSTEM_H,
  PAD_L,
} from "./staffLayout.js";
import { renderStaffRowBody, staffDrawContext } from "./staffRenderer.js";
import { computeTabPositions, UKE_TAB_ROW_ORDER } from "./tabModel.js";

// ── Tab geometry ────────────────────────────────────────────────────────────
export const TAB_LINE_GAP = 12;                    // between the 4 tab lines
export const TAB_H         = TAB_LINE_GAP * 3;     // top-to-bottom span
export const TAB_MARGIN_T  = 14;
export const TAB_MARGIN_B  = 18;
export const TAB_SYSTEM_H  = TAB_MARGIN_T + TAB_H + TAB_MARGIN_B;

/** Vertical gap between a staff row and its paired tab row, in combined view. */
export const COMBINED_GAP  = 6;

/** Full height of one combined system (staff + gap + tab). */
export const COMBINED_SYSTEM_H = SYSTEM_H + COMBINED_GAP + TAB_SYSTEM_H;

// ── Row helpers ─────────────────────────────────────────────────────────────

function tabLineY(yOff, i) {
  return yOff + TAB_MARGIN_T + i * TAB_LINE_GAP;
}

/** Maps a tuning string index (0=G…3=A) to its display row (0=top…3=bottom). */
function displayRowFor(stringIdx) {
  return UKE_TAB_ROW_ORDER.indexOf(stringIdx);
}

/**
 * SVG body for one tab row — 4 horizontal lines, per-note fret numbers, and
 * matching bar lines at the same x positions the staff uses. Wraps each note
 * in a `<g class="tab-note" data-idx="N">` so the playback highlight sync can
 * mark tab notes with the same index as staff notes.
 *
 * `includeLabel=true` draws the "T A B" letters vertically stacked at the
 * left — matches printed-tab convention where the label is repeated on
 * every system (unlike the staff clef which technically could repeat but
 * we do too). Callers currently pass `true` for every row.
 */
export function renderTabRowBody(row, L, tabPositions, yOff, includeLabel = false) {
  let body = "";

  // 4 horizontal tab lines
  for (let i = 0; i < 4; i++) {
    const y = tabLineY(yOff, i);
    body += `<line x1="${PAD_L}" x2="${L.rightEdge}" y1="${y}" y2="${y}" class="tab-line"/>`;
  }

  // "T A B" left label — first row only. Drawn on top of the tab lines with
  // a background mask rect so the letters read cleanly, matching how fret
  // number badges mask the line behind them.
  if (includeLabel) {
    const labelX = PAD_L + 8;
    const yTop = tabLineY(yOff, 0);
    body += `<rect x="${PAD_L - 3}" y="${yTop - 4}" width="22" height="${TAB_H + 8}" class="tab-label-bg"/>`;
    body += `<text x="${labelX}" y="${yTop + TAB_LINE_GAP * 0.5}" dy="0.34em" text-anchor="middle" class="tab-label-letter">T</text>`;
    body += `<text x="${labelX}" y="${yTop + TAB_LINE_GAP * 1.5}" dy="0.34em" text-anchor="middle" class="tab-label-letter">A</text>`;
    body += `<text x="${labelX}" y="${yTop + TAB_LINE_GAP * 2.5}" dy="0.34em" text-anchor="middle" class="tab-label-letter">B</text>`;
  }

  // Fret numbers — bg rect masks the tab line behind the digit so it reads clearly
  for (const n of row.notes) {
    if (n.isRest) continue;
    const pos = tabPositions[n.idx];
    if (!pos) continue;
    const dRow = displayRowFor(pos.stringIdx);
    if (dRow < 0) continue;

    const y = tabLineY(yOff, dRow);
    const label = String(pos.fret);
    const halfW = label.length >= 2 ? 10 : 7;
    body += `<g class="tab-note" data-idx="${n.idx}">`;
    body += `<rect x="${n.x - halfW}" y="${y - 8}" width="${halfW * 2}" height="16" class="tab-num-bg"/>`;
    body += `<text x="${n.x}" y="${y}" dy="0.34em" text-anchor="middle" class="tab-num">${label}</text>`;
    body += `</g>`;
  }

  // Bar lines — same x as staff bars so they align perfectly in combined view
  for (const bar of row.bars) {
    const top = tabLineY(yOff, 0);
    const bot = tabLineY(yOff, 3);
    if (bar.isFinal) {
      body += `<line x1="${bar.x - 4}" y1="${top}" x2="${bar.x - 4}" y2="${bot}" class="tab-barline"/>`;
      body += `<line x1="${bar.x}" y1="${top}" x2="${bar.x}" y2="${bot}" class="tab-barline-final"/>`;
    } else {
      body += `<line x1="${bar.x}" y1="${top}" x2="${bar.x}" y2="${bot}" class="tab-barline"/>`;
    }
  }

  return body;
}

// ── Full renderers ──────────────────────────────────────────────────────────

/**
 * Standalone tab SVG (no staff). Row height uses only TAB_SYSTEM_H, so this
 * is more compact than the staff — useful when the student wants tab alone.
 */
export function renderTab(model) {
  if (!model || !Array.isArray(model.notes) || !model.notes.length) return "";

  const L = layoutStaff(model);
  const tabPositions = computeTabPositions(model);
  const rowTotal = TAB_SYSTEM_H + ROW_GAP;

  let body = "";
  for (const row of L.rows) {
    body += renderTabRowBody(row, L, tabPositions, row.index * rowTotal, true);
  }

  const height = L.numRows * rowTotal - ROW_GAP;
  return `<svg class="tab-svg" viewBox="0 0 ${L.width} ${height}" width="100%" preserveAspectRatio="xMidYMin meet" xmlns="http://www.w3.org/2000/svg" aria-label="Ukulele tab">${body}</svg>`;
}

/**
 * Combined SVG: for each row, draws the staff at the top, then the tab
 * directly below it (sharing x positions). Matches the classic "notation +
 * tab" lesson-sheet layout — students see the same passage in two forms,
 * beat-aligned.
 */
export function renderCombined(model) {
  if (!model || !Array.isArray(model.notes) || !model.notes.length) return "";

  const L = layoutStaff(model);
  const { config, keySteps, keySigW } = staffDrawContext(L);
  const tabPositions = computeTabPositions(model);
  const rowTotal = COMBINED_SYSTEM_H + ROW_GAP;

  let body = "";
  for (const row of L.rows) {
    const rowY   = row.index * rowTotal;
    const tabY   = rowY + SYSTEM_H + COMBINED_GAP;
    body += renderStaffRowBody(row, L, config, keySteps, keySigW, rowY, row.index === 0);
    body += renderTabRowBody(row, L, tabPositions, tabY, true);
  }

  const height = L.numRows * rowTotal - ROW_GAP;
  return `<svg class="tab-combined-svg note-staff-svg" viewBox="0 0 ${L.width} ${height}" width="100%" preserveAspectRatio="xMidYMin meet" xmlns="http://www.w3.org/2000/svg" aria-label="Musical staff notation with ukulele tab">${body}</svg>`;
}
