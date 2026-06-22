/**
 * staffRenderer.js — Renders a parsed notation model as an SVG string.
 *
 * Pure: takes a notation model (`{config, notes}` from notationModel.js),
 * runs it through staffLayout.js for positioning, and emits standard Western
 * notation — treble/bass clef, key signature, time signature, bar lines,
 * filled/hollow noteheads, stems, flags, dots, ledger lines, accidentals and
 * the letter-name label used by the lesson "Letter Note Notation" sheets.
 *
 * Each note is wrapped in `<g class="note-head …" data-idx="N">` so the player
 * can highlight the active note by its source index.
 *
 * @module staffRenderer
 */

import {
  layoutStaff,
  LINE_GAP, STAFF_H, MARGIN_T,
  PAD_L, CLEF_W, TSIG_W, KEYSIG_W,
} from "./staffLayout.js";

// ── Notehead / stem geometry ────────────────────────────────────────────────
const NH_RX    = 6.5;
const NH_RY    = 4.8;
const NH_ROT   = -18;
const STEM_LEN = LINE_GAP * 3.5;
const MIDDLE_STEP = 4;                 // middle staff line — stem-direction pivot

// Canonical key-signature accidental positions (staff steps), per clef.
const KEYSIG_STEPS = {
  treble: { sharp: [8, 5, 9, 6, 3, 7, 4], flat: [4, 7, 3, 6, 2, 5, 1] },
  bass:   { sharp: [6, 3, 7, 4, 1, 5, 2], flat: [2, 5, 1, 4, 0, 3, -1] },
};

const CLEF_GLYPH = { treble: "\u{1D11E}", bass: "\u{1D122}" };

/**
 * Builds the SVG string for the staff.
 *
 * @param {{config:Object, notes:Array}} model  output of parseNotation()/chordsToNotation()
 * @returns {string}  SVG element as a string, or "" when there is nothing to draw.
 */
export function renderStaff(model) {
  if (!model || !Array.isArray(model.notes) || !model.notes.length) return "";

  const L = layoutStaff(model);
  const { config } = L;

  const lineY = (yOff, i) => yOff + MARGIN_T + STAFF_H - i * LINE_GAP;
  const stepY = (yOff, s) => yOff + MARGIN_T + STAFF_H - s * (LINE_GAP / 2);

  const keySteps = config.key && L.keySig.type !== "none"
    ? KEYSIG_STEPS[config.clef][L.keySig.type]
    : [];
  const keySigW = L.keySig.steps.length * KEYSIG_W;

  let body = "";

  for (const row of L.rows) {
    const yOff = row.yOffset;

    // Staff lines
    for (let i = 0; i < 5; i++) {
      body += `<line x1="${PAD_L}" x2="${L.rightEdge}" y1="${lineY(yOff, i)}" y2="${lineY(yOff, i)}" class="staff-line"/>`;
    }

    // Clef
    body += clefGlyph(config.clef, PAD_L + 3, lineY, yOff);

    // Key signature (repeated on every row, per convention)
    const symbol = L.keySig.type === "sharp" ? "♯" : "♭";
    L.keySig.steps.forEach((_, i) => {
      const kx = PAD_L + CLEF_W + i * KEYSIG_W + KEYSIG_W / 2;
      body += `<text x="${kx}" y="${stepY(yOff, keySteps[i])}" dy="0.34em" text-anchor="middle" class="staff-accidental">${symbol}</text>`;
    });

    // Time signature — first row only
    if (row.index === 0) {
      const tx = PAD_L + CLEF_W + keySigW + TSIG_W / 2;
      body += `<text x="${tx}" y="${lineY(yOff, 3)}" dy="0.34em" text-anchor="middle" class="staff-timesig">${config.timeSignature[0]}</text>`;
      body += `<text x="${tx}" y="${lineY(yOff, 1)}" dy="0.34em" text-anchor="middle" class="staff-timesig">${config.timeSignature[1]}</text>`;
    }

    // Notes
    for (const n of row.notes) {
      body += n.isRest
        ? restGlyph(n, yOff, lineY, stepY)
        : noteGlyph(n, yOff, stepY);
    }

    // Bar lines
    for (const bar of row.bars) {
      if (bar.isFinal) {
        body += `<line x1="${bar.x - 4}" y1="${lineY(yOff, 4)}" x2="${bar.x - 4}" y2="${lineY(yOff, 0)}" class="barline"/>`;
        body += `<line x1="${bar.x}" y1="${lineY(yOff, 4)}" x2="${bar.x}" y2="${lineY(yOff, 0)}" class="barline-final"/>`;
      } else {
        body += `<line x1="${bar.x}" y1="${lineY(yOff, 4)}" x2="${bar.x}" y2="${lineY(yOff, 0)}" class="barline"/>`;
      }
    }
  }

  return `<svg class="note-staff-svg" viewBox="0 0 ${L.width} ${L.height}" width="100%" preserveAspectRatio="xMidYMin meet" xmlns="http://www.w3.org/2000/svg" aria-label="Musical staff notation">${body}</svg>`;
}

// ── Glyph builders ────────────────────────────────────────────────────────--

function clefGlyph(clef, x, lineY, yOff) {
  const glyph = CLEF_GLYPH[clef] || CLEF_GLYPH.treble;
  // Vertical anchor differs between clefs so each curls around its reference line.
  const y = clef === "bass" ? lineY(yOff, 3) + 4 : lineY(yOff, 0) + 9;
  const size = clef === "bass" ? 50 : 66;
  return `<text x="${x}" y="${y}" font-family="'Times New Roman',Georgia,serif" font-size="${size}" class="staff-clef">${glyph}</text>`;
}

function noteGlyph(n, yOff, stepY) {
  const cx = n.x;
  const cy = stepY(yOff, n.staffStep);
  const stemUp = n.staffStep < MIDDLE_STEP;

  let parts = "";

  // Ledger lines (above/below the staff)
  parts += ledgerLines(n.staffStep, cx, yOff, stepY);

  // Accidental sign to the left of the head
  if (n.alter !== 0) {
    const sym = n.alter === 1 ? "♯" : n.alter === -1 ? "♭" : "♮";
    parts += `<text x="${cx - NH_RX - 6}" y="${cy}" dy="0.34em" text-anchor="middle" class="staff-accidental">${sym}</text>`;
  }

  // Notehead — hollow for half/whole, filled otherwise
  if (n.glyph === "whole") {
    parts += `<ellipse cx="${cx}" cy="${cy}" rx="${NH_RX + 2}" ry="${NH_RY}" class="note-head-fill whole-fill"/>`;
  } else {
    const fillClass = n.filled ? "filled" : "hollow";
    parts += `<ellipse cx="${cx}" cy="${cy}" rx="${NH_RX}" ry="${NH_RY}" transform="rotate(${NH_ROT},${cx},${cy})" class="note-head-fill ${fillClass}"/>`;
  }

  // Stem + flags (everything except whole notes)
  if (n.glyph !== "whole") {
    const sx  = stemUp ? cx + NH_RX - 1 : cx - NH_RX + 1;
    const sy1 = cy;
    const sy2 = stemUp ? cy - STEM_LEN : cy + STEM_LEN;
    parts += `<line x1="${sx}" y1="${sy1}" x2="${sx}" y2="${sy2}" class="note-stem"/>`;
    for (let f = 0; f < n.flags; f++) {
      parts += flagGlyph(sx, sy2, stemUp, f);
    }
  }

  // Augmentation dot
  if (n.dotted) {
    const dotY = n.staffStep % 2 === 0 ? cy - LINE_GAP / 2 : cy; // nudge off a line
    parts += `<circle cx="${cx + NH_RX + 5}" cy="${dotY}" r="1.7" class="note-dot"/>`;
  }

  // Letter-name label
  const labelY = stemUp ? cy + NH_RY + 15 : cy - NH_RY - 11;
  parts += `<text x="${cx}" y="${labelY}" dy="0.34em" text-anchor="middle" class="note-label">${n.label}</text>`;

  return `<g class="note-head ${n.glyph}-note" data-idx="${n.idx}" data-note="${n.label}">${parts}</g>`;
}

function flagGlyph(sx, tipY, stemUp, i) {
  // Small filled flag hanging off the stem tip; stacked downward for 16ths.
  const dir = stemUp ? 1 : -1;
  const y0  = tipY + dir * i * 7;
  const y1  = y0 + dir * 11;
  const cx1 = sx + 8;
  return `<path d="M ${sx} ${y0} Q ${cx1} ${y0 + dir * 4} ${cx1} ${y1}" class="note-flag"/>`;
}

function ledgerLines(staffStep, cx, yOff, stepY) {
  let out = "";
  const w = NH_RX + 4;
  if (staffStep <= -2) {
    for (let e = -2; e >= staffStep; e -= 2) {
      const y = stepY(yOff, e);
      out += `<line x1="${cx - w}" x2="${cx + w}" y1="${y}" y2="${y}" class="ledger-line"/>`;
    }
  } else if (staffStep >= 10) {
    for (let e = 10; e <= staffStep; e += 2) {
      const y = stepY(yOff, e);
      out += `<line x1="${cx - w}" x2="${cx + w}" y1="${y}" y2="${y}" class="ledger-line"/>`;
    }
  }
  return out;
}

function restGlyph(n, yOff, lineY, stepY) {
  const cx = n.x;
  let parts = "";
  if (n.glyph === "whole") {
    const y = lineY(yOff, 4) - 1;
    parts += `<rect x="${cx - 6}" y="${y}" width="12" height="4" class="rest-block"/>`;
  } else if (n.glyph === "half") {
    const y = stepY(yOff, MIDDLE_STEP) - 4;
    parts += `<rect x="${cx - 6}" y="${y}" width="12" height="4" class="rest-block"/>`;
  } else {
    // quarter / eighth / sixteenth — a simple upright rest mark
    const yTop = stepY(yOff, 6);
    const yBot = stepY(yOff, 2);
    parts += `<path d="M ${cx - 3} ${yTop} L ${cx + 3} ${(yTop + yBot) / 2} L ${cx - 2} ${yBot}" class="rest-mark"/>`;
  }
  return `<g class="note-head rest-note" data-idx="${n.idx}">${parts}</g>`;
}
