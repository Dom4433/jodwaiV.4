# จดไว (PWA)

วางไฟล์ทั้งโฟลเดอร์นี้บนโฮสต์ที่เป็น HTTPS (เช่น GitHub Pages, Netlify, Vercel, Cloudflare Pages)
Service Worker ทำงานได้เฉพาะบน HTTPS หรือ http://localhost เท่านั้น เปิดจากไฟล์ตรงๆ (file://) จะไม่ทำงาน

ทดสอบในเครื่อง:  python3 -m http.server 8000  แล้วเปิด http://localhost:8000

เมื่อแก้ไขไฟล์ใดๆ ให้เปลี่ยน VERSION ใน sw.js (เช่น jodwai-v2) ผู้ใช้จะเห็นปุ่ม "อัปเดต"

Chart.js 4.4.4 (MIT) อยู่ใน vendor/ เพื่อให้กราฟใช้งานได้ตอนออฟไลน์
