import { describe, it, expect } from "vitest";
import { buildSong } from "../../src/utils/songBuilder.js";

const baseMeta = {
  id:    "test-song",
  title: "Test Song",
  mp3:   "songs/test.mp3",
  bpm:   120,
};

describe("buildSong", () => {
  it("builds a song object with all expected keys", () => {
    const song = buildSong(baseMeta, [], []);
    expect(song).toHaveProperty("id");
    expect(song).toHaveProperty("title");
    expect(song).toHaveProperty("mp3");
    expect(song).toHaveProperty("bpm");
    expect(song).toHaveProperty("lyrics");
    expect(song).toHaveProperty("chords");
  });

  it("preserves metadata fields from the manifest entry", () => {
    const song = buildSong(baseMeta, [], []);
    expect(song.id).toBe("test-song");
    expect(song.title).toBe("Test Song");
    expect(song.mp3).toBe("songs/test.mp3");
    expect(song.bpm).toBe(120);
  });

  it("uses the explicit chords array when provided", () => {
    const chords = [{ time: 0, chord: "C" }, { time: 5, chord: "Am" }];
    const song = buildSong(baseMeta, [], chords);
    expect(song.chords).toEqual(chords);
  });

  it("falls back to building chords from lyrics when chordsArr is null", () => {
    const lyrics = [{ time: 0, line: [{ chord: "G", lyric: "hello" }] }];
    const song = buildSong(baseMeta, lyrics, null);
    expect(song.chords).toEqual([{ time: 0, chord: "G" }]);
  });

  it("filters out explicit chords with empty chord name", () => {
    const chords = [
      { time: 0, chord: "C" },
      { time: 5, chord: "" },
    ];
    const song = buildSong(baseMeta, [], chords);
    expect(song.chords).toHaveLength(1);
    expect(song.chords[0].chord).toBe("C");
  });

  it("filters out explicit chords with non-finite time", () => {
    const chords = [
      { time: 0,   chord: "C" },
      { time: NaN, chord: "Am" },
    ];
    const song = buildSong(baseMeta, [], chords);
    expect(song.chords).toHaveLength(1);
  });

  it("sorts explicit chords by time ascending", () => {
    const chords = [
      { time: 10, chord: "Am" },
      { time: 0,  chord: "C"  },
    ];
    const song = buildSong(baseMeta, [], chords);
    expect(song.chords[0].chord).toBe("C");
    expect(song.chords[1].chord).toBe("Am");
  });

  it("defaults missing meta fields gracefully", () => {
    const song = buildSong({}, [], []);
    expect(song.title).toBe("Untitled Song");
    expect(song.bpm).toBe(100);
    expect(song.mp3).toBe("");
    expect(typeof song.id).toBe("string");
    expect(song.id.length).toBeGreaterThan(0);
  });

  it("treats null lyricsArr as an empty array", () => {
    const song = buildSong(baseMeta, null, []);
    expect(song.lyrics).toEqual([]);
  });

  it("treats null chordsArr as 'derive from lyrics'", () => {
    const lyrics = [{ time: 2, line: [{ chord: "Dm", lyric: "" }] }];
    const song = buildSong(baseMeta, lyrics, null);
    expect(song.chords[0].chord).toBe("Dm");
  });

  it("generates a unique id when meta.id is missing", () => {
    const song1 = buildSong({}, [], []);
    const song2 = buildSong({}, [], []);
    expect(song1.id).not.toBe(song2.id);
  });

  it("converts bpm string to number", () => {
    const song = buildSong({ ...baseMeta, bpm: "98" }, [], []);
    expect(song.bpm).toBe(98);
  });

  it("defaults notation to null when not provided", () => {
    const song = buildSong(baseMeta, [], []);
    expect(song.notation).toBeNull();
  });

  it("keeps a notation object that has notes", () => {
    const notation = { config: { key: "C" }, notes: [{ pitch: "A4", dur: "quarter" }] };
    const song = buildSong(baseMeta, [], [], notation);
    expect(song.notation).toBe(notation);
  });

  it("drops a notation object with no notes", () => {
    const song = buildSong(baseMeta, [], [], { config: {}, notes: [] });
    expect(song.notation).toBeNull();
  });
});
