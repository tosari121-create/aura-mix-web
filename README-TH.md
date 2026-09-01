# AURA MIX Web — Netlify (เวอร์ชันแก้ค้นหา)

## สำคัญ
เว็บนี้ใช้ Netlify Function สำหรับค้นหา YouTube ดังนั้น **อย่าใช้ Netlify Drop/Drag & Drop ถ้าต้องการให้ Function ทำงาน** ให้ Deploy ผ่าน GitHub integration หรือ Netlify CLI แทน เพราะ Functions ต้องถูก build/deploy โดย Netlify

## วิธีง่ายที่สุด: GitHub
1. สร้าง repository ใหม่บน GitHub เช่น `aura-mix-web`
2. อัปโหลดไฟล์ทั้งหมดในโฟลเดอร์นี้ขึ้น GitHub โดยให้ `index.html` อยู่ที่ root
3. ใน Netlify กด `Add new project` → `Import an existing project` → `GitHub`
4. เลือก repository `aura-mix-web`
5. Build command: เว้นว่าง
6. Publish directory: `.`
7. Deploy
8. ไปที่ Project configuration → Environment variables → Add variable
   - Key: `YOUTUBE_API_KEY`
   - Value: YouTube Data API v3 key ของคุณ
   - Scope ต้องรวม Functions ถ้า Netlify แสดงตัวเลือก scope
9. Deploy ใหม่อีกครั้ง
10. เปิดเว็บและค้นหาเพลง

## วิธี CLI
ในโฟลเดอร์นี้:

```bash
npm install -g netlify-cli
netlify login
netlify init
netlify deploy --prod
```

ตอน `netlify init` ให้เลือกไซต์ที่ต้องการ และใช้ `.` เป็น publish directory กับ `netlify/functions` เป็น functions directory ถ้าถาม

ตั้ง API key:

```bash
netlify env:set YOUTUBE_API_KEY "ใส่_API_KEY_ของคุณ" --scope functions
```

จากนั้น deploy ใหม่:

```bash
netlify deploy --prod
```

## ตรวจ Function
เมื่อ deploy แล้ว เปิด:

`https://ชื่อเว็บ.netlify.app/.netlify/functions/youtube-search?q=เบิร์ด+ธงไชย&max=5`

ถ้าได้ JSON รายการเพลง แปลว่า Function ทำงานแล้ว

