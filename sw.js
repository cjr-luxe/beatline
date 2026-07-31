// Beatline service worker — an app-shell cache so the reader opens instantly and
// survives a flaky connection. Only registers in a secure context (HTTPS or
// localhost); over plain-HTTP LAN the browser refuses to register it, which is
// fine — the app still installs to the home screen, just without offline.
//
// NOTE: this caches the static shell only. Story/score DATA must always come
// from the network once the real API exists — never serve stale news from cache.
const SHELL = 'beatline-shell-v1';

// Base = the directory this SW is served from, so the same file works whether the
// app is mounted at "/" (localhost, custom domain) or a subpath ("/beatline/" on
// GitHub Pages). The SW's scope is already limited to this directory.
const BASE = new URL('./', self.location).pathname;

// Precache the entry document; hashed JS/CSS bundles are cached on first fetch.
const CORE = [BASE, BASE + 'index.html', BASE + 'manifest.json', BASE + 'favicon.ico'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Same-origin only. When the real API lands, exclude /api/* here so data is
  // always fetched live (network-only), never read from the shell cache.
  if (url.origin !== self.location.origin) return;

  // Navigations: network-first, fall back to the cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put(BASE + 'index.html', copy));
          return res;
        })
        .catch(() => caches.match(BASE + 'index.html')),
    );
    return;
  }

  // Static assets (hashed bundles, icons): cache-first, then populate.
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(SHELL).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
