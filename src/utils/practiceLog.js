/**
 * practiceLog.js — Pure functions for Practice Log and Favorites.
 *
 * Session shape:
 *   { songId: string, songTitle: string, date: string (YYYY-MM-DD), durationSec: number }
 *
 * Aggregated shape:
 *   { songId, songTitle, totalSec, lastDate, sessionCount }
 */

// ─── Favorites ────────────────────────────────────────────────────────────────

/**
 * Toggles a song ID inside a favorites Set.
 * Pure — returns a new Set, never mutates the input.
 *
 * @param {Set}    favorites  current favorites Set
 * @param {string} id         song ID to toggle
 * @returns {Set}
 */
export function toggleFavoriteId(favorites, id) {
  const next = new Set(favorites);
  if (next.has(id)) next.delete(id);
  else              next.add(id);
  return next;
}

/**
 * Filters a songs array to only include songs whose `id` is in `favoriteIds`.
 *
 * @param {Array}      songs        full song list
 * @param {Set|Array}  favoriteIds  Set or array of IDs to keep
 * @returns {Array}
 */
export function filterFavorites(songs, favoriteIds) {
  if (!Array.isArray(songs)) return [];
  const set = favoriteIds instanceof Set ? favoriteIds : new Set(favoriteIds);
  return songs.filter(s => s && set.has(s.id));
}

// ─── Practice Sessions ────────────────────────────────────────────────────────

/**
 * Appends a new session to the log array.
 * Ignores sessions with durationSec <= 0.
 * Pure / immutable.
 *
 * @param {Array}  log      existing sessions array
 * @param {Object} session  { songId, songTitle, date, durationSec }
 * @returns {Array}
 */
export function addSession(log, session) {
  if (!Array.isArray(log)) return session && session.durationSec > 0 ? [session] : [];
  if (!session || session.durationSec <= 0) return log;
  return [...log, session];
}

/**
 * Aggregates practice time per song.
 * Returns an array sorted by totalSec descending (most-practised first).
 *
 * Each entry: { songId, songTitle, totalSec, lastDate, sessionCount }
 *
 * @param {Array} log
 * @returns {Array}
 */
export function aggregateBySong(log) {
  if (!Array.isArray(log)) return [];

  const map = {};
  log.forEach(s => {
    if (!s || !s.songId) return;
    if (!map[s.songId]) {
      map[s.songId] = {
        songId:       s.songId,
        songTitle:    s.songTitle || s.songId,
        totalSec:     0,
        lastDate:     s.date || "",
        sessionCount: 0,
      };
    }
    const entry = map[s.songId];
    entry.totalSec     += Number(s.durationSec) || 0;
    entry.sessionCount += 1;
    if ((s.date || "") > entry.lastDate) entry.lastDate = s.date;
  });

  return Object.values(map).sort((a, b) => b.totalSec - a.totalSec);
}

/**
 * Returns the N most-recent sessions (newest first).
 *
 * @param {Array}  log
 * @param {number} n   default 30
 * @returns {Array}
 */
export function recentSessions(log, n = 30) {
  if (!Array.isArray(log)) return [];
  return [...log].reverse().slice(0, n);
}

/**
 * Calculates total practice seconds for sessions within `days` days of `today`.
 *
 * @param {Array}  log
 * @param {string} today  ISO date string "YYYY-MM-DD"
 * @param {number} days   default 7
 * @returns {number}  seconds
 */
export function totalSecInDays(log, today, days = 7) {
  if (!Array.isArray(log) || !today) return 0;
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - (days - 1));
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return log
    .filter(s => s && s.date >= cutoffStr && s.date <= today)
    .reduce((sum, s) => sum + (Number(s.durationSec) || 0), 0);
}

/**
 * Formats a duration in seconds as "HH:MM:SS" (omits hours when < 3600).
 * Designed for the practice log display (different from formatTime).
 *
 * @param {number} totalSec
 * @returns {string}
 */
export function formatLogDuration(totalSec) {
  const s   = Math.round(Math.max(0, totalSec));
  const h   = Math.floor(s / 3600);
  const m   = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h} ชม. ${String(m).padStart(2, "0")} นาที`;
  }
  if (m > 0) {
    return `${m} นาที ${String(sec).padStart(2, "0")} วินาที`;
  }
  return `${sec} วินาที`;
}
