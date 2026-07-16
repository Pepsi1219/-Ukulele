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

/** Checks whether a signed-in uid is on the teacher allowlist. */
async function isAdmin(uid) {
  try {
    const snap = await getDoc(doc(db, "admins", uid));
    return snap.exists();
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

/** Signs the current user out. */
export function signOutTeacher() {
  return signOut(auth);
}
