/**
 * timestampEditor.js — Pure functions for the Timestamp Editor.
 *
 * The editor works with an intermediate "editor row" representation
 * so that display, mutation, and JSON export are all decoupled.
 *
 * Editor row shapes
 * ─────────────────
 * Section row:
 *   { type: "section", sectionName: string, originalIndex: number, time: null }
 *
 * Line row:
 *   { type: "line", originalIndex: number, time: number|null,
 *     chord: string, lyric: string, originalLine: Array }
 *
 * `originalLine` is the verbatim `line` array from the lyrics JSON —
 * it is preserved untouched so that export reconstructs the exact structure.
 */

/**
 * Converts a lyrics array into an array of editor rows.
 *
 * - `{ section }` entries become section rows (no time, not stampable).
 * - `{ time, line }` entries become line rows.
 * - Unknown entries (neither section nor line) are silently skipped.
 *
 * `time` is stored as a number when valid, or `null` when absent/invalid.
 *
 * @param {Array} lyrics
 * @returns {Array}
 */
export function buildEditorRows(lyrics) {
  if (!Array.isArray(lyrics)) return [];

  const rows = [];

  lyrics.forEach((entry, idx) => {
    if (entry == null) return;

    if (entry.section != null) {
      rows.push({
        type:          "section",
        sectionName:   String(entry.section),
        originalIndex: idx,
        time:          null,
      });
    } else if (Array.isArray(entry.line)) {
      const rawTime = entry.time;
      const time =
        rawTime !== undefined && rawTime !== null && isFinite(Number(rawTime))
          ? Number(rawTime)
          : null;

      const firstSeg  = entry.line[0] ?? {};
      const firstChord = firstSeg.chord ? String(firstSeg.chord) : "";
      const lyricText  = entry.line
        .map(seg => (seg && seg.lyric) ? String(seg.lyric) : "")
        .join(" ")
        .trim();

      rows.push({
        type:          "line",
        originalIndex: idx,
        time,
        chord:         firstChord,
        lyric:         lyricText,
        originalLine:  entry.line,   // verbatim — never mutated
      });
    }
    // Silently skip unrecognised entries
  });

  return rows;
}

/**
 * Returns a new rows array with the time of one line row replaced by `time`.
 *
 * - Does nothing (returns original ref) when `rowIndex` is out of range.
 * - Does nothing when the target row is a section (sections have no timestamp).
 * - `time` is clamped to ≥ 0; non-finite values are treated as 0.
 * - Pure / immutable — the original array is never modified.
 *
 * @param {Array}  rows
 * @param {number} rowIndex
 * @param {number} time   seconds
 * @returns {Array}
 */
export function applyStamp(rows, rowIndex, time) {
  if (!Array.isArray(rows) || rowIndex < 0 || rowIndex >= rows.length) return rows;
  if (rows[rowIndex].type !== "line") return rows;

  const stampTime = isFinite(time) ? Math.max(0, time) : 0;
  return rows.map((row, i) =>
    i === rowIndex ? { ...row, time: stampTime } : row
  );
}

/**
 * Returns a new rows array with the time of one line row shifted by `deltaSeconds`.
 *
 * - Does nothing when `rowIndex` is out of range or the row is a section.
 * - Does nothing when the row's current time is `null` (not yet stamped).
 * - Result is clamped to ≥ 0.
 * - Pure / immutable.
 *
 * @param {Array}  rows
 * @param {number} rowIndex
 * @param {number} deltaSeconds   can be negative (e.g. −0.1 to nudge back)
 * @returns {Array}
 */
export function shiftTime(rows, rowIndex, deltaSeconds) {
  if (!Array.isArray(rows) || rowIndex < 0 || rowIndex >= rows.length) return rows;
  const row = rows[rowIndex];
  if (row.type !== "line" || row.time === null) return rows;
  if (!isFinite(deltaSeconds)) return rows;

  const newTime = Math.max(0, row.time + deltaSeconds);
  return rows.map((r, i) =>
    i === rowIndex ? { ...r, time: parseFloat(newTime.toFixed(3)) } : r
  );
}

/**
 * Serialises editor rows back into the lyrics JSON format used by the app.
 *
 * - Section rows  → `{ section: name }`
 * - Line rows     → `{ time: number, line: [...] }`
 *   (rows with `time === null` are exported with `time: 0`)
 * - Empty chord strings are stripped so segments without a chord export as
 *   `{ lyric: "..." }` rather than `{ chord: "", lyric: "..." }`.
 *
 * @param {Array} rows
 * @returns {string}  pretty-printed JSON string (2-space indent)
 */
export function exportToLyricsJson(rows) {
  if (!Array.isArray(rows)) return "[]";

  const lyrics = rows.map(row => {
    if (row.type === "section") {
      return { section: row.sectionName };
    }
    // line row — rebuild each segment, stripping blank chord fields
    const line = row.originalLine.map(seg => {
      const out = {};
      if (seg.chord && seg.chord.trim()) out.chord = seg.chord.trim();
      out.lyric = seg.lyric ?? "";
      return out;
    });
    return {
      time: row.time !== null ? row.time : 0,
      line,
    };
  });

  return JSON.stringify(lyrics, null, 2);
}

/**
 * Returns the number of stamped and total stampable (line) rows.
 *
 * @param {Array} rows
 * @returns {{ stamped: number, total: number }}
 */
export function countStamped(rows) {
  if (!Array.isArray(rows)) return { stamped: 0, total: 0 };

  const lineRows = rows.filter(r => r.type === "line");
  const stamped  = lineRows.filter(r => r.time !== null);
  return { stamped: stamped.length, total: lineRows.length };
}

// ─── Editing helpers ──────────────────────────────────────────────────────────

/**
 * Returns a new rows array with one segment's chord and/or lyric replaced.
 * Ignores section rows and out-of-range segIdx. Pure / immutable.
 *
 * @param {Array}  rows
 * @param {number} rowIdx
 * @param {number} segIdx
 * @param {{ chord?: string, lyric?: string }} patch  fields to update
 * @returns {Array}
 */
export function updateSegment(rows, rowIdx, segIdx, patch) {
  if (!Array.isArray(rows) || rowIdx < 0 || rowIdx >= rows.length) return rows;
  const row = rows[rowIdx];
  if (row.type !== "line") return rows;
  if (!Array.isArray(row.originalLine) || segIdx < 0 || segIdx >= row.originalLine.length) return rows;

  const newLine = row.originalLine.map((seg, i) =>
    i === segIdx ? { ...seg, ...patch } : seg
  );
  return rows.map((r, i) =>
    i === rowIdx ? { ...r, originalLine: newLine } : r
  );
}

/**
 * Appends an empty `{ chord: "", lyric: "" }` segment to a line row.
 * Pure / immutable.
 *
 * @param {Array}  rows
 * @param {number} rowIdx
 * @returns {Array}
 */
export function addSegment(rows, rowIdx) {
  if (!Array.isArray(rows) || rowIdx < 0 || rowIdx >= rows.length) return rows;
  const row = rows[rowIdx];
  if (row.type !== "line") return rows;

  const newLine = [...row.originalLine, { chord: "", lyric: "" }];
  return rows.map((r, i) =>
    i === rowIdx ? { ...r, originalLine: newLine } : r
  );
}

/**
 * Removes the segment at `segIdx` from a line row.
 * At least one segment must remain — returns original ref when only 1 segment.
 * Pure / immutable.
 *
 * @param {Array}  rows
 * @param {number} rowIdx
 * @param {number} segIdx
 * @returns {Array}
 */
export function removeSegment(rows, rowIdx, segIdx) {
  if (!Array.isArray(rows) || rowIdx < 0 || rowIdx >= rows.length) return rows;
  const row = rows[rowIdx];
  if (row.type !== "line") return rows;
  if (!Array.isArray(row.originalLine) || row.originalLine.length <= 1) return rows;
  if (segIdx < 0 || segIdx >= row.originalLine.length) return rows;

  const newLine = row.originalLine.filter((_, i) => i !== segIdx);
  return rows.map((r, i) =>
    i === rowIdx ? { ...r, originalLine: newLine } : r
  );
}

/**
 * Inserts a new empty line row at position `afterIdx + 1`.
 * Pass `afterIdx = -1` to prepend at index 0.
 * Pure / immutable.
 *
 * @param {Array}  rows
 * @param {number} afterIdx
 * @returns {Array}
 */
export function insertLineRow(rows, afterIdx) {
  if (!Array.isArray(rows)) return rows;
  const insertAt = Math.max(0, afterIdx + 1);
  const newRow = {
    type:          "line",
    originalIndex: -1,
    time:          null,
    chord:         "",
    lyric:         "",
    originalLine:  [{ chord: "", lyric: "" }],
  };
  const next = [...rows];
  next.splice(insertAt, 0, newRow);
  return next;
}

/**
 * Removes the row at `idx` (any type).
 * Returns original ref when idx is out of range.
 * Pure / immutable.
 *
 * @param {Array}  rows
 * @param {number} idx
 * @returns {Array}
 */
export function removeRow(rows, idx) {
  if (!Array.isArray(rows) || idx < 0 || idx >= rows.length) return rows;
  return rows.filter((_, i) => i !== idx);
}

/**
 * Inserts a new section row at position `afterIdx + 1`.
 * Pass `afterIdx = -1` to prepend at index 0.
 * Pure / immutable.
 *
 * @param {Array}  rows
 * @param {number} afterIdx
 * @param {string} [sectionName=""]
 * @returns {Array}
 */
export function insertSectionRow(rows, afterIdx, sectionName = "") {
  if (!Array.isArray(rows)) return rows;
  const insertAt = Math.max(0, afterIdx + 1);
  const newRow = {
    type:          "section",
    sectionName:   String(sectionName),
    originalIndex: -1,
    time:          null,
  };
  const next = [...rows];
  next.splice(insertAt, 0, newRow);
  return next;
}

/**
 * Updates the `sectionName` of a section row at `idx`.
 * Returns original ref when idx is out of range or the row is not a section.
 * Pure / immutable.
 *
 * @param {Array}  rows
 * @param {number} idx
 * @param {string} name
 * @returns {Array}
 */
export function updateSectionName(rows, idx, name) {
  if (!Array.isArray(rows) || idx < 0 || idx >= rows.length) return rows;
  if (rows[idx].type !== "section") return rows;
  return rows.map((r, i) =>
    i === idx ? { ...r, sectionName: String(name) } : r
  );
}
