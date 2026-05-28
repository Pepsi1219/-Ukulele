// Tests for pure practice-log functions
import { describe, it, expect } from "vitest";
import {
  toggleFavoriteId,
  filterFavorites,
  addSession,
  aggregateBySong,
  recentSessions,
  totalSecInDays,
  formatLogDuration,
} from "../../src/utils/practiceLog.js";

// ─── toggleFavoriteId ─────────────────────────────────────────────────────────

describe("toggleFavoriteId", () => {
  it("adds an id that is not yet in the set", () => {
    const s = new Set(["a"]);
    const result = toggleFavoriteId(s, "b");
    expect(result.has("b")).toBe(true);
    expect(result.has("a")).toBe(true);
  });

  it("removes an id that is already in the set", () => {
    const s = new Set(["a", "b"]);
    const result = toggleFavoriteId(s, "a");
    expect(result.has("a")).toBe(false);
    expect(result.has("b")).toBe(true);
  });

  it("works on an empty set", () => {
    const result = toggleFavoriteId(new Set(), "x");
    expect(result.has("x")).toBe(true);
    expect(result.size).toBe(1);
  });

  it("is pure — does not mutate the input set", () => {
    const s = new Set(["a"]);
    toggleFavoriteId(s, "a");
    expect(s.has("a")).toBe(true);  // original unchanged
  });

  it("returns a new Set instance", () => {
    const s = new Set(["a"]);
    const result = toggleFavoriteId(s, "b");
    expect(result).not.toBe(s);
  });
});

// ─── filterFavorites ──────────────────────────────────────────────────────────

const SONGS = [
  { id: "s1", title: "Song 1" },
  { id: "s2", title: "Song 2" },
  { id: "s3", title: "Song 3" },
];

describe("filterFavorites", () => {
  it("returns only songs whose id is in the favorites set", () => {
    const result = filterFavorites(SONGS, new Set(["s1", "s3"]));
    expect(result.map(s => s.id)).toEqual(["s1", "s3"]);
  });

  it("accepts an array for favoriteIds", () => {
    const result = filterFavorites(SONGS, ["s2"]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("s2");
  });

  it("returns [] when no songs match", () => {
    expect(filterFavorites(SONGS, new Set(["unknown"]))).toEqual([]);
  });

  it("returns [] for non-array songs input", () => {
    expect(filterFavorites(null, new Set(["s1"]))).toEqual([]);
  });

  it("returns [] when favorites set is empty", () => {
    expect(filterFavorites(SONGS, new Set())).toEqual([]);
  });
});

// ─── addSession ───────────────────────────────────────────────────────────────

const SESSION_A = { songId: "s1", songTitle: "Song 1", date: "2026-05-28", durationSec: 120 };
const SESSION_B = { songId: "s2", songTitle: "Song 2", date: "2026-05-27", durationSec: 60  };

describe("addSession", () => {
  it("appends a session to the log", () => {
    const result = addSession([SESSION_B], SESSION_A);
    expect(result).toHaveLength(2);
    expect(result[1].songId).toBe("s1");
  });

  it("creates a new array when log is null/non-array", () => {
    expect(addSession(null, SESSION_A)).toEqual([SESSION_A]);
  });

  it("ignores sessions with durationSec <= 0", () => {
    const bad = { ...SESSION_A, durationSec: 0 };
    expect(addSession([], bad)).toEqual([]);
  });

  it("ignores null/undefined session", () => {
    expect(addSession([SESSION_A], null)).toEqual([SESSION_A]);
  });

  it("is pure — does not mutate the input log", () => {
    const log  = [SESSION_B];
    const copy = JSON.stringify(log);
    addSession(log, SESSION_A);
    expect(JSON.stringify(log)).toBe(copy);
  });
});

// ─── aggregateBySong ──────────────────────────────────────────────────────────

const LOG = [
  { songId: "s1", songTitle: "Alpha", date: "2026-05-20", durationSec: 60  },
  { songId: "s2", songTitle: "Beta",  date: "2026-05-21", durationSec: 180 },
  { songId: "s1", songTitle: "Alpha", date: "2026-05-28", durationSec: 90  },
  { songId: "s2", songTitle: "Beta",  date: "2026-05-22", durationSec: 30  },
];

describe("aggregateBySong", () => {
  it("returns [] for non-array input", () => {
    expect(aggregateBySong(null)).toEqual([]);
  });

  it("sums durationSec per song", () => {
    const result = aggregateBySong(LOG);
    const s1 = result.find(r => r.songId === "s1");
    const s2 = result.find(r => r.songId === "s2");
    expect(s1.totalSec).toBe(150);
    expect(s2.totalSec).toBe(210);
  });

  it("counts sessions per song", () => {
    const result = aggregateBySong(LOG);
    expect(result.find(r => r.songId === "s1").sessionCount).toBe(2);
    expect(result.find(r => r.songId === "s2").sessionCount).toBe(2);
  });

  it("tracks the latest date per song", () => {
    const result = aggregateBySong(LOG);
    expect(result.find(r => r.songId === "s1").lastDate).toBe("2026-05-28");
    expect(result.find(r => r.songId === "s2").lastDate).toBe("2026-05-22");
  });

  it("sorts by totalSec descending", () => {
    const result = aggregateBySong(LOG);
    expect(result[0].songId).toBe("s2");  // 210s
    expect(result[1].songId).toBe("s1");  // 150s
  });

  it("is pure — does not mutate the input", () => {
    const copy = JSON.stringify(LOG);
    aggregateBySong(LOG);
    expect(JSON.stringify(LOG)).toBe(copy);
  });
});

// ─── recentSessions ───────────────────────────────────────────────────────────

describe("recentSessions", () => {
  it("returns [] for non-array input", () => {
    expect(recentSessions(null)).toEqual([]);
  });

  it("returns sessions in reverse order (newest first)", () => {
    const result = recentSessions(LOG);
    expect(result[0].date).toBe("2026-05-22");  // last in array → first in result
    expect(result[result.length - 1].date).toBe("2026-05-20");
  });

  it("limits to n sessions", () => {
    expect(recentSessions(LOG, 2)).toHaveLength(2);
  });

  it("default n=30 doesn't truncate short log", () => {
    expect(recentSessions(LOG)).toHaveLength(4);
  });

  it("is pure — does not mutate the input", () => {
    const copy = JSON.stringify(LOG);
    recentSessions(LOG);
    expect(JSON.stringify(LOG)).toBe(copy);
  });
});

// ─── totalSecInDays ───────────────────────────────────────────────────────────

describe("totalSecInDays", () => {
  it("returns 0 for non-array log", () => {
    expect(totalSecInDays(null, "2026-05-28")).toBe(0);
  });

  it("sums seconds within the window", () => {
    // LOG entries: 2026-05-20(60), 05-21(180), 05-28(90), 05-22(30)
    // 7 days from 2026-05-28 → cutoff = 2026-05-22
    const result = totalSecInDays(LOG, "2026-05-28", 7);
    expect(result).toBe(90 + 30);  // only 05-28 and 05-22 are within 7 days
  });

  it("returns 0 when no sessions fall in the window", () => {
    expect(totalSecInDays(LOG, "2026-01-01", 7)).toBe(0);
  });

  it("includes sessions exactly on the cutoff date", () => {
    // window 1 day → only today (2026-05-28)
    expect(totalSecInDays(LOG, "2026-05-28", 1)).toBe(90);
  });
});

// ─── formatLogDuration ────────────────────────────────────────────────────────

describe("formatLogDuration", () => {
  it("formats seconds only", () => {
    expect(formatLogDuration(45)).toBe("45 วินาที");
  });

  it("formats minutes and seconds", () => {
    expect(formatLogDuration(90)).toBe("1 นาที 30 วินาที");
  });

  it("formats hours and minutes", () => {
    expect(formatLogDuration(3670)).toBe("1 ชม. 01 นาที");
  });

  it("handles 0", () => {
    expect(formatLogDuration(0)).toBe("0 วินาที");
  });

  it("rounds to nearest second", () => {
    expect(formatLogDuration(90.7)).toBe("1 นาที 31 วินาที");
  });
});
