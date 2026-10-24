import { createUUID } from "./createUUID.js";
import { buildChordsFromLyrics } from "./chordEngine.js";

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeLyrics(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap(entry => {
    if (!isRecord(entry)) return [];
    if (typeof entry.section === "string") return [{ section: entry.section }];
    if (!Array.isArray(entry.line)) return [];
    const line = entry.line
      .filter(isRecord)
      .map(segment => ({
        chord: typeof segment.chord === "string" ? segment.chord : "",
        lyric: typeof segment.lyric === "string" ? segment.lyric : "",
      }));
    return [{ time: Number.isFinite(Number(entry.time)) ? Number(entry.time) : 0, line }];
  });
}

function normalizeChords(value) {
  if (!Array.isArray(value)) return null;
  return value
    .filter(isRecord)
    .map(entry => ({ time: Number(entry.time), chord: typeof entry.chord === "string" ? entry.chord : "" }))
    .filter(entry => Number.isFinite(entry.time) && entry.chord)
    .sort((first, second) => first.time - second.time);
}

function normalizeNotation(value) {
  if (!isRecord(value) || !Array.isArray(value.notes)) return null;
  const notes = value.notes.filter(isRecord);
  if (!notes.length) return null;
  return { config: isRecord(value.config) ? value.config : {}, notes };
}

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
  const lyrics = normalizeLyrics(lyricsArr);
  const explicit = normalizeChords(chordsArr);

  const chords = explicit
    ? explicit
    : buildChordsFromLyrics(lyrics);

  // Notation is kept only when it carries a non-empty notes array; otherwise
  // the song falls back to the chords-derived staff (or the reference image).
  const notation = normalizeNotation(notationObj);

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
