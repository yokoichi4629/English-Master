// English Master — オフライン学習用のサービスワーカー
// 通信できるときは常に最新版を取得して表示し(同時に端末へ保存)、
// 電波がないときや通信が遅いときは保存済みのものを表示する。
const CACHE = 'english-master-v7';
const SHELL = ['/', '/style.css', '/app.js', '/data.js', '/manifest.webmanifest', '/icon.svg', '/icon-180.png', '/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(SHELL.map((u) => fetch(u, { cache: 'reload' }).then((r) => (r.ok && !r.redirected ? c.put(u, r) : null)).catch(() => null))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('english-master-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/__tts/')) return;
  const isFont = /^fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (url.origin !== self.location.origin && !isFont) return;
  const key = req.mode === 'navigate' ? '/' : req;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (isFont) { // フォントは変わらないので保存済みを優先
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req).catch(() => null);
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res || new Response('', { status: 504 });
    }
    try {
      const res = await Promise.race([fetch(req, { cache: 'no-cache' }), timeout(4000)]);
      if (res.ok && !res.redirected) cache.put(key, res.clone());
      return res;
    } catch {
      const hit = await cache.match(key, { ignoreSearch: true });
      return hit || new Response('オフラインです', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }
  })());
});
