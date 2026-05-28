/**
 * Fallback chord builder — extracts the first chord-bearing segment from each
 * lyric line. Used when no explicit Chords/<id>.json is provided.
 *
 * @param {Array} lyrics  - array of lyric entries from Lyrics/<id>.json
 * @returns {Array<{time: number, chord: string}>}
 */
export function buildChordsFromLyrics(lyrics) {
  const chords = [];
  lyrics.forEach(entry => {
    if (!Array.isArray(entry.line)) return;
    const firstSeg = entry.line.find(seg => seg.chord);
    if (firstSeg) {
      chords.push({ time: Number(entry.time), chord: firstSeg.chord });
    }
  });
  return chords.sort((a, b) => a.time - b.time);
}

/**
 * Returns the index of the last item in `items` whose `.time` is ≤ currentSeconds.
 * Returns -1 if no item has been reached yet.
 *
 * Assumes `items` is sorted ascending by `.time`.
 *
 * @param {Array<{time: number}>} items
 * @param {number} currentSeconds
 * @returns {number}
 */
export function findCurrentTimedIndex(items, currentSeconds) {
  let index = -1;
  for (let i = 0; i < items.length; i++) {
    if (currentSeconds >= Number(items[i].time)) index = i;
    else break;
  }
  return index;
}
