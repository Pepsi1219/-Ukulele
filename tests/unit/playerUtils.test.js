import { describe, it, expect } from "vitest";
import { getMp3PathFor } from "../../src/utils/playerUtils.js";

const song = { mp3: "songs/lenka-the-show.mp3" };

describe("getMp3PathFor", () => {
  it('returns the original path when audioMode is "song"', () => {
    expect(getMp3PathFor(song, "song")).toBe("songs/lenka-the-show.mp3");
  });

  it('swaps prefix to "vocal/" when audioMode is "vocal"', () => {
    expect(getMp3PathFor(song, "vocal")).toBe("vocal/lenka-the-show.mp3");
  });

  it("returns the original path when audioMode is null", () => {
    expect(getMp3PathFor(song, null)).toBe("songs/lenka-the-show.mp3");
  });

  it("returns the original path unchanged when audioMode is undefined", () => {
    expect(getMp3PathFor(song, undefined)).toBe("songs/lenka-the-show.mp3");
  });

  it('returns original path (no swap) when mp3 does not start with "songs/"', () => {
    const weirdSong = { mp3: "other/file.mp3" };
    expect(getMp3PathFor(weirdSong, "vocal")).toBe("other/file.mp3");
  });

  it('is case-insensitive when checking the "songs/" prefix', () => {
    const upperSong = { mp3: "Songs/file.mp3" };
    expect(getMp3PathFor(upperSong, "vocal")).toBe("vocal/file.mp3");
  });

  it("preserves the filename after prefix swap", () => {
    const s = { mp3: "songs/pink-sweats-at-my-worst.mp3" };
    expect(getMp3PathFor(s, "vocal")).toBe("vocal/pink-sweats-at-my-worst.mp3");
  });
});
