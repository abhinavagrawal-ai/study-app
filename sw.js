// ══════════════════════════════════════════════════════
//  🍅 POMODORO TRACKER — SERVICE WORKER
//  Provides: offline support, asset caching, PWA install
// ══════════════════════════════════════════════════════

const CACHE_NAME   = 'pomodoro-tracker-v4';
const CACHE_STATIC = 'pomodoro-static-v4';

// Assets to cache on install — app shell
const PRECACHE_URLS = [
  './',
  './index.html',
  './app.css',        // ← ADDED: styles — required for offline
  './app.js',         // ← ADDED: logic  — required for offline
  './database.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

// ── INSTALL: precache app shell ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then(cache => cache.addAll(PRECACHE_URLS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: remove old caches ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_STATIC && k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: Network-first for Firebase/API, Cache-first for static assets ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Always bypass service worker for Firebase, CDN, and analytics requests
  if (
    url.hostname.includes('firebaseio.com')     ||
    url.hostname.includes('firestore.googleapis') ||
    url.hostname.includes('googleapis.com')     ||
    url.hostname.includes('gstatic.com')        ||
    url.hostname.includes('fonts.googleapis')   ||
    url.hostname.includes('fonts.gstatic')      ||
    url.hostname.includes('firebaseapp.com')    ||
    event.request.method !== 'GET'
  ) {
    return; // let browser handle it normally
  }

  // Cache-first for same-origin static assets (HTML, JS, CSS, images)
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request)
          .then(response => {
            // Cache valid responses
            if (response && response.status === 200 && response.type === 'basic') {
              const responseClone = response.clone();
              caches.open(CACHE_STATIC).then(cache => cache.put(event.request, responseClone));
            }
            return response;
          })
          .catch(() => {
            // Offline fallback — return cached index.html for navigation requests
            if (event.request.mode === 'navigate') {
              return caches.match('./index.html');
            }
          });
      })
    );
    return;
  }
});

// ── Background Sync placeholder (future: queue failed Firebase writes) ──
self.addEventListener('sync', event => {
  if (event.tag === 'sync-study-data') {
    // Future: dequeue and retry failed Firestore writes
    console.log('[SW] Background sync triggered');
  }
});
