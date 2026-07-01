/* Service worker — Ficha Fisio. Página sempre atualizada (network-first), offline como reserva. */
const CACHE = 'ficha-fisio-v31';
const SUPA = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(CORE).then(() => c.add(SUPA).catch(() => {})))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;
  const isLib = req.url.indexOf('cdn.jsdelivr.net') !== -1;
  if (!sameOrigin && !isLib) return; // não intercepta Google/YouTube/API Asaas/Supabase

  const isHTML = req.mode === 'navigate' || (sameOrigin && (url.pathname === '/' || url.pathname.endsWith('/') || url.pathname.endsWith('index.html')));

  if (isHTML) {
    // network-first: sempre tenta a versão nova; offline cai pro cache
    e.respondWith(
      fetch(req).then(resp => {
        const copy = resp.clone();
        caches.open(CACHE).then(c => c.put('./index.html', copy));
        return resp;
      }).catch(() => caches.match(req).then(c => c || caches.match('./index.html')))
    );
    return;
  }

  // resto (biblioteca, ícone, manifest): cache-first
  e.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(resp => {
      const copy = resp.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
      return resp;
    }).catch(() => undefined))
  );
});
