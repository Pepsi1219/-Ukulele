import { createUUID } from "./createUUID.js";
import { buildChordsFromLyrics } from "./chordEngine.js";

/**
 * Builds a normalised song object from a manifest entry plus its
 * lyrics and chords arrays fetched from the per-song JSON files.
 *
 * @param {Object}      meta        - raw manifest entry (id, title, mp3, bpm)
 * @param {Array|null}  lyricsArr   - content of Lyrics/<id>.json
 * @param {Array|null}  chordsArr   - content of Chords/<id>.json  (null = derive from lyrics)
 * @param {Object|null} [notationObj] - content of Notation/<id>.json (null = none)
 * @returns {{ id, title, mp3, bpm, lyrics, chords, notation }}
 */
export function buildSong(meta, lyricsArr, chordsArr, notationObj = null) {
  const lyrics = Array.isArray(lyricsArr) ? lyricsArr : [];
  const explicit = Array.isArray(chordsArr) ? chordsArr : null;

  const chords = explicit
    ? explicit
        .map(c => ({ time: Number(c.time), chord: String(c.chord || "") }))
        .filter(c => Number.isFinite(c.time) && c.chord)
        .sort((a, b) => a.time - b.time)
    : buildChordsFromLyrics(lyrics);

  // Notation is kept only when it carries a non-empty notes array; otherwise
  // the song falls back to the chords-derived staff (or the reference image).
  const notation =
    notationObj && Array.isArray(notationObj.notes) && notationObj.notes.length
      ? notationObj
      : null;

  return {
    id:     meta.id    || createUUID(),
    title:  meta.title || "Untitled Song",
    mp3:    meta.mp3   || "",
    bpm:    Number(meta.bpm) || 100,
    lyrics,
    chords,
    notation,
  };
}
