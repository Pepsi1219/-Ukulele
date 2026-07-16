# คู่มือติดตั้ง Firebase (ทำครั้งเดียว)

แอพยังเสิร์ฟ `manifest.json` และไฟล์เสียง/รูป (`songs/`, `vocal/`, `Letter Note Notation/`) จาก repo เหมือนเดิม — **ไม่ใช้ Firebase Storage** (หลีกเลี่ยงการต้องอัพเกรดเป็นแผน Blaze) ส่วนที่ย้ายขึ้น cloud คือข้อมูลที่แก้ไขบ่อย: **Lyrics, Chords, Notation**

## 1. เปิดใช้บริการใน Firebase Console

เปิด [console.firebase.google.com](https://console.firebase.google.com) → เลือกโปรเจกต์ แล้ว:

1. **Firestore Database** → Create database → เลือก region ใกล้ไทย (เช่น `asia-southeast1`) → Start in production mode
2. **Authentication** → Get started → Sign-in method → เปิด **Google**

(ไม่ต้องเปิด Storage)

## 2. ใส่ค่า config ลงแอพ

1. ⚙️ Project settings → General → Your apps → กด **`</>`** (Add web app) ถ้ายังไม่มี
2. คัดลอกค่า `firebaseConfig` มาวางใน [src/firebase/firebase-config.js](src/firebase/firebase-config.js)

## 3. Publish Security Rules

Firestore Database → Rules → วางเนื้อหาจากไฟล์ [firestore.rules](firestore.rules) → Publish

## 4. ย้ายข้อมูลขึ้น Cloud (migration)

```bash
# 4.1 ดาวน์โหลด service account key:
#     ⚙️ Project settings → Service accounts → Generate new private key
#     เซฟเป็น serviceAccount.json ที่ root ของโปรเจกต์ (git ignore ให้แล้ว)

# 4.2 ติดตั้ง firebase-admin แล้วรัน migration
npm install --save-dev firebase-admin
node scripts/migrate-to-firebase.mjs serviceAccount.json
```

สคริปต์จะอ่าน `manifest.json` แล้วอัพโหลดเนื้อหาของ `Lyrics/<id>.json`, `Chords/<id>.json`, `Notation/<id>.json` ขึ้น Firestore ทีละเพลง (ไฟล์เสียง/รูปไม่ถูกแตะต้อง) รันซ้ำได้ — เขียนทับด้วยข้อมูลจากไฟล์ local เสมอ

## 5. เพิ่มสิทธิ์ครู

1. เปิดแอพ → กดปุ่ม 👤 มุมขวาบน → ล็อกอินด้วย Google
2. Firebase console → Authentication → Users → คัดลอก **User UID**
3. Firestore Database → Start collection ชื่อ `admins`
   → Document ID = UID ที่คัดลอกมา → ใส่ field `email` = อีเมลครู
4. รีเฟรชแอพ → ไอคอนคนจะเป็นสีเขียว → ปุ่ม Editor และปุ่ม "บันทึกขึ้น Cloud" จะปรากฏ

## การใช้งานหลัง setup

- **นักเรียน** — เปิดแอพใช้ได้เลย ไม่ต้องล็อกอิน (อ่านอย่างเดียว) — การเล่นเพลงของนักเรียนจะถูกบันทึกลง Practice Log แบบไม่ระบุตัวตนโดยอัตโนมัติ
- **ครู** — ล็อกอินแล้วเปิด Editor แก้เนื้อร้อง/คอร์ด/โน้ต → กด **บันทึกขึ้น Cloud** ข้อมูลเข้า Firestore ทันที ไม่ต้อง Copy JSON วางไฟล์อีกต่อไป
- **Practice History** (ปุ่ม 📊 มุมขวาบน) — มองเห็นได้เฉพาะครูที่ล็อกอินแล้ว เป็น log รวมของทุกคน/ทุกเครื่อง (ไม่แยกรายนักเรียน) เก็บข้อมูลย้อนหลัง 90 วัน แล้วลบข้อมูลเก่าให้อัตโนมัติทุกครั้งที่ครูเปิดหน้านี้ — ถ้าข้อมูลพุ่งเกิน 2,000 รายการ (ผิดปกติ) ระบบจะล้างทั้งหมดทันทีแทนการทยอยลบ ปรับค่าได้ที่ `RETENTION_DAYS`/`MAX_DOCS` ใน [src/firebase/practiceLogStore.js](src/firebase/practiceLogStore.js)

> ⚠️ ถ้าเคย publish `firestore.rules` ไปแล้วก่อนที่ Practice Log จะถูกเพิ่มเข้ามา ต้องกลับไปทำ**ขั้นตอนที่ 3 ซ้ำอีกครั้ง**เพื่ออัพเดต rules ให้รองรับ `practiceLog` collection ไม่งั้นการบันทึก/อ่านประวัติจะถูกปฏิเสธ
- **เพิ่มเพลงใหม่** — ยังต้องเพิ่ม entry ใน `manifest.json` + วางไฟล์ mp3/รูปใน repo เหมือนเดิม (ขั้นตอนนี้ไม่เปลี่ยน) จากนั้นค่อยใช้ Editor ในแอพเพื่อกรอกเนื้อร้อง/คอร์ด/โน้ตแล้วบันทึกขึ้น Cloud
- เมื่อยืนยันว่าข้อมูล Lyrics/Chords/Notation บน cloud ครบถ้วนแล้ว สามารถลบโฟลเดอร์ `Lyrics/ Chords/ Notation/` ออกจาก repo ได้ (เก็บไว้เป็น backup ก็ได้เช่นกัน) — `manifest.json`, `songs/`, `vocal/`, `Letter Note Notation/` ยังต้องอยู่เสมอ
