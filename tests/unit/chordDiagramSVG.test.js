/**
 * @vitest-environment jsdom
 *
 * Tests for the SVG DOM renderer (renderChordDiagramSVG).
 * Requires jsdom so that document.createElementNS is available.
 */
import { describe, it, expect } from "vitest";
import { renderChordDiagramSVG } from "../../src/utils/chordDiagram.js";

const C_CHORD  = { frets: [0, 0, 0, 3] };  // simple open chord
const AM_CHORD = { frets: [2, 0, 0, 0] };  // one pressed, rest open
const HIGH_CHORD = { frets: [5, 3, 4, 3] }; // base fret > 1

describe("renderChordDiagramSVG", () => {
  it("returns an SVGSVGElement", () => {
    const svg = renderChordDiagramSVG(C_CHORD);
    expect(svg.tagName.toLowerCase()).toBe("svg");
  });

  it("has class chord-diagram-svg", () => {
    const svg = renderChordDiagramSVG(C_CHORD);
    expect(svg.getAttribute("class")).toBe("chord-diagram-svg");
  });

  it("sets a viewBox attribute", () => {
    const svg = renderChordDiagramSVG(C_CHORD);
    expect(svg.getAttribute("viewBox")).toBeTruthy();
  });

  it("renders a nut element (cd-nut class) for base fret 1", () => {
    const svg = renderChordDiagramSVG(C_CHORD);
    const nut = svg.querySelector(".cd-nut");
    expect(nut).not.toBeNull();
  });

  it("renders fret lines", () => {
    const svg = renderChordDiagramSVG(C_CHORD);
    const fretLines = svg.querySelectorAll(".cd-fret-line");
    expect(fretLines.length).toBeGreaterThanOrEqual(4);
  });

  it("renders string lines", () => {
    const svg = renderChordDiagramSVG(C_CHORD);
    const strings = svg.querySelectorAll(".cd-string");
    expect(strings.length).toBe(4); // 4 strings
  });

  it("renders open-string circles for C chord (3 open strings)", () => {
    const svg = renderChordDiagramSVG(C_CHORD);
    const opens = svg.querySelectorAll(".cd-open");
    expect(opens.length).toBe(3); // G, C, E strings open
  });

  it("renders one finger dot for C chord (A string fret 3)", () => {
    const svg = renderChordDiagramSVG(C_CHORD);
    const dots = svg.querySelectorAll(".cd-dot");
    expect(dots.length).toBe(1);
  });

  it("renders correct number of open indicators for Am (3 open strings)", () => {
    const svg = renderChordDiagramSVG(AM_CHORD);
    const opens = svg.querySelectorAll(".cd-open");
    expect(opens.length).toBe(3);
  });

  it("renders one dot for Am (G string fret 2)", () => {
    const svg = renderChordDiagramSVG(AM_CHORD);
    const dots = svg.querySelectorAll(".cd-dot");
    expect(dots.length).toBe(1);
  });

  it("renders muted-string X markers", () => {
    const mutedChord = { frets: [-1, 2, 2, 0] };
    const svg = renderChordDiagramSVG(mutedChord);
    // X marker = 2 lines per muted string
    const mutes = svg.querySelectorAll(".cd-mute");
    expect(mutes.length).toBe(2);
  });

  it("does NOT render cd-nut when baseFret > 1 (uses cd-fret-line instead)", () => {
    const svg = renderChordDiagramSVG(HIGH_CHORD);
    const nut = svg.querySelector(".cd-nut");
    expect(nut).toBeNull();
  });

  it("renders fret position number text when baseFret > 1", () => {
    const svg = renderChordDiagramSVG(HIGH_CHORD);
    const fretNum = svg.querySelector(".cd-fret-num");
    expect(fretNum).not.toBeNull();
    expect(fretNum.textContent).toContain("3");
  });

  it("does NOT render fret position text when baseFret = 1", () => {
    const svg = renderChordDiagramSVG(C_CHORD);
    const fretNum = svg.querySelector(".cd-fret-num");
    expect(fretNum).toBeNull();
  });
});
