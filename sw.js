/* จดไว – Service Worker
   เปลี่ยนเลขเวอร์ชันทุกครั้งที่แก้ไฟล์ เพื่อให้เครื่องผู้ใช้โหลดของใหม่ */
const VERSION = 'jodwai-v7';
const APP_CACHE = VERSION + '-app';
const FONT_CACHE = 'jodwai-fonts';

// ไฟล์หลักที่ต้องมีเพื่อเปิดแอปแบบออฟไลน์
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './vendor/chart.umd.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(APP_CACHE).then(cache =>
      // เพิ่มทีละไฟล์ ถ้าไฟล์ไหนหาย (เช่น ลืมอัปโหลด vendor/) แอปยังติดตั้งได้
      Promise.all(APP_SHELL.map(u => cache.add(u).catch(err => console.warn('SW cache skip', u, err))))
    )
  );
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => k !== APP_CACHE && k !== FONT_CACHE).map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

// หน้าเว็บส่งข้อความมาเมื่อผู้ใช้กด "อัปเดต"
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // ฟอนต์ และ Chart.js สำรองจาก CDN: cache-first (เก็บไว้ใช้ตอนออฟไลน์)
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com' ||
      url.hostname === 'cdnjs.cloudflare.com' || url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith(cacheFirst(req, FONT_CACHE));
    return;
  }

  if (url.origin !== self.location.origin) return;

  // หน้า HTML: network-first เพื่อได้เวอร์ชันล่าสุด ถ้าออฟไลน์ใช้ของใน cache
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(APP_CACHE);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch (e) {
        return (await caches.match('./index.html')) || (await caches.match('./'));
      }
    })());
    return;
  }

  // ไฟล์อื่นในแอป: cache-first
  event.respondWith(cacheFirst(req, APP_CACHE));
});

async function cacheFirst(req, cacheName) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && (res.ok || res.type === 'opaque')) {
      const cache = await caches.open(cacheName);
      cache.put(req, res.clone());
    }
    return res;
  } catch (e) {
    return cached || Response.error();
  }
}
