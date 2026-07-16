// Practice log data access layer — a single shared, class-wide log of
// practice sessions across all students/devices (no per-student identity —
// students never sign in). Anyone can log a session; only teachers can
// read or prune it (see firestore.rules). The teacher-only "Practice
// History" panel is the sole consumer of fetch/prune/clear.
//
// Firestore data model:
//   practiceLog/{autoId} → { songId, songTitle, date: "YYYY-MM-DD", durationSec, createdAt }

import {
  collection, addDoc, getDocs, doc, writeBatch, serverTimestamp, query, orderBy,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase.js";

const COLLECTION = "practiceLog";

// Retention policy: keep the rolling last 3 months of sessions. If the
// collection ever balloons past MAX_DOCS (e.g. retention pruning didn't
// run for a long stretch, or a burst of activity), wipe it entirely
// instead of trimming incrementally — simpler and bounds worst-case cost.
export const RETENTION_DAYS = 90;
export const MAX_DOCS = 2000;

// Firestore batched writes are capped at 500 ops; stay comfortably under.
const BATCH_CHUNK = 450;

/**
 * Logs one practice session. Callable by anyone, including signed-out
 * students — no auth required (see firestore.rules `isValidPracticeSession`).
 * Errors are the caller's responsibility to handle (fire-and-forget from script.js).
 *
 * @param {{ songId: string, songTitle: string, date: string, durationSec: number }} session
 */
export async function logSession(session) {
  await addDoc(collection(db, COLLECTION), {
    songId:      session.songId,
    songTitle:   session.songTitle,
    date:        session.date,
    durationSec: session.durationSec,
    createdAt:   serverTimestamp(),
  });
}

/**
 * Fetches every practice session, oldest first. Teacher-only (enforced by
 * firestore.rules) — call only from the Practice History panel.
 *
 * @returns {Promise<Array<{id, songId, songTitle, date, durationSec}>>}
 */
export async function fetchAllSessions() {
  const q = query(collection(db, COLLECTION), orderBy("date"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function deleteIds(ids) {
  for (let i = 0; i < ids.length; i += BATCH_CHUNK) {
    const batch = writeBatch(db);
    ids.slice(i, i + BATCH_CHUNK).forEach(id => batch.delete(doc(db, COLLECTION, id)));
    await batch.commit();
  }
}

/**
 * Applies the retention policy to an already-fetched session list:
 * wipes everything if the collection exceeds MAX_DOCS, otherwise deletes
 * sessions older than RETENTION_DAYS. Teacher-only.
 *
 * @param {Array<{id, date}>} sessions  result of fetchAllSessions()
 * @returns {Promise<{ deleted: number, reset: boolean }>}
 */
export async function prunePracticeLog(sessions) {
  if (!Array.isArray(sessions) || !sessions.length) return { deleted: 0, reset: false };

  if (sessions.length > MAX_DOCS) {
    await deleteIds(sessions.map(s => s.id));
    return { deleted: sessions.length, reset: true };
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const staleIds = sessions.filter(s => s.date && s.date < cutoffStr).map(s => s.id);
  if (!staleIds.length) return { deleted: 0, reset: false };

  await deleteIds(staleIds);
  return { deleted: staleIds.length, reset: false };
}

/**
 * Deletes every practice session. Teacher-only — the manual "ล้างประวัติทั้งหมด" button.
 *
 * @param {Array<{id}>} sessions  result of fetchAllSessions()
 */
export async function clearAllSessions(sessions) {
  if (!Array.isArray(sessions) || !sessions.length) return;
  await deleteIds(sessions.map(s => s.id));
}
