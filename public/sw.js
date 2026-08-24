const CACHE = 'maratona-shell-v4';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg', '/data/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then(async (cache) => {
    await cache.addAll(SHELL);
    const index = await cache.match('/index.html');
    const html = index ? await index.text() : '';
    const buildAssets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((match) => match[1]);
    await cache.addAll(buildAssets);
  }));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key.startsWith('maratona-shell-') && key !== CACHE).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname === '/data/manifest.json') {
    event.respondWith((async () => {
      try {
        const response = await fetch(event.request);
        if (response.ok) await (await caches.open(CACHE)).put(event.request, response.clone());
        return response;
      } catch {
        return caches.match(event.request);
      }
    })());
    return;
  }
  // Package downloads must reach the network even when an older edition cache
  // exists. Installed packages are read explicitly by the offline adapter.
  if (url.pathname.startsWith('/data/')) return;
  const navigation = event.request.mode === 'navigate';
  if (navigation) {
    event.respondWith((async () => {
      try {
        const response = await fetch(event.request);
        if (response.ok) await (await caches.open(CACHE)).put('/index.html', response.clone());
        return response;
      } catch {
        return caches.match('/index.html');
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response.ok && url.origin === location.origin) {
      await (await caches.open(CACHE)).put(event.request, response.clone());
    }
    return response;
  })());
});
