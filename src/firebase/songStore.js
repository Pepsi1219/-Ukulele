// Song data access layer — reads and writes the `songs/{id}/data/*` docs.
//
// Song identity/metadata (id, title, mp3 path, bpm) and the audio/image
// files themselves stay local (manifest.json + songs/, vocal/,
// "Letter Note Notation/" served as static files) — no Storage bucket
// required. Only the editable payloads (lyrics/chords/notation) live in
// Firestore, keyed by the song id from manifest.json:
//
//   songs/{id}/data/lyrics    → { json: "<stringified Lyrics array>" }
//   songs/{id}/data/chords    → { json: "<stringified Chords array>" }
//   songs/{id}/data/notation  → { json: "<stringified Notation object>" }
//
// Payloads are stored as JSON strings (`json` field) rather than nested
// Firestore maps: this keeps byte-exact fidelity with the original file
// format, sidesteps Firestore's nested-array restrictions, and lets the
// editor's existing exportTo*Json() output be written verbatim.

import {
  collection, doc, getDoc, setDoc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase.js";

/** Parses a `{ json }` data doc; returns `fallback` when missing/corrupt. */
function parseDataDoc(snap, fallback) {
  if (!snap.exists()) return fallback;
  try {
    const raw = snap.data().json;
    return typeof raw === "string" ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Fetches one song's lyrics / chords / notation payloads in parallel.
 * Missing docs are tolerated (same policy as the old per-file fetch).
 */
export async function fetchSongData(songId) {
  const base = collection(db, "songs", songId, "data");
  const [lyricsSnap, chordsSnap, notationSnap] = await Promise.all([
    getDoc(doc(base, "lyrics")),
    getDoc(doc(base, "chords")),
    getDoc(doc(base, "notation")),
  ]);
  return {
    lyrics:   parseDataDoc(lyricsSnap, []),
    chords:   parseDataDoc(chordsSnap, null),
    notation: parseDataDoc(notationSnap, null),
  };
}

/**
 * Writes one payload ("lyrics" | "chords" | "notation") for a song.
 * `json` must already be a JSON string (e.g. from exportToLyricsJson()).
 */
export async function saveSongData(songId, kind, json) {
  if (!["lyrics", "chords", "notation"].includes(kind)) {
    throw new Error(`saveSongData: unknown kind "${kind}"`);
  }
  JSON.parse(json); // validate before writing — throws on corrupt payload
  await setDoc(doc(db, "songs", songId, "data", kind), {
    json,
    updatedAt: serverTimestamp(),
  });
}
