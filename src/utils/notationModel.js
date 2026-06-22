/**
 * notationModel.js — Pure functions that turn Notation JSON (or legacy
 * chords-as-melody data) into a normalised, render-ready note model.
 *
 * This module owns the *musical* semantics — pitch, duration, key signature,
 * clef — and is completely free of layout/geometry concerns (those live in
 * staffLayout.js) and of SVG concerns (those live in staffRenderer.js).
 *
 * ── Notation JSON format (Notation/<id>.json) ──────────────────────────────
 *   {
 *     "config": {
 *       "clef": "treble",          // "treble" | "bass"
 *       "key": "C",                // major key — drives the key signature
 *       "timeSignature": [4, 4],   // [beatsPerMeasure, beatUnit]
 *       "measuresPerRow": 3,       // how many measures wrap per staff row
 *       "pickupBeats": 0           // length of the pickup (anacrusis), in beats
 *     },
 *     "notes": [
 *       { "pitch": "A4", "dur": "quarter", "time": 2.79 },
 *       { "pitch": "rest", "dur": "eighth" },
 *       { "pitch": "C5", "dur": "half", "time": 3.83 }
 *     ]
 *   }
 *
 * `pitch` is scientific pitch notation: <letter><accidental?><octave>
 *   e.g. "C4", "F#4", "Bb3".  "rest" (any case) is a rest.
 * `dur`   is a note value: whole | half | quarter | eighth | sixteenth,
 *         optionally suffixed with "." for a dotted value (e.g. "quarter.").
 * `time`  is the playback time in seconds — used only to sync the highlight
 *         with audio; it never affects how the note is drawn.
 *
 * @module notationModel
 */

// ── Pitch ───────────────────────────────────────────────────────────────────

/** Diatonic step → index within an octave (C=0 … B=6). */
const STEP_INDEX = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };

const PITCH_RE = /^([A-Ga-g])([#b]?)(-?\d+)$/;

/**
 * Parses a scientific-pitch string into its components.
 *
 * @param {string} str  e.g. "F#4", "Bb3", "C4", or "rest"
 * @returns {{rest:true} | {rest:false, step:string, alter:number, octave:number} | null}
 *          null when the string is not a valid pitch.
 */
export function parsePitch(str) {
  if (typeof str !== "string") return null;
  const s = str.trim();
  if (!s) return null;
  if (s.toLowerCase() === "rest") return { rest: true };

  const m = PITCH_RE.exec(s);
  if (!m) return null;

  return {
    rest:   false,
    step:   m[1].toUpperCase(),
    alter:  m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0,
    octave: parseInt(m[3], 10),
  };
}

/**
 * Absolute diatonic index — counts white-key steps from C0.
 * C4 → 4*7 + 0 = 28.  Used to compare pitch heights regardless of octave.
 *
 * @param {string} step    one of C D E F G A B
 * @param {number} octave
 * @returns {number}
 */
export function diatonicIndex(step, octave) {
  return octave * 7 + (STEP_INDEX[step] ?? 0);
}

// ── Clef ──────────────────────────────────────────────────────────────────--

/** Pitch sitting on the BOTTOM line of the staff, per clef. */
const CLEF_BOTTOM = {
  treble: { step: "E", octave: 4 }, // bottom line = E4
  bass:   { step: "G", octave: 2 }, // bottom line = G2
};

/**
 * Vertical staff position of a pitch, in half-steps above the bottom line.
 *   0 = bottom line, 1 = first space, 2 = 2nd line … 8 = top line.
 * Negative values sit below the staff (ledger lines below), values > 8 above.
 *
 * @param {{step:string, octave:number}} pitch
 * @param {string} [clef="treble"]
 * @returns {number}
 */
export function staffStepForPitch(pitch, clef = "treble") {
  const base = CLEF_BOTTOM[clef] || CLEF_BOTTOM.treble;
  return diatonicIndex(pitch.step, pitch.octave) -
         diatonicIndex(base.step, base.octave);
}

// ── Duration ────────────────────────────────────────────────────────────────

/** Note value → beats (in 4/4, i.e. relative to a quarter = 1). */
const DUR_BEATS = {
  whole:     4,
  half:      2,
  quarter:   1,
  eighth:    0.5,
  sixteenth: 0.25,
};

/** Number of flags drawn on the stem, per note value. */
const DUR_FLAGS = { eighth: 1, sixteenth: 2 };

/**
 * Parses a duration token into render-ready info.
 * A trailing "." marks a dotted value (×1.5).
 *
 * @param {string} dur  e.g. "quarter", "half.", "eighth"
 * @returns {{beats:number, glyph:string, dotted:boolean, flags:number, filled:boolean}}
 */
export function parseDuration(dur) {
  let s = typeof dur === "string" ? dur.trim().toLowerCase() : "";
  let dotted = false;
  if (s.endsWith(".")) {
    dotted = true;
    s = s.slice(0, -1);
  }
  const glyph = DUR_BEATS[s] != null ? s : "quarter";
  const base  = DUR_BEATS[glyph];
  return {
    beats:  dotted ? base * 1.5 : base,
    glyph,
    dotted,
    flags:  DUR_FLAGS[glyph] || 0,
    filled: glyph !== "whole" && glyph !== "half", // hollow head for half/whole
  };
}

// ── Key signature ─────────────────────────────────────────────────────────--

/** Canonical order accidentals appear in a key signature. */
const SHARP_ORDER = ["F", "C", "G", "D", "A", "E", "B"];
const FLAT_ORDER  = ["B", "E", "A", "D", "G", "C", "F"];

/** Major key → number of sharps (+) or flats (−). */
const KEY_ACCIDENTALS = {
  "C": 0,
  "G": 1, "D": 2, "A": 3, "E": 4, "B": 5, "F#": 6, "C#": 7,
  "F": -1, "Bb": -2, "Eb": -3, "Ab": -4, "Db": -5, "Gb": -6, "Cb": -7,
};

/** True when `key` is a recognised major key. */
export function isKnownKey(key) {
  return typeof key === "string" && KEY_ACCIDENTALS[key] !== undefined;
}

/**
 * Resolves a major key into the accidentals its key signature draws.
 *
 * @param {string} key  e.g. "C", "G", "F", "Bb"
 * @returns {{type:"sharp"|"flat"|"none", steps:string[]}}
 *          `steps` is the ordered list of note letters that get an accidental.
 */
export function keySignature(key) {
  const n = KEY_ACCIDENTALS[key] ?? 0;
  if (n > 0) return { type: "sharp", steps: SHARP_ORDER.slice(0, n) };
  if (n < 0) return { type: "flat",  steps: FLAT_ORDER.slice(0, -n) };
  return { type: "none", steps: [] };
}

// ── Config ────────────────────────────────────────────────────────────────--

/**
 * Normalises a raw config object, filling in sensible defaults and clamping
 * out-of-range values.
 *
 * @param {Object} [cfg]
 * @returns {{clef:string, key:string, timeSignature:[number,number],
 *            measuresPerRow:number, pickupBeats:number}}
 */
export function normalizeConfig(cfg = {}) {
  cfg = cfg || {};  // guard against an explicit null (default only covers undefined)
  const rawTs = cfg.timeSignature;
  const timeSignature = Array.isArray(rawTs) && rawTs.length === 2
    ? [Math.max(1, Number(rawTs[0]) || 4), Math.max(1, Number(rawTs[1]) || 4)]
    : [4, 4];

  // measuresPerRow / pickupBeats: default only when not a finite number, so an
  // explicit invalid value like 0 clamps to the minimum rather than the default.
  const mpr     = Number(cfg.measuresPerRow);
  const pickup  = Number(cfg.pickupBeats);

  return {
    clef:           cfg.clef === "bass" ? "bass" : "treble",
    key:            isKnownKey(cfg.key) ? cfg.key : "C",
    timeSignature,
    measuresPerRow: Number.isFinite(mpr)    ? Math.max(1, Math.floor(mpr)) : 3,
    pickupBeats:    Number.isFinite(pickup) ? Math.max(0, pickup)          : 0,
  };
}

// ── Parse ─────────────────────────────────────────────────────────────────--

/**
 * Turns a single raw note entry into a normalised note model.
 *
 * @param {Object} raw   { pitch, dur, time }
 * @param {number} idx   index in the source array (kept for highlight sync)
 * @param {string} clef
 * @returns {Object} normalised note
 */
function parseNote(raw, idx, clef) {
  const pitch = raw ? parsePitch(raw.pitch) : null;
  const isRest = !pitch || pitch.rest;
  const dur = parseDuration(raw && raw.dur);
  const time = raw && isFinite(Number(raw.time)) ? Number(raw.time) : null;

  return {
    idx,
    isRest,
    step:      isRest ? null : pitch.step,
    octave:    isRest ? null : pitch.octave,
    alter:     isRest ? 0    : pitch.alter,
    staffStep: isRest ? null : staffStepForPitch(pitch, clef),
    label:     isRest ? ""   : pitch.step + (pitch.alter === 1 ? "♯" : pitch.alter === -1 ? "♭" : ""),
    glyph:     dur.glyph,
    dotted:    dur.dotted,
    flags:     dur.flags,
    filled:    dur.filled,
    durBeats:  dur.beats,
    time,
  };
}

/**
 * Parses a full Notation JSON object into `{ config, notes }`, where every
 * note carries its pitch, staff position, duration and draw hints.
 *
 * @param {Object} json  parsed Notation/<id>.json
 * @returns {{config:Object, notes:Array}}
 */
export function parseNotation(json) {
  const config = normalizeConfig(json && json.config);
  const rawNotes = Array.isArray(json && json.notes) ? json.notes : [];
  const notes = rawNotes.map((n, i) => parseNote(n, i, config.clef));
  return { config, notes };
}

// ── Legacy adapter ────────────────────────────────────────────────────────--

/** Quantises a raw beat-gap to the nearest supported note value. */
function quantizeGlyph(beats) {
  if (beats < 0.75) return "eighth";
  if (beats < 1.5)  return "quarter";
  if (beats < 3)    return "half";
  return "whole";
}

/**
 * Backward-compatibility adapter: converts the legacy "chords-as-melody"
 * format (`[{time, chord}]`, where each `chord` is a single melody letter)
 * into a Notation object, inferring durations from the time gaps.
 *
 * This keeps lesson songs that have no Notation/<id>.json file yet rendering
 * exactly as before, until a real notation file is authored for them.
 *
 * @param {Array<{time:number, chord:string}>} chords
 * @param {number} [bpm=90]
 * @returns {{config:Object, notes:Array}}  parsed model (ready for layout)
 */
export function chordsToNotation(chords, bpm = 90) {
  const list = Array.isArray(chords) ? chords : [];
  const beatDur = 60 / (Number(bpm) || 90);

  const rawNotes = [];
  for (let i = 0; i < list.length; i++) {
    const letter = String(list[i].chord || "")
      .replace(/[^A-Ga-g]/g, "")
      .toUpperCase()[0];
    if (!letter) continue;

    const t   = Number(list[i].time);
    const gap = i < list.length - 1 ? Number(list[i + 1].time) - t : beatDur * 4;
    rawNotes.push({
      pitch: `${letter}4`,
      dur:   quantizeGlyph(gap / beatDur),
      time:  isFinite(t) ? t : null,
    });
  }

  return parseNotation({
    config: { clef: "treble", key: "C", timeSignature: [4, 4], measuresPerRow: 3, pickupBeats: 0 },
    notes:  rawNotes,
  });
}
