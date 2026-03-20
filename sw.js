// ══════════════════════════════════════════════════════
//  🍅 POMODORO TRACKER — SERVICE WORKER  (future-proof v2)
//
//  Changes from v1:
//   - CACHE_VERSION is a timestamp injected at deploy time via
//     your build/deploy script: sed -i "s/__BUILD_TIME__/$(date +%s)/" sw.js
//     If you don't have a build step, it still works — the SW will
//     just use the hardcoded fallback and you bump CACHE_VER manually.
//   - Stale-while-revalidate strategy for HTML (users always see app,
//     but background-fetch keeps it fresh for next visit)
//   - Network-first with cache fallback for JS/CSS (ensures new code
//     is always served when online)
//   - Cache-first for images/fonts (rarely change, big perf win)
//   - Offline fallback returns cached index.html for any navigate request
//   - Old cache cleanup is exhaustive (removes ALL unknown cache names)
// ══════════════════════════════════════════════════════

// Bump this when you deploy new code.
// TIP: automate with: sed -i "s/CACHE_VER = .*/CACHE_VER = '$(date +%s)';/" sw.js
const CACHE_VER    = '__BUILD_TIME__';  // replaced by deploy script; fallback below
const CACHE_NAME   = 'pom-static-' + (CACHE_VER === '__BUILD_TIME__' ? 'v6' : CACHE_VER);

// App shell — must all be cached for offline to work
const PRECACHE_URLS = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './firebase-sync.js',
  './database.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

// ── INSTALL: precache app shell ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS).catch(e => {
        console.warn('[SW] Precache partial failure (ok in dev):', e.message);
      }))
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: delete old caches + auto-detect new deploy ──
self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      // 1. Remove all old named caches
      const keys = await caches.keys();
      await Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => {
          console.log('[SW] Deleting old cache:', k);
          return caches.delete(k);
        })
      );
      await self.clients.claim();

      // 2. Auto-detect new deploy (works without a build step):
      //    Fetch index.html and compare ETag/Last-Modified to cached version.
      //    If changed, delete our cache so fresh files are fetched.
      if (CACHE_VER !== '__BUILD_TIME__') return; // skip if build step handled it
      try {
        const cache    = await caches.open(CACHE_NAME);
        const cached   = await cache.match('./index.html');
        const fresh    = await fetch('./index.html', { cache: 'no-store' });
        if (!fresh.ok) return;
        // Clone BEFORE reading headers — body stream can only be consumed once.
        // cache.put() after etag comparison would store an empty body without clone.
        const freshClone = fresh.clone();
        const cachedEtag = cached?.headers?.get('etag') || cached?.headers?.get('last-modified') || '';
        const freshEtag  = fresh.headers.get('etag') || fresh.headers.get('last-modified') || '';
        if (cachedEtag && freshEtag && cachedEtag !== freshEtag) {
          console.log('[SW] New deploy detected — clearing cache');
          await caches.delete(CACHE_NAME);
        }
        // Store the clone — original body may be partially read by header access
        await cache.put('./index.html', freshClone);
      } catch(e) {
        console.warn('[SW] Auto-detect check failed (non-critical):', e.message);
      }
    })()
  );
});

// ── FETCH: tiered caching strategy ──
self.addEventListener('fetch', event => {
  const url = event.request.url;
  const req = event.request;

  // Always bypass SW for Firebase, CDN, analytics, and non-GET
  if (
    url.includes('firebaseio.com')       ||
    url.includes('firestore.googleapis') ||
    url.includes('googleapis.com')       ||
    url.includes('gstatic.com')          ||
    url.includes('fonts.googleapis')     ||
    url.includes('fonts.gstatic')        ||
    url.includes('firebaseapp.com')      ||
    req.method !== 'GET'
  ) { return; }

  const destIsNavigate = req.mode === 'navigate';
  const destIsAsset    = /\.(js|css)$/.test(url);
  const destIsMedia    = /\.(png|jpg|jpeg|webp|svg|ico|woff2?)$/.test(url);

  if (destIsNavigate) {
    // Stale-while-revalidate for HTML navigation:
    // Serve cache instantly, fetch update in background for next visit.
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  if (destIsAsset) {
    // Network-first for JS/CSS: always try fresh code, fall back to cache.
    event.respondWith(networkFirst(req));
    return;
  }

  if (destIsMedia) {
    // Cache-first for images/fonts: rarely change, major perf win.
    event.respondWith(cacheFirst(req));
    return;
  }

  // Default: network-first
  event.respondWith(networkFirst(req));
});

// ── Strategy: Stale-While-Revalidate ──
async function staleWhileRevalidate(req) {
  const cache  = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req).then(res => {
    if (res && res.status === 200) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return cached || await fetchPromise || caches.match('./index.html');
}

// ── Strategy: Network-First with cache fallback ──
async function networkFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const res = await fetch(req);
    if (res && res.status === 200 && res.type === 'basic') {
      cache.put(req, res.clone());
    }
    return res;
  } catch {
    const cached = await cache.match(req);
    return cached || caches.match('./index.html');
  }
}

// ── Strategy: Cache-First ──
async function cacheFirst(req) {
  const cache  = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && res.status === 200) cache.put(req, res.clone());
    return res;
  } catch {
    return new Response('', { status: 503, statusText: 'Offline' });
  }
}

// ── Background Sync (future: retry failed Firestore writes) ──
self.addEventListener('sync', event => {
  if (event.tag === 'sync-study-data') {
    console.log('[SW] Background sync triggered — retry queued writes here');
  }
});

// ── Push notifications (future) ──
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json().catch ? event.data.text() : event.data.json();
  self.registration.showNotification(data.title || '🍅 Pomodoro', {
    body:  data.body || 'Keep studying!',
    icon:  './icon-192.png',
    badge: './icon-192.png',
    tag:   'pomodoro-push',
  });
});
