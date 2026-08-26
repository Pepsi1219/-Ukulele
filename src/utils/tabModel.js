/**
 * tabModel.js — Maps a parsed notation model onto ukulele tablature positions.
 *
 * Ownership:
 *   - Owns the pitch → (string, fret) semantics for standard reentrant-tuned
 *     ukulele (G4-C4-E4-A4).
 *   - Owns the "smart fingering" pick: given multiple valid positions for a
 *     pitch, choose the one closest to the previous note's hand position so
 *     the tab stays playable rather than jumping across the neck.
 *   - Owns the per-note override contract: if a note carries `tabString` +
 *     `tabFret`, that pin wins (teacher intent > algorithm).
 *
 * Does NOT own: layout, SVG output, or any DOM concern.
 *
 * @module tabModel
 */

// ── Ukulele tuning ──────────────────────────────────────────────────────────

/**
 * Open-string MIDI pitches, reentrant tuning (high-G, "my dog has fleas").
 * Index order mirrors `src/data/ukeChords.js`:
 *   0 = G string (G4, MIDI 67)
 *   1 = C string (C4, MIDI 60) — lowest sounding pitch
 *   2 = E string (E4, MIDI 64)
 *   3 = A string (A4, MIDI 69) — 1st string
 */
export const UKE_OPEN_MIDI = [67, 60, 64, 69];

/**
 * Visual top-to-bottom order of tab lines. Standard ukulele tab publications
 * put the highest-pitched *1st string* (A) on top, then E, C, G. That's what
 * students see in printed tab, so the renderer draws in this order:
 *
 *   display row 0 (top)    → A string (UKE_OPEN_MIDI index 3)
 *   display row 1          → E        (index 2)
 *   display row 2          → C        (index 1)
 *   display row 3 (bottom) → G        (index 0)   ← reentrant high-G
 */
export const UKE_TAB_ROW_ORDER = [3, 2, 1, 0];

/** Practical upper limit for uke fingerboard (soprano/concert). */
export const MAX_FRET = 15;

// ── Pitch → MIDI ────────────────────────────────────────────────────────────

/** Diatonic step → semitone offset within an octave (C=0 … B=11). */
const STEP_SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/**
 * Converts a scientific-pitch object (`{step, alter, octave}` — same shape
 * that `parsePitch` produces) into a MIDI note number. Rests / invalid pitch
 * → null. Convention: MIDI 60 = C4.
 *
 * @param {{step?:string, alter?:number, octave?:number, rest?:boolean}|null} pitch
 * @returns {number|null}
 */
export function midiFromPitch(pitch) {
  if (!pitch || pitch.rest) return null;
  const s = STEP_SEMITONE[pitch.step];
  if (s == null) return null;
  const octave = Number(pitch.octave);
  if (!Number.isFinite(octave)) return null;
  return (octave + 1) * 12 + s + (Number(pitch.alter) || 0);
}

/**
 * Same as midiFromPitch but takes a parsed note-model entry directly (a note
 * from parseNotation carries step/octave/alter at the top level).
 */
export function midiFromNote(n) {
  if (!n || n.isRest || n.step == null || n.octave == null) return null;
  return midiFromPitch({ step: n.step, alter: n.alter, octave: n.octave });
}

// ── Fingering search ────────────────────────────────────────────────────────

/**
 * Every playable (string, fret) that sounds `midi` on a standard-tuned uke.
 * Returned in string order (G, C, E, A).
 *
 * @param {number|null} midi
 * @param {number} [maxFret=MAX_FRET]
 * @returns {Array<{stringIdx:number, fret:number}>}
 */
export function positionsForMidi(midi, maxFret = MAX_FRET) {
  if (midi == null) return [];
  const out = [];
  for (let s = 0; s < UKE_OPEN_MIDI.length; s++) {
    const fret = midi - UKE_OPEN_MIDI[s];
    if (fret >= 0 && fret <= maxFret) out.push({ stringIdx: s, fret });
  }
  return out;
}

/**
 * Hand-movement cost between two positions. String moves are weighted heavier
 * than fret moves because sliding along one string is physically easier for
 * a student than jumping strings.
 */
function distance(a, b) {
  return Math.abs(a.fret - b.fret) + Math.abs(a.stringIdx - b.stringIdx) * 2;
}

/**
 * Smart fingering pick. When there's a previous position, prefer the closest
 * one so the hand doesn't leap. Without a previous position (song start, or
 * the previous note was a rest that reset memory), fall back to the shape
 * students see most in beginner tab: lowest fret first, breaking ties by
 * lowest string index.
 *
 * @param {Array<{stringIdx:number, fret:number}>} positions
 * @param {{stringIdx:number, fret:number}|null} prev
 * @returns {{stringIdx:number, fret:number}|null}
 */
export function pickBestPosition(positions, prev) {
  if (!positions.length) return null;
  if (!prev) {
    return positions.slice().sort(
      (a, b) => a.fret - b.fret || a.stringIdx - b.stringIdx
    )[0];
  }
  return positions.slice().sort(
    (a, b) => distance(a, prev) - distance(b, prev) || a.fret - b.fret
  )[0];
}

/**
 * True when the note carries a fully-specified, in-range tab override.
 * Partial overrides (only string, only fret) are ignored — the contract is
 * "both or neither" so a half-set field can't silently mispin a fingering.
 */
function hasValidOverride(n) {
  return n.tabString != null && n.tabFret != null &&
         n.tabString >= 0 && n.tabString < UKE_OPEN_MIDI.length &&
         n.tabFret >= 0 && n.tabFret <= MAX_FRET;
}

/**
 * Computes one tab position per note in `model.notes`, in the same order.
 * Rests and out-of-range pitches map to `null`.
 *
 * Smart fingering keeps a `prev` cursor across notes; a rest does NOT reset
 * it (a short rest between two phrases still benefits from staying near the
 * last hand position). A per-note override with both `tabString` and
 * `tabFret` set replaces the algorithm's choice AND updates the cursor, so
 * subsequent auto-picked notes stay close to the teacher's pinned finger.
 *
 * @param {{notes:Array}|null} model
 * @returns {Array<{stringIdx:number, fret:number}|null>}
 */
export function computeTabPositions(model) {
  if (!model || !Array.isArray(model.notes)) return [];
  const out = [];
  let prev = null;
  for (const n of model.notes) {
    if (n.isRest) { out.push(null); continue; }

    if (hasValidOverride(n)) {
      const pos = { stringIdx: n.tabString, fret: n.tabFret };
      out.push(pos);
      prev = pos;
      continue;
    }

    const midi = midiFromNote(n);
    const positions = positionsForMidi(midi);
    const best = pickBestPosition(positions, prev);
    out.push(best);
    if (best) prev = best;
  }
  return out;
}
