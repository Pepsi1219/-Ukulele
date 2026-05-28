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
 * Renders a ukulele chord diagram as an SVG DOM element.
 *
 * @param {{ frets: number[] }} chordData
 * @returns {SVGSVGElement}
 */
export function renderChordDiagramSVG(chordData) {
  const { baseFret, showFretNum, dots, opens, mutes } = buildDiagramModel(chordData);

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

  return svg;
}
