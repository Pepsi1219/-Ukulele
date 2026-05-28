/**
 * chordEditor.js — Pure functions for the Chord Editor tab.
 *
 * Works with a flat array of "chord rows" — one row per chord-change event.
 *
 * Chord row shape:
 *   { originalIndex: number, time: number|null, chord: string }
 *
 * `originalIndex` is the position in the source chords array (−1 for new rows).
 * `time` is seconds from start, or null when not yet stamped.
 * `chord` is the chord name string (e.g. "Am7", "G/B").
 */

/**
 * Converts a chords array `[{ time, chord }, …]` into an array of chord rows.
 *
 * - Invalid / missing time values are stored as `null`.
 * - Non-object / null entries are silently skipped.
 *
 * @param {Array} chords
 * @returns {Array}
 */
export function buildChordRows(chords) {
  if (!Array.isArray(chords)) return [];

  return chords.reduce((acc, entry, idx) => {
    if (entry == null || typeof entry !== "object") return acc;

    const rawTime = entry.time;
    const time =
      rawTime !== undefined && rawTime !== null && isFinite(Number(rawTime))
        ? Number(rawTime)
        : null;

    acc.push({
      originalIndex: idx,
      time,
      chord: entry.chord != null ? String(entry.chord) : "",
    });
    return acc;
  }, []);
}

/**
 * Returns a new rows array with the time of the row at `idx` set to `time`.
 *
 * - Out-of-range idx → returns original ref unchanged.
 * - Non-finite time is treated as 0. Negative time is clamped to 0.
 * - Pure / immutable.
 *
 * @param {Array}  rows
 * @param {number} idx
 * @param {number} time  seconds
 * @returns {Array}
 */
export function applyChordStamp(rows, idx, time) {
  if (!Array.isArray(rows) || idx < 0 || idx >= rows.length) return rows;
  const stampTime = isFinite(time) ? Math.max(0, time) : 0;
  return rows.map((row, i) =>
    i === idx ? { ...row, time: stampTime } : row
  );
}

/**
 * Returns a new rows array with the time of the row at `idx` shifted by
 * `deltaSeconds`.
 *
 * - Does nothing when row time is null (unstamped) or delta is non-finite.
 * - Result is clamped to ≥ 0.
 * - Pure / immutable.
 *
 * @param {Array}  rows
 * @param {number} idx
 * @param {number} deltaSeconds  may be negative
 * @returns {Array}
 */
export function shiftChordTime(rows, idx, deltaSeconds) {
  if (!Array.isArray(rows) || idx < 0 || idx >= rows.length) return rows;
  const row = rows[idx];
  if (row.time === null) return rows;
  if (!isFinite(deltaSeconds)) return rows;

  const newTime = Math.max(0, row.time + deltaSeconds);
  return rows.map((r, i) =>
    i === idx ? { ...r, time: parseFloat(newTime.toFixed(3)) } : r
  );
}

/**
 * Returns a new rows array with the chord name of the row at `idx` replaced.
 * Pure / immutable.
 *
 * @param {Array}  rows
 * @param {number} idx
 * @param {string} chord
 * @returns {Array}
 */
export function updateChordName(rows, idx, chord) {
  if (!Array.isArray(rows) || idx < 0 || idx >= rows.length) return rows;
  return rows.map((r, i) =>
    i === idx ? { ...r, chord: String(chord) } : r
  );
}

/**
 * Inserts a new empty chord row at position `afterIdx + 1`.
 * Pass `afterIdx = -1` to prepend at index 0.
 * Pure / immutable.
 *
 * @param {Array}  rows
 * @param {number} afterIdx
 * @returns {Array}
 */
export function insertChordRow(rows, afterIdx) {
  if (!Array.isArray(rows)) return rows;
  const insertAt = Math.max(0, afterIdx + 1);
  const newRow = { originalIndex: -1, time: null, chord: "" };
  const next   = [...rows];
  next.splice(insertAt, 0, newRow);
  return next;
}

/**
 * Removes the chord row at `idx`.
 * Returns original ref when idx is out of range.
 * Pure / immutable.
 *
 * @param {Array}  rows
 * @param {number} idx
 * @returns {Array}
 */
export function removeChordRow(rows, idx) {
  if (!Array.isArray(rows) || idx < 0 || idx >= rows.length) return rows;
  return rows.filter((_, i) => i !== idx);
}

/**
 * Serialises chord rows back into the chords JSON format used by the app:
 * `[{ time: number, chord: string }, …]`
 *
 * - Rows with `time === null` are exported with `time: 0`.
 * - Output is sorted chronologically by time.
 * - Leading/trailing whitespace is trimmed from chord names.
 *
 * @param {Array} rows
 * @returns {string}  pretty-printed JSON string (2-space indent)
 */
export function exportToChordJson(rows) {
  if (!Array.isArray(rows)) return "[]";

  const chords = rows
    .map(row => ({
      time:  row.time !== null ? row.time : 0,
      chord: row.chord.trim(),
    }))
    .sort((a, b) => a.time - b.time);   // ensure chronological order

  return JSON.stringify(chords, null, 2);
}

/**
 * Extracts chord entries from lyrics editor rows (built by `buildEditorRows`).
 *
 * For each line row, every segment that has a non-empty chord is collected.
 * The segment's timestamp is the row's `time` (0 when the row is unstamped).
 * Multi-chord lines (several segments in one row) all get the same timestamp —
 * the user can fine-tune them after import.
 *
 * Section rows are silently ignored.
 * Output is sorted chronologically.
 *
 * @param {Array} lyricsRows  rows produced by buildEditorRows()
 * @returns {Array}           [{time: number, chord: string}, ...]
 */
export function importChordsFromLyrics(lyricsRows) {
  if (!Array.isArray(lyricsRows)) return [];

  const result = [];

  lyricsRows.forEach(row => {
    if (row.type !== "line") return;
    if (!Array.isArray(row.originalLine)) return;

    const time = row.time !== null ? row.time : 0;

    row.originalLine.forEach(seg => {
      const chord = seg && seg.chord ? String(seg.chord).trim() : "";
      if (!chord) return;            // skip chord-less segments
      result.push({ time, chord });
    });
  });

  result.sort((a, b) => a.time - b.time);
  return result;
}

/**
 * Returns the number of stamped and total chord rows.
 *
 * @param {Array} rows
 * @returns {{ stamped: number, total: number }}
 */
export function countChordStamped(rows) {
  if (!Array.isArray(rows)) return { stamped: 0, total: 0 };
  const stamped = rows.filter(r => r.time !== null);
  return { stamped: stamped.length, total: rows.length };
}

/**
 * Builds a time-indexed lyric context array from lyrics editor rows.
 *
 * Iterates editorRows in positional order (the natural song order) to track
 * the "current section" as it advances through section headers.  Only line
 * rows that carry a non-null timestamp are included in the result.
 *
 * Each entry shape:
 *   { time: number, sectionName: string|null, lyricText: string }
 *
 * - `sectionName` is the most-recent section header seen before this line,
 *   or `null` when the line precedes any section header.
 * - `lyricText` is all segment lyric fields concatenated and trimmed.
 * - Output is sorted chronologically by time.
 *
 * @param {Array} editorRows  rows produced by buildEditorRows()
 * @returns {Array}
 */
export function buildLyricContext(editorRows) {
  if (!Array.isArray(editorRows)) return [];

  const result = [];
  let currentSection = null;

  editorRows.forEach(row => {
    if (row.type === "section") {
      currentSection =
        row.sectionName != null ? String(row.sectionName) : null;
    } else if (row.type === "line" && row.time !== null) {
      const segs = Array.isArray(row.originalLine) ? row.originalLine : [];
      const lyricText = segs
        .map(s => (s && s.lyric != null ? String(s.lyric) : ""))
        .join("")
        .trim();
      result.push({ time: row.time, sectionName: currentSection, lyricText });
    }
  });

  result.sort((a, b) => a.time - b.time);
  return result;
}

/**
 * Returns the context entry that best matches playback time `t`:
 * the last entry whose `time` is ≤ `t`.
 *
 * Returns `null` when:
 *   - `context` is empty
 *   - `t` is non-finite
 *   - `t` is before every entry's time
 *
 * @param {Array}  context  result of buildLyricContext()
 * @param {number} t        seconds
 * @returns {{ time: number, sectionName: string|null, lyricText: string }|null}
 */
export function findLyricContextAt(context, t) {
  if (!Array.isArray(context) || context.length === 0) return null;
  if (!isFinite(t)) return null;

  let match = null;
  for (let i = 0; i < context.length; i++) {
    if (context[i].time <= t) match = context[i];
    else break;
  }
  return match;
}
