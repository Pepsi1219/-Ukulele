// Firebase project configuration.
//
// วิธีเอาค่า config:
//   1. เปิด https://console.firebase.google.com → เลือกโปรเจกต์
//   2. ⚙️ Project settings → General → เลื่อนลงไปที่ "Your apps"
//   3. ถ้ายังไม่มี Web app ให้กด "</>" (Add app) → ตั้งชื่อ → Register
//   4. คัดลอกค่าใน firebaseConfig มาวางแทนที่ด้านล่างนี้
//
// หมายเหตุ: ค่าเหล่านี้ไม่ใช่ความลับ (ปรากฏใน client ทุกตัวอยู่แล้ว) —
// ความปลอดภัยจริงอยู่ที่ Firestore/Storage security rules

export const firebaseConfig = {
  apiKey:            "AIzaSyCEF7HPUzLqvKdQVNLgU30Wglsj1TLQ-Wo",
  authDomain:        "ukulele-pepsi.firebaseapp.com",
  projectId:         "ukulele-pepsi",
  storageBucket:     "ukulele-pepsi.firebasestorage.app",
  messagingSenderId: "592946421555",
  appId:             "1:592946421555:web:53f55dd596d0ed5ccfa846",
};
