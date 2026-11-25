/* Service Worker: App-Gerüst offline verfügbar machen. Wetterdaten kommen immer frisch aus dem Netz. */
const VERSION = 'wetter-mobile-v2';
const SHELL = [
  './', './index.html', './mobile.css', './mobile.js', './mobile-map.js', '../map.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png',
  './vendor/leaflet.css', './vendor/leaflet.js', './vendor/proj4.js', './vendor/fonts/fonts.css',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const isShell = url.origin === location.origin;   // nur eigene Dateien zwischenspeichern
  if (!isShell) return;                         // Wetterdaten, Karten, Satellit: immer Netz
  // App-Gerüst: erst Netz (damit Updates sofort ankommen), offline aus dem Cache
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request)));
});
