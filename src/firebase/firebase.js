// Firebase app bootstrap — single shared instance for the whole app.
//
// Loads the Firebase Web SDK as ES modules straight from the gstatic CDN,
// matching this project's no-bundler architecture (script.js is already a
// `type="module"` script, so these imports work natively in the browser).

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import { firebaseConfig } from "./firebase-config.js";

export const app  = initializeApp(firebaseConfig);
export const db   = getFirestore(app);
export const auth = getAuth(app);
