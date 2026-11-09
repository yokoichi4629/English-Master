// English Master — オフライン学習用のサービスワーカー
// アプリ本体と学習データを端末に保存し、電波がなくても学習できるようにする。
// 表示は保存済みのものを使い、裏で最新版を取得して次回から反映する。
const CACHE = 'english-master-v4';
const SHELL = ['/', '/style.css', '/app.js', '/data.js', '/manifest.webmanifest', '/icon.svg', '/icon-180.png', '/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('english-master-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.pathname.startsWith('/api/')) return;
  const isFont = /^fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (url.origin !== self.location.origin && !isFont) return;
  const key = req.mode === 'navigate' ? '/' : req;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(key, { ignoreSearch: true });
    const fresh = fetch(req).then((res) => {
      if ((res.ok || res.type === 'opaque') && !res.redirected) cache.put(key, res.clone());
      return res;
    }).catch(() => null);
    if (hit) { e.waitUntil(fresh); return hit; }
    const res = await fresh;
    return res || new Response('オフラインです', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  })());
});
