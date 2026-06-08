import { UKE_CHORDS } from "../data/ukeChords.js";

// ── SVG Layout Constants ────────────────────────────────────────────────────
const STRINGS    = 4;
const FRETS_SHOW = 4;

const SVG_W      = 104;
const SVG_H      = 132;

// x positions for each string (G=0 left … A=3 right)
const STRING_X   = [14, 37, 60, 83];

// y position of the nut (or top reference line when baseFret > 1)
const NUT_Y      = 30;

// y positions of the fret lines shown below the nut (frets 1–4 relative)
const FRET_LINE_Y = [52, 74, 96, 118];

// y midpoints between nut/fret-lines — where finger dots are drawn
const DOT_Y       = [41, 63, 85, 107];

// y position of open-string circles / muted-string X markers (above nut)
const INDICATOR_Y = 17;

const DOT_R       = 8;   // finger-dot radius
const OPEN_R      = 5;   // open-string circle radius
const MUTE_HALF   = 5;   // half-size of the muted-X strokes

// ── Pure Helper Functions (testable without DOM) ────────────────────────────

/**
 * Looks up chord data by name, normalising whitespace.
 * Returns null for unknown chords.
 * @param {string} chordName
 * @returns {{ frets: number[] } | null}
 */
export function getChordData(chordName) {
  if (!chordName || typeof chordName !== "string") return null;
  return UKE_CHORDS[chordName.trim()] ?? null;
}

/**
 * Calculates the lowest fret to show (base fret) for a chord.
 *
 * - If all pressed frets fit in the window [1 … FRETS_SHOW], returns 1.
 * - Otherwise returns the minimum pressed fret so the window starts there.
 *
 * @param {number[]} frets  — absolute fret numbers (0=open, -1=muted, ≥1=pressed)
 * @returns {number}
 */
export function calcBaseFret(frets) {
  const pressed = frets.filter(f => f > 0);
  if (!pressed.length) return 1;
  const maxFret = Math.max(...pressed);
  if (maxFret <= FRETS_SHOW) return 1;
  return Math.min(...pressed);
}

/**
 * Builds a plain data model for the diagram — no DOM, easily serialisable.
 * Used by the SVG renderer and by unit tests.
 *
 * @param {{ frets: number[] }} chordData
 * @returns {{
 *   baseFret: number,
 *   showFretNum: boolean,
 *   dots: Array<{ stringIdx: number, dotYIdx: number }>,
 *   opens: number[],
 *   mutes: number[]
 * }}
 */
export function buildDiagramModel(chordData) {
  const { frets } = chordData;
  const baseFret   = calcBaseFret(frets);
  const showFretNum = baseFret > 1;

  const dots  = [];
  const opens = [];
  const mutes = [];

  frets.forEach((fret, s) => {
    if (fret === -1) {
      mutes.push(s);
    } else if (fret === 0) {
      opens.push(s);
    } else {
      const rel = fret - baseFret + 1;   // relative fret (1-based inside window)
      if (rel >= 1 && rel <= FRETS_SHOW) {
        dots.push({ stringIdx: s, dotYIdx: rel - 1 });
      }
    }
  });

  return { baseFret, showFretNum, dots, opens, mutes };
}

// ── Note-name helpers (for "single-note picking" practice mode) ─────────────

// Pitch class (0=C … 11=B) sounded by each *open* string in GCEA tuning
const OPEN_PITCH_CLASS = [7, 0, 4, 9]; // G, C, E, A

// Maps note-name spellings (sharps & flats) to a pitch class 0–11
const NOTE_PITCH_CLASS = {
  C: 0,  "C#": 1, Db: 1,
  D: 2,  "D#": 3, Eb: 3,
  E: 4,
  F: 5,  "F#": 6, Gb: 6,
  G: 7,  "G#": 8, Ab: 8,
  A: 9,  "A#": 10, Bb: 10,
  B: 11,
};

/**
 * Extracts the root-note name (e.g. "C", "Bb", "F#") from the start of a
 * chord name such as "Cm7", "Bbmaj7", "F#m". Returns null when it can't
 * be parsed (unknown / malformed chord name).
 *
 * @param {string} chordName
 * @returns {string | null}
 */
export function getRootNoteName(chordName) {
  if (!chordName || typeof chordName !== "string") return null;
  const m = chordName.trim().match(/^([A-G][#b]?)/);
  return m ? m[1] : null;
}

// Display-order string names — index matches STRING_X / frets arrays (G, C, E, A)
const STRING_NAMES = ["G", "C", "E", "A"];

/**
 * Finds the lowest fret (0–11) on a given string that *actually sounds*
 * the given note — i.e. the real pitch produced at that string+fret, not
 * a chord-shape lookup. This is what lets the same note (e.g. "C") map to
 * several valid positions across the fretboard (open C string, A string
 * fret 3, etc.) — exactly how a real ukulele behaves.
 *
 * @param {number} stringIdx — 0=G, 1=C, 2=E, 3=A
 * @param {string} noteName  — e.g. "C", "Bb", "F#"
 * @returns {number | null} fret 0–11, or null for an unrecognised note name
 */
export function findFretForNote(stringIdx, noteName) {
  const pitchClass = NOTE_PITCH_CLASS[noteName];
  if (pitchClass === undefined) return null;
  const openPitchClass = OPEN_PITCH_CLASS[stringIdx];
  return (pitchClass - openPitchClass + 12) % 12;
}

/**
 * Picks the best fretboard position to play a given note, according to
 * the selected practice mode:
 *
 *  - "G" | "C" | "E" | "A": always play on that one string (its lowest
 *    fret that sounds the note) — for single-string picking exercises.
 *  - "auto" (Fingerstyle): considers all four strings and picks whichever
 *    is closest to the previous position, so the hand barely has to move.
 *    With no previous position yet, picks the lowest-fret option overall
 *    (the easiest first reach, closest to the nut).
 *
 * @param {string} noteName — e.g. "C", "Bb", "F#"
 * @param {"G"|"C"|"E"|"A"|"auto"} mode
 * @param {{ stringIdx: number, fret: number } | null} [prevPosition]
 * @returns {{ stringIdx: number, fret: number } | null}
 */
export function pickNotePosition(noteName, mode, prevPosition = null) {
  if (NOTE_PITCH_CLASS[noteName] === undefined) return null;

  if (mode !== "auto") {
    const stringIdx = STRING_NAMES.indexOf(mode);
    if (stringIdx === -1) return null;
    return { stringIdx, fret: findFretForNote(stringIdx, noteName) };
  }

  // Fingerstyle (auto) — evaluate the note's lowest-fret position on every string
  const candidates = STRING_NAMES.map((_, stringIdx) => ({
    stringIdx,
    fret: findFretForNote(stringIdx, noteName),
  }));

  if (!prevPosition) {
    return candidates.reduce((best, c) => (c.fret < best.fret ? c : best));
  }

  // "Closest to the hand" — minimise neck (fret) movement first, string
  // (lateral) movement second; fret shifts cost more than string changes
  const distance = (c) =>
    Math.abs(c.fret - prevPosition.fret) * 2 + Math.abs(c.stringIdx - prevPosition.stringIdx);

  return candidates.reduce((best, c) => (distance(c) < distance(best) ? c : best));
}

/**
 * Builds a diagram model that highlights a single fretboard position with
 * its note name — used for "single-note picking" practice mode (toggled
 * from the chord diagram, for exercises that pluck individual notes
 * rather than strum full chords).
 *
 * @param {{ stringIdx: number, fret: number } | null} position
 * @param {string | null} noteLabel — note name to display, e.g. "C"
 * @returns {{
 *   baseFret: number,
 *   showFretNum: boolean,
 *   dots: Array<{ stringIdx: number, dotYIdx: number }>,
 *   opens: number[],
 *   mutes: number[],
 *   noteLabel: string | null
 * }}
 */
export function buildNotePositionModel(position, noteLabel = null) {
  if (!position) {
    return { baseFret: 1, showFretNum: false, dots: [], opens: [], mutes: [], noteLabel };
  }

  const { stringIdx, fret } = position;

  if (fret === 0) {
    return { baseFret: 1, showFretNum: false, dots: [], opens: [stringIdx], mutes: [], noteLabel };
  }

  const baseFret = calcBaseFret([fret]);
  const rel      = fret - baseFret + 1;
  return {
    baseFret,
    showFretNum: baseFret > 1,
    dots: [{ stringIdx, dotYIdx: rel - 1 }],
    opens: [],
    mutes: [],
    noteLabel,
  };
}

// ── SVG DOM Renderer (requires browser / jsdom `document`) ──────────────────

/**
 * Creates an SVG element with given attributes and optional text content.
 * Uses the SVG namespace.
 * @private
 */
function svgEl(tag, attrs = {}, text = null) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
  if (text !== null) el.textContent = text;
  return el;
}

/**
 * Shared SVG drawing routine — renders the fretboard grid plus whatever
 * indicators (dots / open circles / mutes / fret number / note label) the
 * given model describes. Used by both the full-chord and single-note
 * diagram renderers so their visual grid stays identical.
 *
 * @param {{
 *   baseFret: number, showFretNum: boolean,
 *   dots: Array<{ stringIdx: number, dotYIdx: number }>,
 *   opens: number[], mutes: number[]
 * }} model
 * @param {{ noteLabel?: string | null }} [opts]
 * @returns {SVGSVGElement}
 * @private
 */
function renderDiagramFromModel({ baseFret, showFretNum, dots, opens, mutes }, opts = {}) {
  const { noteLabel = null } = opts;

  const svg = svgEl("svg", {
    viewBox: `0 0 ${SVG_W} ${SVG_H}`,
    xmlns:   "http://www.w3.org/2000/svg",
    class:   "chord-diagram-svg",
    "aria-hidden": "true",
  });

  // ── Nut or top reference line ──────────────────────────────────────────────
  svg.appendChild(svgEl("line", {
    x1: STRING_X[0], y1: NUT_Y,
    x2: STRING_X[STRINGS - 1], y2: NUT_Y,
    class: showFretNum ? "cd-fret-line" : "cd-nut",
  }));

  // ── Fret lines ─────────────────────────────────────────────────────────────
  FRET_LINE_Y.forEach(y => {
    svg.appendChild(svgEl("line", {
      x1: STRING_X[0], y1: y,
      x2: STRING_X[STRINGS - 1], y2: y,
      class: "cd-fret-line",
    }));
  });

  // ── String lines (vertical) ────────────────────────────────────────────────
  STRING_X.forEach(x => {
    svg.appendChild(svgEl("line", {
      x1: x, y1: NUT_Y,
      x2: x, y2: FRET_LINE_Y[FRETS_SHOW - 1],
      class: "cd-string",
    }));
  });

  // ── Open-string indicators ─────────────────────────────────────────────────
  opens.forEach(s => {
    svg.appendChild(svgEl("circle", {
      cx: STRING_X[s], cy: INDICATOR_Y, r: OPEN_R,
      class: "cd-open",
    }));
  });

  // ── Muted-string X markers ─────────────────────────────────────────────────
  mutes.forEach(s => {
    const cx = STRING_X[s];
    svg.appendChild(svgEl("line", {
      x1: cx - MUTE_HALF, y1: INDICATOR_Y - MUTE_HALF,
      x2: cx + MUTE_HALF, y2: INDICATOR_Y + MUTE_HALF,
      class: "cd-mute",
    }));
    svg.appendChild(svgEl("line", {
      x1: cx + MUTE_HALF, y1: INDICATOR_Y - MUTE_HALF,
      x2: cx - MUTE_HALF, y2: INDICATOR_Y + MUTE_HALF,
      class: "cd-mute",
    }));
  });

  // ── Finger dots ────────────────────────────────────────────────────────────
  dots.forEach(({ stringIdx, dotYIdx }) => {
    svg.appendChild(svgEl("circle", {
      cx: STRING_X[stringIdx],
      cy: DOT_Y[dotYIdx],
      r:  DOT_R,
      class: "cd-dot",
    }));
  });

  // ── Base-fret position number (e.g. "3fr") ────────────────────────────────
  if (showFretNum) {
    svg.appendChild(svgEl("text", {
      x: SVG_W - 2, y: DOT_Y[0],
      class:              "cd-fret-num",
      "dominant-baseline": "middle",
      "text-anchor":       "end",
    }, `${baseFret}fr`));
  }

  // ── Note-name label (single-note practice mode) ───────────────────────────
  // Drawn centred on whichever indicator marks the highlighted note.
  if (noteLabel) {
    const target = dots.length
      ? { x: STRING_X[dots[0].stringIdx], y: DOT_Y[dots[0].dotYIdx], on: "dot" }
      : opens.length
        // Open circle is small (r=5) — place the label just above it instead
        // of inside, so it stays legible against the unfilled circle.
        ? { x: STRING_X[opens[0]], y: INDICATOR_Y - OPEN_R - 8, on: "open" }
        : null;

    if (target) {
      svg.appendChild(svgEl("text", {
        x: target.x, y: target.y,
        class: target.on === "dot" ? "cd-note-label" : "cd-note-label cd-note-label-open",
        "dominant-baseline": "central",
        "text-anchor":       "middle",
      }, noteLabel));
    }
  }

  return svg;
}

/**
 * Renders a ukulele chord diagram (full finger-position shape) as an
 * SVG DOM element.
 *
 * @param {{ frets: number[] }} chordData
 * @returns {SVGSVGElement}
 */
export function renderChordDiagramSVG(chordData) {
  return renderDiagramFromModel(buildDiagramModel(chordData));
}

/**
 * Renders a "single-note" diagram — highlights one fretboard position
 * with its note name labelled. Intended for practice exercises that
 * pluck individual notes rather than strum full chords.
 *
 * @param {{ stringIdx: number, fret: number } | null} position
 * @param {string | null} noteLabel
 * @returns {SVGSVGElement}
 */
export function renderNoteDiagramSVG(position, noteLabel = null) {
  return renderDiagramFromModel(buildNotePositionModel(position, noteLabel), { noteLabel });
}
