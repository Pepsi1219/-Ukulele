/**
 * Renders a 5-line musical staff with standard notation (treble clef, 4/4
 * time signature, filled/hollow noteheads, stems, bar lines) for lesson songs.
 *
 * Note layout uses a treble-clef-like slot system:
 *   Slot 0 = bottom line (E4)  … slot 8 = top line (F5)
 *   Even slots = lines, odd slots = spaces
 *   E=0  F=1  G=2  A=3  B=4  C=5  D=6
 *
 * Note positions are proportional to the actual timestamp in the chord JSON
 * so the visual spacing matches the musical rhythm. Bar lines are drawn at
 * BPM-derived 4/4 measure boundaries.
 *
 * @module staffRenderer
 */

// ── Staff geometry ────────────────────────────────────────────────────────────
const LINE_GAP  = 14;             // px between adjacent staff lines
const STAFF_H   = LINE_GAP * 4;  // 56 px total staff height
const MARGIN_T  = 34;            // above top line (up-stem clearance + labels)
const MARGIN_B  = 28;            // below bottom line (down-stem labels)
const SVG_H     = MARGIN_T + STAFF_H + MARGIN_B; // 118 px

// ── Notehead geometry ─────────────────────────────────────────────────────────
const NH_RX     = 6.5;           // notehead ellipse half-width
const NH_RY     = 4.8;           // notehead ellipse half-height
const NH_ROT    = -18;           // tilt angle for quarter/half heads (degrees)
const STEM_LEN  = LINE_GAP * 3.5 | 0; // 49 px

// ── Horizontal layout ─────────────────────────────────────────────────────────
const CLEF_W    = 30;            // space for treble clef
const TSIG_W    = 22;            // space for "4/4"
const NOTE_PAD  = 24;            // extra gap after time sig before first note
const BEAT_W    = 46;            // px per quarter-note beat (controls density)
const BARPAD    = 10;            // extra px gap added after each bar line
const PAD_L     = 10;
const PAD_R     = 32;

// ── Note slot map ─────────────────────────────────────────────────────────────
const NOTE_SLOT = { E: 0, F: 1, G: 2, A: 3, B: 4, C: 5, D: 6 };

// ─────────────────────────────────────────────────────────────────────────────

/** Round a duration in beats to the nearest standard note value. */
function quantizeBeats(beats) {
  if (beats < 0.75) return 0.5;   // eighth note
  if (beats < 1.5)  return 1;     // quarter note
  if (beats < 2.5)  return 2;     // half note
  if (beats < 3.5)  return 3;     // dotted half
  return 4;                        // whole note
}

/**
 * Builds the SVG string for a 5-line staff with interactive note heads.
 *
 * @param {Array<{time:number, chord:string}>} chords  Note timeline from Chords JSON.
 * @param {number} [bpm=90]                            Song BPM from manifest.
 * @returns {string}                                   SVG element as a string.
 */
export function renderNoteStaff(chords, bpm = 90) {
  if (!chords || !chords.length) return "";

  const beatDur = 60 / bpm;

  // ── 1. Parse and quantize notes ───────────────────────────────────────────
  const notes = chords
    .map((entry, i) => {
      const letter = (entry.chord || "")
        .replace(/[^A-Ga-g]/g, "").toUpperCase()[0];
      if (!letter || NOTE_SLOT[letter] === undefined) return null;
      const gap = i < chords.length - 1
        ? chords[i + 1].time - entry.time
        : beatDur * 4;
      return { letter, time: entry.time, durBeats: quantizeBeats(gap / beatDur) };
    })
    .filter(Boolean);

  if (!notes.length) return "";

  // ── 2. Compute x positions (proportional to time) ─────────────────────────
  const LEFT_OFFSET = PAD_L + CLEF_W + TSIG_W + NOTE_PAD;
  const firstTime   = notes[0].time;

  // Track x advance per bar line inserted (bar lines add BARPAD each time)
  let extraX = 0; // cumulative extra space from bar lines

  // First, figure out where bar lines fall (based on note timing only,
  // ignoring bar line padding for simplicity — the padding shifts notes right
  // but keeps relative spacing intact between notes within a measure).
  const introBeats   = firstTime / beatDur;
  const firstBarBeat = Math.ceil(introBeats / 4) * 4 - introBeats; // beats from first note to next barline

  // Bar lines at: firstBarBeat, firstBarBeat+4, firstBarBeat+8, ...
  // Count how many bar lines fall before each note to determine its extra offset.
  const barlineBeatsFromFirst = [];
  let b = firstBarBeat;
  const lastNoteBeats = (notes[notes.length - 1].time - firstTime) / beatDur;
  while (b <= lastNoteBeats + 4) {
    barlineBeatsFromFirst.push(b);
    b += 4;
  }

  function countBarlinesBefore(beatPos) {
    return barlineBeatsFromFirst.filter(bl => bl <= beatPos).length;
  }

  const noteLayouts = notes.map((note, idx) => {
    const beatsFromFirst = (note.time - firstTime) / beatDur;
    const barsBefore = countBarlinesBefore(beatsFromFirst);
    const x = LEFT_OFFSET + beatsFromFirst * BEAT_W + barsBefore * BARPAD;
    return { ...note, x, idx };
  });

  // ── 3. Compute bar line x positions ──────────────────────────────────────
  const barlineXs = barlineBeatsFromFirst.map((bl, i) => {
    return LEFT_OFFSET + bl * BEAT_W + i * BARPAD;
  });

  // ── 4. SVG width ─────────────────────────────────────────────────────────
  const lastNote = noteLayouts[noteLayouts.length - 1];
  const svgW = lastNote.x + lastNote.durBeats * BEAT_W + PAD_R;

  // ── 5. Coordinate helpers ─────────────────────────────────────────────────
  // Y of staff line i (i=0 bottom, i=4 top)
  const lineY = i => MARGIN_T + STAFF_H - i * LINE_GAP;
  // Y of center of note at slot s
  const noteY = s => MARGIN_T + STAFF_H - s * (LINE_GAP / 2);

  // ── 6. Staff lines ────────────────────────────────────────────────────────
  const staffLines = Array.from({ length: 5 }, (_, i) =>
    `<line x1="${PAD_L}" x2="${svgW}" y1="${lineY(i)}" y2="${lineY(i)}" class="staff-line"/>`
  ).join("");

  // ── 7. Treble clef ────────────────────────────────────────────────────────
  // 𝄞 (U+1D11E) drawn at the bottom line, spanning the staff upward.
  // Different serif fonts position this glyph differently; the y offset keeps
  // the curl of the clef aligned with the second line from the bottom (G4).
  const clefY = lineY(0) + 9;
  const trebleClef = `<text x="${PAD_L + 3}" y="${clefY}"
    font-family="'Times New Roman',Georgia,serif"
    font-size="66" fill="var(--text)" class="staff-clef">𝄞</text>`;

  // ── 8. Time signature (4 over 4) ─────────────────────────────────────────
  const tsigX  = PAD_L + CLEF_W + TSIG_W / 2;
  const tsig4Top = lineY(2) - LINE_GAP;   // upper numeral centred on top 2 lines
  const tsig4Bot = lineY(0) + LINE_GAP / 2; // lower numeral centred on bottom 2 lines
  const timeSig = `
<text x="${tsigX}" y="${tsig4Top}" dy="0.35em"
  font-family="'Times New Roman',Georgia,serif"
  font-size="20" font-weight="700" text-anchor="middle" fill="var(--text)">4</text>
<text x="${tsigX}" y="${tsig4Bot}" dy="0.35em"
  font-family="'Times New Roman',Georgia,serif"
  font-size="20" font-weight="700" text-anchor="middle" fill="var(--text)">4</text>`;

  // ── 9. Bar lines ──────────────────────────────────────────────────────────
  const barLines = barlineXs
    .map(bx => `<line x1="${bx}" y1="${lineY(4)}" x2="${bx}" y2="${lineY(0)}" class="barline"/>`)
    .join("");

  // ── 10. Note heads ────────────────────────────────────────────────────────
  const noteEls = noteLayouts.map(({ letter, durBeats, x: cx, idx }) => {
    const slot   = NOTE_SLOT[letter];
    const cy     = noteY(slot);
    const stemUp = slot <= 4; // below or on middle line (B) → stem up

    let noteType;
    if (durBeats >= 4) noteType = "whole";
    else if (durBeats >= 2) noteType = "half";
    else noteType = "quarter";

    // Notehead element
    let head;
    if (noteType === "whole") {
      // Whole note: wider hollow ellipse, no tilt
      head = `<ellipse cx="${cx}" cy="${cy}" rx="${NH_RX + 2}" ry="${NH_RY}"
        class="note-head-fill whole-fill"/>`;
    } else {
      // Quarter / half: tilted ellipse
      head = `<ellipse cx="${cx}" cy="${cy}" rx="${NH_RX}" ry="${NH_RY}"
        transform="rotate(${NH_ROT},${cx},${cy})"
        class="note-head-fill ${noteType}-fill"/>`;
    }

    // Stem (not for whole notes)
    let stem = "";
    if (noteType !== "whole") {
      const sx  = stemUp ? cx + NH_RX - 1 : cx - NH_RX + 1;
      const sy1 = cy;
      const sy2 = stemUp ? cy - STEM_LEN : cy + STEM_LEN;
      stem = `<line x1="${sx}" y1="${sy1}" x2="${sx}" y2="${sy2}" class="note-stem"/>`;
    }

    // Letter label — opposite side of stem so it doesn't collide
    const labelY = stemUp
      ? cy + NH_RY + 14   // below notehead
      : cy - NH_RY - 10;  // above notehead
    const label = `<text x="${cx}" y="${labelY}" dy="0.35em"
      class="note-label" text-anchor="middle">${letter}</text>`;

    return `<g class="note-head ${noteType}-note" data-idx="${idx}" data-note="${letter}">
  ${head}${stem}${label}
</g>`;
  }).join("\n");

  // ── 11. Final double bar line ─────────────────────────────────────────────
  const finalX = svgW - PAD_R;
  const doubleBar = `
<line x1="${finalX - 4}" y1="${lineY(4)}" x2="${finalX - 4}" y2="${lineY(0)}" class="barline"/>
<line x1="${finalX}" y1="${lineY(4)}" x2="${finalX}" y2="${lineY(0)}"
  stroke="var(--text)" stroke-width="3" stroke-linecap="butt"/>`;

  return `<svg class="note-staff-svg" viewBox="0 0 ${svgW} ${SVG_H}"
  width="${svgW}" height="${SVG_H}"
  xmlns="http://www.w3.org/2000/svg"
  aria-label="Note staff notation">
${staffLines}
${trebleClef}
${timeSig}
${barLines}
${noteEls}
${doubleBar}
</svg>`;
}
