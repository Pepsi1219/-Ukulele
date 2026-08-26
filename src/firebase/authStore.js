// Teacher authentication — Google Sign-In + admin allowlist.
//
// Everyone can read songs without logging in. Editing requires signing in
// with a Google account whose uid exists in the `admins` collection:
//
//   admins/{uid} → { email }   ← เพิ่มครูด้วยมือใน Firebase console
//
// วิธีเพิ่มครู: ให้ครูล็อกอินครั้งแรก (จะยังไม่มีสิทธิ์) → เปิด Firebase console
// → Authentication → Users → คัดลอก UID → สร้าง document ใน collection
// `admins` โดยใช้ UID นั้นเป็น document ID

import {
  GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc, getDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { auth, db } from "./firebase.js";

/**
 * Cache key for a uid's teacher-flag decision. TTL keeps a stale entry
 * from surviving forever — mostly so a demoted admin doesn't keep teacher
 * UI for weeks. 24h is a reasonable balance (teacher status rarely
 * changes; if it does, a session restart clears it anyway).
 */
const ADMIN_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const ADMIN_CACHE_PREFIX = "uke-admin:";

/**
 * Checks whether a signed-in uid is on the teacher allowlist.
 * Cached in sessionStorage per uid so a re-visit or an observeAuth
 * re-fire skips the Firestore round-trip (previously visible as a
 * multi-second delay after Google login on mobile 4G).
 */
async function isAdmin(uid) {
  // Fast path: cached decision still within TTL
  try {
    const raw = sessionStorage.getItem(ADMIN_CACHE_PREFIX + uid);
    if (raw) {
      const { v, t } = JSON.parse(raw);
      if (Date.now() - t < ADMIN_CACHE_TTL_MS) return !!v;
    }
  } catch { /* sessionStorage may throw in private mode — fall through */ }

  try {
    const snap = await getDoc(doc(db, "admins", uid));
    const v = snap.exists();
    try {
      sessionStorage.setItem(ADMIN_CACHE_PREFIX + uid,
        JSON.stringify({ v, t: Date.now() }));
    } catch { /* ignore quota / private mode */ }
    return v;
  } catch {
    return false;
  }
}

/**
 * Subscribes to auth state. `onChange` receives:
 *   { user: null }                          — signed out
 *   { user, isTeacher: boolean }            — signed in
 * Returns the unsubscribe function.
 */
export function observeAuth(onChange) {
  return onAuthStateChanged(auth, async user => {
    if (!user) {
      onChange({ user: null, isTeacher: false });
      return;
    }
    const teacher = await isAdmin(user.uid);
    onChange({ user, isTeacher: teacher });
  });
}

/** Opens the Google sign-in popup. Throws on failure/cancel. */
export function signInTeacher() {
  return signInWithPopup(auth, new GoogleAuthProvider());
}

/** Signs the current user out. Also purges cached admin decisions so a
 *  re-sign-in (possibly as a different user) always re-checks Firestore. */
export function signOutTeacher() {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(ADMIN_CACHE_PREFIX)) sessionStorage.removeItem(k);
    }
  } catch { /* ignore */ }
  return signOut(auth);
}
