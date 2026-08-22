/* =====================================================================
   BTU SUPERVISOR SAFETY HUB — SERVICE WORKER
   Provides offline support via a cache-first strategy for the app shell,
   and a network-first strategy for config.json so supervisors get fresh
   form data when online, but the app still works offline with the last
   known list.

   HOW TO DEPLOY UPDATES (see README.md for full details)
     Bump CACHE_VERSION below whenever you change any cached file
     (styles.css, app.js, index.html, icons, etc). This forces every
     installed device to fetch the new files instead of serving stale
     ones from cache. If you forget, users may keep seeing the old
     version until the cache naturally expires.
   ===================================================================== */

const CACHE_VERSION = 'v1';
const CACHE_NAME = 'btu-safety-hub-' + CACHE_VERSION;

// The "app shell" — static files needed for the app to load and run offline.
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-192.png',
  './icon-maskable-512.png',
];

/* ---- INSTALL: pre-cache the app shell ---- */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

/* ---- ACTIVATE: clean up old cache versions ---- */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('btu-safety-hub-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

/* ---- FETCH: routing strategy ---- */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GET requests within this origin; let everything else
  // (e.g. cross-origin Microsoft Forms links opened in a new tab) pass
  // straight through to the network untouched.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) {
    return;
  }

  // config.json: network-first, falling back to cache when offline, so
  // supervisors always see the latest forms when they have a connection.
  if (req.url.includes('config.json')) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Everything else in the app shell: cache-first for speed + offline use,
  // with a background network fetch to keep the cache fresh.
  event.respondWith(cacheFirst(req));
});

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) {
    // Update the cache in the background (stale-while-revalidate-ish).
    fetch(req).then((res) => {
      if (res && res.ok) {
        caches.open(CACHE_NAME).then((cache) => cache.put(req, res));
      }
    }).catch(() => {});
    return cached;
  }

  try {
    const res = await fetch(req);
    if (res && res.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, res.clone());
    }
    return res;
  } catch (err) {
    // Navigations offline with nothing cached fall back to the app shell.
    if (req.mode === 'navigate') {
      const fallback = await caches.match('./index.html');
      if (fallback) return fallback;
    }
    throw err;
  }
}

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res && res.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, res.clone());
    }
    return res;
  } catch (err) {
    const cached = await caches.match(req);
    if (cached) return cached;
    throw err;
  }
}
