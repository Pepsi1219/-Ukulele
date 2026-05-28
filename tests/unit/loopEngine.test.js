// Tests for pure loop logic in loopEngine.js
import { describe, it, expect } from "vitest";
import {
  findSectionBounds,
  normalizeABRange,
  shouldSeekBack,
  calcLoopMarkerPercents,
} from "../../src/utils/loopEngine.js";

// ─── Sample lyrics fixture ────────────────────────────────────────────────────
//
// Structure mirrors real song JSON:
//   { section: "Name" }   → section label
//   { time, line: [...] } → lyric line
//
const LYRICS = [
  { section: "Intro" },
  { time: 0,  line: [{ chord: "C",  lyric: "Intro line 1" }] },
  { time: 4,  line: [{ chord: "G",  lyric: "Intro line 2" }] },
  { section: "Verse 1" },
  { time: 8,  line: [{ chord: "Am", lyric: "Verse line 1" }] },
  { time: 12, line: [{ chord: "F",  lyric: "Verse line 2" }] },
  { section: "Chorus" },
  { time: 16, line: [{ chord: "C",  lyric: "Chorus line 1" }] },
  { time: 20, line: [{ chord: "G",  lyric: "Chorus line 2" }] },
  // No further section — Chorus is the last section
];

// ─── findSectionBounds ────────────────────────────────────────────────────────

describe("findSectionBounds", () => {
  it("returns null for non-array lyrics", () => {
    expect(findSectionBounds(null, "Verse 1")).toBeNull();
    expect(findSectionBounds({},   "Verse 1")).toBeNull();
    expect(findSectionBounds("x",  "Verse 1")).toBeNull();
  });

  it("returns null for falsy sectionName", () => {
    expect(findSectionBounds(LYRICS, "")).toBeNull();
    expect(findSectionBounds(LYRICS, null)).toBeNull();
    expect(findSectionBounds(LYRICS, undefined)).toBeNull();
  });

  it("returns null for an unknown section name", () => {
    expect(findSectionBounds(LYRICS, "Bridge")).toBeNull();
    expect(findSectionBounds(LYRICS, "verse 1")).toBeNull(); // case-sensitive
  });

  it("returns correct bounds for a middle section (has next section)", () => {
    const bounds = findSectionBounds(LYRICS, "Verse 1");
    expect(bounds).not.toBeNull();
    expect(bounds.startTime).toBe(8);   // first line after "Verse 1"
    expect(bounds.endTime).toBe(16);    // first line of "Chorus"
  });

  it("returns correct bounds for the first section", () => {
    const bounds = findSectionBounds(LYRICS, "Intro");
    expect(bounds.startTime).toBe(0);
    expect(bounds.endTime).toBe(8); // first line of "Verse 1"
  });

  it("returns endTime=null for the last section", () => {
    const bounds = findSectionBounds(LYRICS, "Chorus");
    expect(bounds).not.toBeNull();
    expect(bounds.startTime).toBe(16);
    expect(bounds.endTime).toBeNull(); // last section — caller uses duration
  });

  it("trims whitespace from sectionName", () => {
    const bounds = findSectionBounds(LYRICS, "  Verse 1  ");
    expect(bounds).not.toBeNull();
    expect(bounds.startTime).toBe(8);
  });

  it("returns null when section has no line entries", () => {
    // Section label immediately followed by another section label (no lines in between)
    const lyrics = [
      { section: "Empty" },
      { section: "Full" },
      { time: 5, line: [{ chord: "C", lyric: "line" }] },
    ];
    expect(findSectionBounds(lyrics, "Empty")).toBeNull();
  });

  it("returns null for empty lyrics array", () => {
    expect(findSectionBounds([], "Verse 1")).toBeNull();
  });
});

// ─── normalizeABRange ─────────────────────────────────────────────────────────

describe("normalizeABRange", () => {
  it("returns { startTime: A, endTime: B } when A < B", () => {
    expect(normalizeABRange(3, 10)).toEqual({ startTime: 3, endTime: 10 });
  });

  it("swaps values when A > B (user marks B before A in time)", () => {
    expect(normalizeABRange(10, 3)).toEqual({ startTime: 3, endTime: 10 });
  });

  it("returns identical times when A === B", () => {
    expect(normalizeABRange(7, 7)).toEqual({ startTime: 7, endTime: 7 });
  });

  it("works with fractional seconds", () => {
    const result = normalizeABRange(12.5, 8.25);
    expect(result.startTime).toBe(8.25);
    expect(result.endTime).toBe(12.5);
  });
});

// ─── shouldSeekBack ───────────────────────────────────────────────────────────

describe("shouldSeekBack", () => {
  it("returns false when loopEnd is Infinity", () => {
    expect(shouldSeekBack(100, 0, Infinity)).toBe(false);
  });

  it("returns false when loopEnd is NaN", () => {
    expect(shouldSeekBack(5, 0, NaN)).toBe(false);
  });

  it("returns false when loopEnd is null", () => {
    expect(shouldSeekBack(5, 0, null)).toBe(false);
  });

  it("returns false when currentTime is before loopEnd", () => {
    expect(shouldSeekBack(9.9, 0, 10)).toBe(false);
  });

  it("returns true when currentTime equals loopEnd", () => {
    expect(shouldSeekBack(10, 0, 10)).toBe(true);
  });

  it("returns true when currentTime is past loopEnd", () => {
    expect(shouldSeekBack(10.5, 0, 10)).toBe(true);
  });

  it("ignores loopStart in the comparison", () => {
    // loopStart is provided for clarity/docs but not used in the check
    expect(shouldSeekBack(20, 15, 18)).toBe(true);
    expect(shouldSeekBack(17, 15, 18)).toBe(false);
  });
});

// ─── calcLoopMarkerPercents ───────────────────────────────────────────────────

describe("calcLoopMarkerPercents", () => {
  it("returns all zeros when duration is 0", () => {
    expect(calcLoopMarkerPercents(0, 0, 10)).toEqual({ aPercent: 0, bPercent: 0, regionWidth: 0 });
  });

  it("returns all zeros when duration is negative", () => {
    expect(calcLoopMarkerPercents(-5, 0, 10)).toEqual({ aPercent: 0, bPercent: 0, regionWidth: 0 });
  });

  it("calculates correct percents for mid-song range", () => {
    // duration=100, start=25, end=75 → aPercent=25, bPercent=75, regionWidth=50
    const result = calcLoopMarkerPercents(100, 25, 75);
    expect(result.aPercent).toBe(25);
    expect(result.bPercent).toBe(75);
    expect(result.regionWidth).toBe(50);
  });

  it("calculates percents for full song range", () => {
    const result = calcLoopMarkerPercents(200, 0, 200);
    expect(result.aPercent).toBe(0);
    expect(result.bPercent).toBe(100);
    expect(result.regionWidth).toBe(100);
  });

  it("clamps aPercent to 0 when startTime is negative", () => {
    const result = calcLoopMarkerPercents(100, -10, 50);
    expect(result.aPercent).toBe(0);
    expect(result.bPercent).toBe(50);
  });

  it("clamps bPercent to 100 when endTime exceeds duration", () => {
    const result = calcLoopMarkerPercents(100, 10, 120);
    expect(result.aPercent).toBe(10);
    expect(result.bPercent).toBe(100);
    expect(result.regionWidth).toBe(90);
  });

  it("regionWidth is 0 when start equals end", () => {
    const result = calcLoopMarkerPercents(100, 50, 50);
    expect(result.regionWidth).toBe(0);
  });

  it("works with non-integer durations", () => {
    // duration=240.5, start=60, end=120 → approx 24.95%, 49.9%
    const result = calcLoopMarkerPercents(240.5, 60, 120);
    expect(result.aPercent).toBeCloseTo(24.95, 1);
    expect(result.bPercent).toBeCloseTo(49.9,  1);
    expect(result.regionWidth).toBeCloseTo(24.95, 1);
  });
});
