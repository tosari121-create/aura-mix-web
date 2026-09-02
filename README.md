# AURA MIX — Netlify

โครงสร้างพร้อม Deploy:

```text
├── netlify/
│   └── functions/
│       └── youtube-search.js
├── README.md
├── app.js
├── index.html
├── netlify.toml
├── package.json
└── styles.css
```

## Netlify

ตั้ง Environment Variable ชื่อ `YOUTUBE_API_KEY` ใน Netlify และเลือก scope ให้ใช้กับ Functions จากนั้น Deploy ใหม่

หน้าเว็บเรียก `/api/youtube-search` และ Netlify จะส่งต่อไปยัง Function ใน `netlify/functions/youtube-search.js`

ห้ามใส่ API key ลงใน `index.html`, `app.js` หรือไฟล์ฝั่ง browser
