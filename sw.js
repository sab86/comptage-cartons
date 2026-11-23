// Comptage cartons: works offline (cold room) and picks up new versions when online.
const CACHE = 'cc-v3';
const APP = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
const LIBS = [
  'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js',
  'https://cdn.jsdelivr.net/npm/zxing-wasm@3.1.7/dist/iife/reader/index.js',
  'https://fastly.jsdelivr.net/npm/zxing-wasm@3.1.7/dist/reader/zxing_reader.wasm'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(APP);
    // barcode readers: saved one by one so one failure doesn't block the install
    await Promise.all(LIBS.map(u => c.add(new Request(u, { mode: 'cors' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// network first for the app's own files (so updates arrive), with a short wait
// so a weak signal doesn't leave the screen blank; saved copy otherwise
async function appFile(req) {
  const c = await caches.open(CACHE);
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 4000))
    ]);
    if (res && res.ok) c.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await c.match(req, { ignoreSearch: true }) ||
      (req.mode === 'navigate' ? await c.match('./index.html') || await c.match('./') : null);
    if (hit) return hit;
    throw err;
  }
}

// cache first for the barcode readers (fixed versions, never change)
async function libFile(req) {
  const c = await caches.open(CACHE);
  const hit = await c.match(req.url);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && (res.ok || res.type === 'opaque')) c.put(req.url, res.clone());
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) e.respondWith(appFile(req));
  else if (/jsdelivr\.net$/.test(url.hostname)) e.respondWith(libFile(req));
});
