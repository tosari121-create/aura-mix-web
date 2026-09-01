# AURA MIX — Stable Crossfade Player

ระบบ Web Music Player พร้อม Auto Crossfade 4 วินาที, Waveform Interactive, Auto EQ, และการจัดคัดกรองเพลย์ลิสต์เพลงยุค 90 / ศิลปิน

## โครงสร้างไฟล์
- `index.html` - หน้าหลัก UI ของ Web Player
- `styles.css` - สไตล์และดีไซน์ทั้งหมด
- `app.js` - ระบบคุม YouTube Player, Crossfade, Waveform, Auto EQ
- `netlify/functions/youtube-search.js` - API ค้นหา YouTube (Netlify Serverless Function)
- `netlify.toml` - ไฟล์คอนฟิกของ Netlify
- `package.json` - รวม dependencies (`yt-search`)

## วิธีการปรับใช้ (Deploy บน Netlify)
1. ลากโฟลเดอร์โครงการนี้หรือไฟล์ทั้งหมดอัปโหลดลงบน **Netlify**
2. Netlify จะติดตั้ง package `yt-search` และเปิดใช้งาน Serverless Function `/.netlify/functions/youtube-search` โดยอัตโนมัติ
3. ใช้งานค้นหาเพลงและเล่นได้ทันที!
