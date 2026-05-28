/**
 * Returns the correct MP3 path for a song given the current audio mode.
 *
 * "song"  → original `songs/<file>` path (unchanged)
 * "vocal" → swaps the `songs/` prefix to `vocal/`
 * null    → original path (no mode selected yet)
 *
 * @param {{ mp3: string }} song
 * @param {"song"|"vocal"|null} audioMode
 * @returns {string}
 */
export function getMp3PathFor(song, audioMode) {
  if (audioMode === "vocal") {
    if (!/^songs\//i.test(song.mp3)) {
      console.warn(
        `getMp3PathFor: "${song.mp3}" doesn't start with "songs/" — vocal swap skipped`
      );
      return song.mp3;
    }
    return song.mp3.replace(/^songs\//i, "vocal/");
  }
  return song.mp3;
}
