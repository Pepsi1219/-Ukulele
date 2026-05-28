/**
 * strumEngine.js — Pure functions for the Strumming Pattern Visualizer.
 *
 * Beat notation used throughout:
 *   "D"  = Down strum
 *   "U"  = Up strum
 *   "-"  = Rest / muted (no strum on this subdivision)
 *
 * Each pattern defines:
 *   id       — unique key
 *   label    — short human-readable name
 *   beats    — array of beat tokens (D / U / -)
 *   subDiv   — how many of these beats equal one quarter note
 *              1 = each cell is a quarter note  (pattern runs at BPM speed)
 *              2 = each cell is an 8th note     (pattern runs at BPM × 2 speed)
 *   note     — Thai/English description shown as tooltip
 */

/** @type {Array<{id:string, label:string, beats:string[], subDiv:number, note:string}>} */
export const STRUM_PATTERNS = [
  {
    id:     "d4",
    label:  "D D D D",
    beats:  ["D", "D", "D", "D"],
    subDiv: 1,
    note:   "4/4 เริ่มต้น — ตีลง 4 ครั้งต่อบาร์",
  },
  {
    id:     "du4",
    label:  "D U D U",
    beats:  ["D", "U", "D", "U"],
    subDiv: 1,
    note:   "4/4 สลับขึ้น-ลง — เพิ่มความนุ่มนวล",
  },
  {
    id:     "island",
    label:  "D-DU-UDU",
    beats:  ["D", "-", "D", "U", "-", "U", "D", "U"],
    subDiv: 2,
    note:   "Island Strum — รูปแบบยอดนิยมของอูคูเลเล่",
  },
  {
    id:     "folk",
    label:  "D D UU D U",
    beats:  ["D", "D", "U", "U", "D", "U"],
    subDiv: 2,
    note:   "Folk Strum — เพิ่มความมีชีวิตชีวา",
  },
  {
    id:     "waltz",
    label:  "D D U",
    beats:  ["D", "D", "U"],
    subDiv: 1,
    note:   "3/4 Waltz — เหมาะกับเพลงจังหวะ 3 จังหวะ",
  },
  {
    id:     "aloha",
    label:  "D - D U",
    beats:  ["D", "-", "D", "U"],
    subDiv: 2,
    note:   "Aloha Strum — เบา ผ่อนคลาย",
  },
];

/**
 * Returns the pattern object matching the given id, or null if not found.
 *
 * @param {string} id
 * @returns {{ id:string, label:string, beats:string[], subDiv:number, note:string } | null}
 */
export function getPatternById(id) {
  return STRUM_PATTERNS.find(p => p.id === id) ?? null;
}

/**
 * Calculates which beat index in a strumming pattern is currently active,
 * based on elapsed playback time and the effective beats-per-minute rate.
 *
 * The caller is responsible for adjusting `bpm` for subdivision:
 *   effectiveBpm = songBpm * playbackSpeed * pattern.subDiv
 *
 * Returns 0 for invalid inputs so the UI always shows a valid cell.
 *
 * @param {number} elapsedSeconds   current playback position (seconds)
 * @param {number} bpm              effective beats per minute (after subDiv adjustment)
 * @param {number} patternLength    number of cells in the pattern (beats.length)
 * @returns {number}  index in [0, patternLength)
 */
export function calcCurrentBeat(elapsedSeconds, bpm, patternLength) {
  if (
    bpm <= 0 ||
    patternLength <= 0 ||
    elapsedSeconds < 0 ||
    !isFinite(elapsedSeconds) ||
    !isFinite(bpm)
  ) {
    return 0;
  }
  const beatDuration = 60 / bpm;                        // seconds per one cell
  const beatIndex    = Math.floor(elapsedSeconds / beatDuration);
  return beatIndex % patternLength;
}
