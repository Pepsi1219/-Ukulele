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
 * Every actual image filename in `Letter Note Notation/` is the song id in
 * all-lowercase plus a `.png` extension (e.g. "lesson1-a-b-c.png",
 * "lesson1-rockin-the-a-string.png"). Manifest ids are themselves all-lowercase,
 * but this still lower-cases the id defensively so the lookup keeps working
 * even if an id is ever entered with mixed case.
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
  const lower = songId.toLowerCase();
  if (!lower.startsWith("lesson")) return null;
  return `${NOTATION_DIR}/${lower}.png`;
}
