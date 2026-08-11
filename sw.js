const CACHE_NAME = 'vinere-ledger-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/utils.js',
  '/js/api.js',
  '/js/firebase.js',
  '/js/app.js',
  '/js/dashboard.js',
  '/js/filters.js',
  '/js/panel.js',
  '/js/table.js',
  '/js/payments.js',
  '/js/trading.js',
  '/images/vinere-logo-white.png'
];

/* ---------- INSTALL ---------- */
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(STATIC_ASSETS);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

/* ---------- ACTIVATE ---------- */
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_NAME; })
            .map(function(key) { return caches.delete(key); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

/* ---------- FETCH ---------- */
self.addEventListener('fetch', function(event) {
  var request = event.request;
  var url = new URL(request.url);

  // Let Firebase / Google APIs pass through (they handle their own caching)
  if (url.hostname.includes('google') ||
      url.hostname.includes('gstatic') ||
      url.hostname.includes('firebase')) {
    return;
  }

  // Only cache GET requests
  if (request.method !== 'GET') return;

  event.respondWith(
    caches.match(request).then(function(cached) {
      // Return cached immediately, then refresh in background
      var fetchPromise = fetch(request).then(function(networkResponse) {
        if (networkResponse && networkResponse.status === 200) {
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(request, networkResponse.clone());
          });
        }
        return networkResponse;
      }).catch(function() {
        // Offline — cached response already returned below
      });

      return cached || fetchPromise;
    })
  );
});