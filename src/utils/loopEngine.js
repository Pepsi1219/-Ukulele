/**
 * loopEngine.js — Pure helper functions for A-B Repeat and Section Loop.
 *
 * All functions are side-effect-free and fully unit-testable.
 *
 * Lyrics array format:
 *   Section labels: { section: "Verse 1" }
 *   Line entries:   { time: 5, line: [{ chord, lyric }, ...] }
 */

/**
 * Finds the playback time bounds of a named section in a lyrics array.
 *
 * - `startTime`: time of the first line entry directly after the section label.
 * - `endTime`:   time of the first line entry in the NEXT section label,
 *                or `null` if this is the last section (caller uses song duration).
 *
 * Returns `null` when:
 *  - lyrics is not an array
 *  - sectionName is falsy
 *  - the section label cannot be found
 *  - the section contains no line entries (empty section)
 *
 * @param {Array}  lyrics
 * @param {string} sectionName
 * @returns {{ startTime: number, endTime: number|null } | null}
 */
export function findSectionBounds(lyrics, sectionName) {
  if (!Array.isArray(lyrics) || !sectionName) return null;

  const trimmed = String(sectionName).trim();

  // Locate the section label
  const sectionIdx = lyrics.findIndex(
    e => e.section != null && String(e.section).trim() === trimmed
  );
  if (sectionIdx === -1) return null;

  // Find startTime: time of the first line entry after this label
  let startTime = null;
  let nextSectionIdx = -1;

  for (let i = sectionIdx + 1; i < lyrics.length; i++) {
    const entry = lyrics[i];
    if (entry.section != null) {
      nextSectionIdx = i;
      break;
    }
    if (startTime === null && Array.isArray(entry.line) && typeof entry.time === "number") {
      startTime = entry.time;
    }
  }

  if (startTime === null) return null; // section has no lines

  // Find endTime: time of the first line entry in the NEXT section
  let endTime = null;
  if (nextSectionIdx !== -1) {
    for (let i = nextSectionIdx + 1; i < lyrics.length; i++) {
      const entry = lyrics[i];
      if (entry.section != null) break; // skip to next-next section → treat as no end
      if (Array.isArray(entry.line) && typeof entry.time === "number") {
        endTime = entry.time;
        break;
      }
    }
  }
  // endTime === null → last section; caller should use song duration

  return { startTime, endTime };
}

/**
 * Normalises an A-B time range so that startTime ≤ endTime.
 * If the user marks B before A in time, the values are swapped.
 *
 * @param {number} timeA
 * @param {number} timeB
 * @returns {{ startTime: number, endTime: number }}
 */
export function normalizeABRange(timeA, timeB) {
  return timeA <= timeB
    ? { startTime: timeA, endTime: timeB }
    : { startTime: timeB, endTime: timeA };
}

/**
 * Determines whether playback should jump back to the loop start.
 *
 * Returns `true` when `loopEnd` is finite and `currentTime >= loopEnd`.
 * Returns `false` for non-finite (Infinity, NaN) or missing `loopEnd` values
 * so callers never loop when the end point is unknown.
 *
 * @param {number} currentTime
 * @param {number} loopStart   (unused in the check — kept for symmetry / documentation)
 * @param {number} loopEnd
 * @returns {boolean}
 */
export function shouldSeekBack(currentTime, loopStart, loopEnd) {
  if (!isFinite(loopEnd) || loopEnd == null) return false;
  return currentTime >= loopEnd;
}

/**
 * Calculates the CSS `left` percent and width for loop markers / region overlay
 * on a progress bar.
 *
 * Values are clamped to [0, 100].  Returns all-zero when duration ≤ 0.
 *
 * @param {number} duration   total song duration in seconds
 * @param {number} startTime  loop start in seconds
 * @param {number} endTime    loop end in seconds
 * @returns {{ aPercent: number, bPercent: number, regionWidth: number }}
 */
export function calcLoopMarkerPercents(duration, startTime, endTime) {
  if (!duration || duration <= 0) {
    return { aPercent: 0, bPercent: 0, regionWidth: 0 };
  }
  const clamp  = v => Math.min(Math.max(v, 0), 100);
  const aPercent    = clamp((startTime / duration) * 100);
  const bPercent    = clamp((endTime   / duration) * 100);
  const regionWidth = Math.max(bPercent - aPercent, 0);
  return { aPercent, bPercent, regionWidth };
}
