// Minimal service worker — caches the shell and lets dynamic data pass through.
// Drafts of workbook/POE answers are saved to localStorage by the page scripts;
// when online, the normal save calls will sync them to the server.
const CACHE = 'nibs-shell-v1';
const SHELL = ['/', '/static/css/styles.css', '/static/js/app.js', '/static/js/shell.js', '/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.pathname.startsWith('/api/')) return; // never cache APIs
  if (url.pathname.startsWith('/uploads/')) return;
  event.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(()=>{});
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
