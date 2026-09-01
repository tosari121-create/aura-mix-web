# AURA MIX Web — Ready for Netlify

ชุดโค้ดโปรเจกต์เว็บ AURA MIX ที่มาพร้อมกับ Netlify Function (YouTube API Backend) สมบูรณ์พร้อมนำไป Deploy บน Netlify ทันที

## โครงสร้างไฟล์
- `index.html` - หน้าเว็บ
- `app.js` - สคริปต์ควบคุม Player
- `styles.css` - ตกแต่งสไตล์
- `netlify.toml` - ไฟล์ตั้งค่าของ Netlify
- `netlify/functions/youtube-search.js` - API Backend (ตัวที่ต้องรันผ่าน Netlify)

## วิธีการนำขึ้นเว็บ (Deploy) ผ่าน Netlify & GitHub

1. แตกไฟล์ ZIP นี้ 
2. สร้าง Repository ใหม่ใน GitHub (ตั้งเป็น Public หรือ Private ก็ได้)
3. อัปโหลดไฟล์และโฟลเดอร์ทั้งหมด (รวมโฟลเดอร์ `netlify`) เข้าไปใน GitHub Repository
4. ล็อกอินเข้าใช้งาน **Netlify**
5. กดปุ่ม `Add new site` > `Import an existing project` 
6. เลือก GitHub และเลือก Repository ที่อัปโหลดโค้ดนี้ไว้
7. ในช่องตั้งค่าต่างๆ **ไม่ต้องแก้อะไรเลย** (Netlify จะอ่านจาก `netlify.toml` อัตโนมัติ) กดปุ่ม `Deploy` ได้เลย
8. เมื่อ Deploy เสร็จไปที่แท็บ **Site configuration** ของโปรเจกต์
9. เลือกเมนู **Environment variables** ทางซ้ายมือ
10. กด Add variable กำหนดค่าดังนี้:
    - **Key**: `YOUTUBE_API_KEY`
    - **Value**: `ใส่_API_KEY_ของคุณที่นี่` (ได้จาก Google Cloud Console)
11. กดปุ่มบันทึก
12. ไปที่เมนู **Deploys** (ด้านบนสุด) กดปุ่ม `Trigger deploy` > `Clear cache and deploy site`
13. รอจนบิลด์เสร็จ สามารถคลิกเปิดเว็บและใช้งานระบบค้นหาเพลงได้ทันที
