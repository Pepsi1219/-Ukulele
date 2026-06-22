/**
 * notationEditor.js — Pure functions for the Notation editor tab.
 *
 * The editor manages two pieces of state:
 *   • a config object (clef, key, timeSignature, measuresPerRow, pickupBeats)
 *   • a flat array of note rows, in play order.
 *
 * Note row shape:
 *   { pitch: string, dur: string, time: number|null }
 *
 * Unlike the chord editor, note rows are NEVER reordered on export — their
 * array order is the melody order that drives the drawn rhythm. `time` is only
 * used to sync the highlight with playback.
 *
 * @module notationEditor
 */

import { normalizeConfig, parseDuration } from "./notationModel.js";

/** Normalises a Notation object's config (with defaults) for editing. */
export function buildNotationConfig(notationObj) {
  return normalizeConfig(notationObj && notationObj.config);
}

/**
 * Converts a Notation object's notes into editor rows.
 *
 * @param {Object|null} notationObj  parsed Notation/<id>.json (or null)
 * @returns {Array<{pitch:string, dur:string, time:number|null}>}
 */
export function buildNoteRows(notationObj) {
  const notes = notationObj && Array.isArray(notationObj.notes) ? notationObj.notes : [];
  return notes.map(n => ({
    pitch: n && n.pitch != null ? String(n.pitch) : "",
    dur:   n && n.dur   != null ? String(n.dur)   : "quarter",
    time:  n && Number.isFinite(Number(n.time)) ? Number(n.time) : null,
  }));
}

/** Returns a new rows array with `patch` merged into the row at `idx`. Pure. */
export function updateNoteField(rows, idx, patch) {
  if (!Array.isArray(rows) || idx < 0 || idx >= rows.length) return rows;
  return rows.map((r, i) => (i === idx ? { ...r, ...patch } : r));
}

/** Sets the time of the row at `idx` to `time` (clamped ≥ 0). Pure. */
export function stampNoteTime(rows, idx, time) {
  if (!Array.isArray(rows) || idx < 0 || idx >= rows.length) return rows;
  const t = isFinite(time) ? Math.max(0, time) : 0;
  return rows.map((r, i) => (i === idx ? { ...r, time: parseFloat(t.toFixed(3)) } : r));
}

/** Shifts the time of the row at `idx` by `delta` seconds (clamped ≥ 0). Pure. */
export function shiftNoteTime(rows, idx, delta) {
  if (!Array.isArray(rows) || idx < 0 || idx >= rows.length) return rows;
  const row = rows[idx];
  if (row.time === null || !isFinite(delta)) return rows;
  const t = Math.max(0, row.time + delta);
  return rows.map((r, i) => (i === idx ? { ...r, time: parseFloat(t.toFixed(3)) } : r));
}

/**
 * Inserts a new empty note row after `afterIdx` (use −1 to prepend). Pure.
 */
export function insertNoteRow(rows, afterIdx) {
  if (!Array.isArray(rows)) return rows;
  const at   = Math.max(0, afterIdx + 1);
  const next = [...rows];
  next.splice(at, 0, { pitch: "", dur: "quarter", time: null });
  return next;
}

/** Removes the note row at `idx`. Pure. */
export function removeNoteRow(rows, idx) {
  if (!Array.isArray(rows) || idx < 0 || idx >= rows.length) return rows;
  return rows.filter((_, i) => i !== idx);
}

/** Returns a config normalised with `patch` applied. Pure. */
export function updateConfigField(config, patch) {
  return normalizeConfig({ ...config, ...patch });
}

/**
 * Annotates each note row with running-beat info so the editor can draw a
 * "measure complete" divider after the note that fills a measure, and flag a
 * note whose duration spills across a bar line.
 *
 * Beats are measured in quarter-note units (matching `dur`), and a measure is
 * `timeSignature[0] * 4 / timeSignature[1]` of them (4/4→4, 3/4→3, 6/8→3).
 *
 * @param {Array} rows           note rows
 * @param {[number,number]} timeSignature
 * @returns {Array<{beats:number, startBeat:number, endBeat:number,
 *                  measureIndex:number, completesMeasure:boolean,
 *                  overflowsBar:boolean}>}
 */
export function computeMeasureMap(rows, timeSignature) {
  const ts = normalizeConfig({ timeSignature }).timeSignature;
  const beatsPerMeasure = ts[0] * (4 / ts[1]);
  const EPS = 1e-9;

  let cursor = 0;
  return (Array.isArray(rows) ? rows : []).map(r => {
    const beats     = parseDuration(r && r.dur).beats;
    const startBeat = cursor;
    const endBeat   = startBeat + beats;
    cursor = endBeat;

    const measureIndex = Math.floor(startBeat / beatsPerMeasure + EPS);
    const endMeasure   = Math.floor((endBeat - EPS) / beatsPerMeasure);
    const completesMeasure =
      endBeat > EPS &&
      Math.abs(endBeat / beatsPerMeasure - Math.round(endBeat / beatsPerMeasure)) < EPS;
    const overflowsBar = endMeasure > measureIndex && !completesMeasure;

    return { beats, startBeat, endBeat, measureIndex, completesMeasure, overflowsBar };
  });
}

/** Counts stamped (timed) vs total note rows. */
export function countNotationStamped(rows) {
  if (!Array.isArray(rows)) return { stamped: 0, total: 0 };
  const stamped = rows.filter(r => r.time !== null).length;
  return { stamped, total: rows.length };
}

/**
 * Serialises config + note rows into the Notation JSON format.
 * Empty-pitch rows are dropped; row order is preserved (NOT sorted by time).
 *
 * @param {Object} config
 * @param {Array}  rows
 * @returns {string}  pretty-printed JSON (2-space indent)
 */
export function exportToNotationJson(config, rows) {
  const cfg = normalizeConfig(config);
  const notes = (Array.isArray(rows) ? rows : [])
    .filter(r => r && String(r.pitch).trim())
    .map(r => {
      const note = {
        pitch: String(r.pitch).trim(),
        dur:   String(r.dur || "quarter").trim(),
      };
      if (r.time !== null && Number.isFinite(Number(r.time))) {
        note.time = Number(r.time);
      }
      return note;
    });

  return JSON.stringify({ config: cfg, notes }, null, 2);
}
