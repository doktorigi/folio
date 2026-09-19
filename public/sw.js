// ponytail: network-first with cache fallback, so it works offline after the first visit.
// Upgrade to a precache manifest if offline-on-first-install matters.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return
  e.respondWith(fetch(e.request).then(res => {
    const copy = res.clone()
    caches.open('folio').then(c => c.put(e.request, copy))
    return res
  }).catch(() => caches.match(e.request)))
})
