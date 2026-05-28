/**
 * Ukulele chord database — standard GCEA tuning.
 *
 * frets[0] = G string (leftmost in diagram)
 * frets[1] = C string
 * frets[2] = E string
 * frets[3] = A string (rightmost in diagram)
 *
 * Values:
 *   0  = open string
 *  -1  = muted / not played
 *  1+  = fret number (absolute from nut)
 */
export const UKE_CHORDS = {
  // ── Major ──────────────────────────────────────────────────────────────────
  "C":   { frets: [0, 0, 0, 3] },
  "D":   { frets: [2, 2, 2, 0] },
  "E":   { frets: [4, 4, 4, 2] },
  "F":   { frets: [2, 0, 1, 0] },
  "G":   { frets: [0, 2, 3, 2] },
  "A":   { frets: [2, 1, 0, 0] },
  "Bb":  { frets: [3, 2, 1, 1] },
  "B":   { frets: [4, 3, 2, 2] },

  // ── Minor ──────────────────────────────────────────────────────────────────
  "Am":  { frets: [2, 0, 0, 0] },
  "Bm":  { frets: [4, 2, 2, 2] },
  "Cm":  { frets: [0, 3, 3, 3] },
  "Dm":  { frets: [2, 2, 1, 0] },
  "Em":  { frets: [0, 4, 3, 2] },
  "Fm":  { frets: [1, 0, 1, 3] },
  "Gm":  { frets: [0, 2, 3, 1] },

  // ── Dominant 7th ───────────────────────────────────────────────────────────
  "C7":  { frets: [0, 0, 0, 1] },
  "D7":  { frets: [2, 2, 2, 3] },
  "E7":  { frets: [1, 2, 0, 2] },
  "F7":  { frets: [2, 3, 1, 0] },
  "G7":  { frets: [0, 2, 1, 2] },
  "A7":  { frets: [0, 1, 0, 0] },
  "B7":  { frets: [2, 1, 2, 0] },

  // ── Minor 7th ──────────────────────────────────────────────────────────────
  "Am7": { frets: [0, 0, 0, 0] },
  "Bm7": { frets: [2, 2, 2, 2] },
  "Cm7": { frets: [0, 3, 3, 3] },
  "Dm7": { frets: [2, 2, 1, 3] },
  "Em7": { frets: [0, 2, 0, 2] },
  "Gm7": { frets: [0, 2, 1, 1] },

  // ── Major 7th ──────────────────────────────────────────────────────────────
  "Cmaj7": { frets: [0, 0, 0, 2] },
  "Dmaj7": { frets: [2, 2, 2, 4] },
  "Fmaj7": { frets: [2, 4, 1, 0] },
  "Gmaj7": { frets: [0, 2, 2, 2] },
  "Amaj7": { frets: [1, 1, 0, 0] },

  // ── Suspended ──────────────────────────────────────────────────────────────
  "Csus2": { frets: [0, 2, 0, 3] },
  "Csus4": { frets: [0, 0, 1, 3] },
  "Dsus2": { frets: [2, 2, 0, 0] },
  "Dsus4": { frets: [0, 2, 3, 0] },
  "Gsus2": { frets: [0, 2, 3, 0] },
  "Gsus4": { frets: [0, 2, 3, 3] },
};
