import { describe, it, expect } from "vitest";
import {
  buildChordsFromLyrics,
  findCurrentTimedIndex,
} from "../../src/utils/chordEngine.js";

// ─── buildChordsFromLyrics ───────────────────────────────────────────────────

describe("buildChordsFromLyrics", () => {
  it("returns empty array for empty input", () => {
    expect(buildChordsFromLyrics([])).toEqual([]);
  });

  it("extracts the first chord from each line", () => {
    const lyrics = [
      { time: 0,  line: [{ chord: "C",  lyric: "Hello" }] },
      { time: 5,  line: [{ chord: "Am", lyric: "World" }] },
    ];
    expect(buildChordsFromLyrics(lyrics)).toEqual([
      { time: 0, chord: "C" },
      { time: 5, chord: "Am" },
    ]);
  });

  it("skips section entries that have no line array", () => {
    const lyrics = [
      { time: 0, section: "Intro" },
      { time: 2, line: [{ chord: "G", lyric: "test" }] },
    ];
    const result = buildChordsFromLyrics(lyrics);
    expect(result).toHaveLength(1);
    expect(result[0].chord).toBe("G");
  });

  it("skips lines where no segment has a chord", () => {
    const lyrics = [{ time: 0, line: [{ lyric: "no chord here" }] }];
    expect(buildChordsFromLyrics(lyrics)).toEqual([]);
  });

  it("takes only the first chord segment per line (not subsequent chords)", () => {
    const lyrics = [
      { time: 0, line: [{ chord: "C", lyric: "a" }, { chord: "Am", lyric: "b" }] },
    ];
    expect(buildChordsFromLyrics(lyrics)).toEqual([{ time: 0, chord: "C" }]);
  });

  it("sorts chords by time ascending when input is unordered", () => {
    const lyrics = [
      { time: 10, line: [{ chord: "Am", lyric: "" }] },
      { time: 2,  line: [{ chord: "C",  lyric: "" }] },
    ];
    const result = buildChordsFromLyrics(lyrics);
    expect(result[0]).toEqual({ time: 2,  chord: "C" });
    expect(result[1]).toEqual({ time: 10, chord: "Am" });
  });

  it("converts time values to numbers", () => {
    const lyrics = [{ time: "4.5", line: [{ chord: "F", lyric: "" }] }];
    const result = buildChordsFromLyrics(lyrics);
    expect(typeof result[0].time).toBe("number");
    expect(result[0].time).toBe(4.5);
  });
});

// ─── findCurrentTimedIndex ───────────────────────────────────────────────────

describe("findCurrentTimedIndex", () => {
  const items = [
    { time: 0  },
    { time: 5  },
    { time: 10 },
    { time: 15 },
  ];

  it("returns -1 for an empty array", () => {
    expect(findCurrentTimedIndex([], 5)).toBe(-1);
  });

  it("returns -1 when currentSeconds is before the first item", () => {
    expect(findCurrentTimedIndex(items, -1)).toBe(-1);
  });

  it("returns 0 at exactly the first item time", () => {
    expect(findCurrentTimedIndex(items, 0)).toBe(0);
  });

  it("returns the correct index between two items", () => {
    expect(findCurrentTimedIndex(items, 7)).toBe(1); // between 5 and 10
  });

  it("returns correct index at an exact boundary", () => {
    expect(findCurrentTimedIndex(items, 10)).toBe(2);
  });

  it("returns the last index when currentSeconds is beyond the end", () => {
    expect(findCurrentTimedIndex(items, 999)).toBe(3);
  });

  it("handles a single-item array correctly", () => {
    expect(findCurrentTimedIndex([{ time: 3 }], 3)).toBe(0);
    expect(findCurrentTimedIndex([{ time: 3 }], 2)).toBe(-1);
  });
});
