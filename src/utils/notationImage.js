// Resolves "Letter Note Notation" image paths for instrumental lesson songs.
//
// Some songs are pure instrumental exercises (no lyrics — e.g. "Lesson 1: A B C")
// and instead have a static reference image showing the melody as letter-name
// notation (A, B, C … above a staff). These images live in the
// `Letter Note Notation/` folder, named after the song.

const NOTATION_DIR = "Letter Note Notation";

/**
 * Builds the candidate path to a song's Letter Note Notation image, given its
 * manifest `id`.
 *
 * The manifest's lesson-song ids are inconsistently cased (e.g. "lesson1-a-b-c"
 * vs "Lesson1-rockin-the-a-string"), but every actual image filename in
 * `Letter Note Notation/` begins with a capital "Lesson" followed by the exact
 * remainder of the id (e.g. "Lesson1-a-b-c.png", "Lesson1-rockin-the-a-string.png").
 * This normalises the leading "lesson" (any casing) to "Lesson" and keeps the
 * rest of the id untouched, which matches every currently-known image file.
 *
 * Returns null for ids that don't start with "lesson" — i.e. regular songs that
 * have real lyrics and therefore no notation image to look for.
 *
 * Note: this only *resolves a candidate path* — it doesn't check whether the
 * file actually exists (this is a static, no-backend app, so that has to be
 * done by attempting to load the image and handling load failure gracefully).
 *
 * @param {string} songId
 * @returns {string | null}
 */
export function getNotationImagePath(songId) {
  if (!songId || typeof songId !== "string") return null;
  const m = songId.match(/^lesson(.*)$/i);
  if (!m) return null;
  return `${NOTATION_DIR}/Lesson${m[1]}.png`;
}
