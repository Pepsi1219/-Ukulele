// One-time migration: local Lyrics/Chords/Notation JSON → Firestore.
//
// manifest.json and the audio/image folders (songs/, vocal/,
// "Letter Note Notation/") stay local — only the editable payloads move to
// Firestore, keyed by the song id from manifest.json. Idempotent — safe to
// re-run, overwrites existing docs with the local file contents.
//
// วิธีใช้:
//   1. Firebase console → ⚙️ Project settings → Service accounts
//      → Generate new private key → เซฟไฟล์ (เช่น serviceAccount.json)
//      ⚠️ ห้าม commit ไฟล์นี้ลง git
//   2. npm install --save-dev firebase-admin
//   3. node scripts/migrate-to-firebase.mjs path/to/serviceAccount.json
//
// หลังรันเสร็จ ตรวจใน Firebase console ว่าข้อมูลครบก่อนใช้งานจริง

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const keyPath = process.argv[2];
if (!keyPath) {
  console.error("Usage: node scripts/migrate-to-firebase.mjs <serviceAccount.json>");
  process.exit(1);
}

const admin = await import("firebase-admin").then(m => m.default);
const serviceAccount = JSON.parse(await readFile(keyPath, "utf8"));

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function readJsonIfExists(p) {
  if (!existsSync(p)) return null;
  const raw = await readFile(p, "utf8");
  if (!raw.trim()) return null; // tolerate empty files, same as the app's fetch().catch()
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`  ⚠ ${path.relative(ROOT, p)} มี JSON ไม่ถูกต้อง — ข้าม (${err.message})`);
    return null;
  }
}

const manifest = JSON.parse(await readFile(path.join(ROOT, "manifest.json"), "utf8"));
if (!Array.isArray(manifest.songs)) {
  console.error("manifest.json ต้องมี key ชื่อ songs เป็น Array");
  process.exit(1);
}

console.log(`พบ ${manifest.songs.length} เพลงใน manifest.json\n`);

for (let i = 0; i < manifest.songs.length; i++) {
  const id = manifest.songs[i].id;
  console.log(`[${i + 1}/${manifest.songs.length}] ${id}`);

  const lyrics   = await readJsonIfExists(path.join(ROOT, "Lyrics",   `${id}.json`));
  const chords   = await readJsonIfExists(path.join(ROOT, "Chords",   `${id}.json`));
  const notation = await readJsonIfExists(path.join(ROOT, "Notation", `${id}.json`));

  const writes = [];
  if (lyrics)   writes.push(["lyrics",   lyrics]);
  if (chords)   writes.push(["chords",   chords]);
  if (notation) writes.push(["notation", notation]);

  if (!writes.length) {
    console.warn(`  ⚠ ไม่พบไฟล์ Lyrics/Chords/Notation สำหรับ ${id} — ข้าม`);
    continue;
  }

  for (const [kind, data] of writes) {
    await db.doc(`songs/${id}/data/${kind}`).set({
      json: JSON.stringify(data),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`  ✓ ${kind}`);
  }
}

console.log("\nเสร็จสิ้น! ตรวจสอบข้อมูลใน Firebase console ได้เลย");
console.log("ขั้นต่อไป: เพิ่ม UID ของครูใน collection `admins` และ publish firestore.rules");
process.exit(0);
