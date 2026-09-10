'use strict';

/*
 * PURPOSE: Service worker for fresh online assets with a safe offline fallback.
 * EDIT GUIDE: Change fetch behavior only in the strategy block near the bottom.
 * HUWAG BAGUHIN: API requests must remain network-only so live records are never stale.
 * Kapag online, laging kinukuha ang pinakabagong HTML, JS, at CSS mula sa server.
 */
const CACHE_NAME = 'samelcii-v10-fresh-assets';

// PHP endpoints are dynamic â€” never cache their responses.
// The JS layer handles offline reads via IndexedDB instead.
function isApiCall(url) {
  return url.pathname.startsWith('/api/');
}

function jsonResponse(payload, status = 503) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

function transparentPixelResponse() {
  const bytes = Uint8Array.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
    0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41,
    0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
    0x42, 0x60, 0x82
  ]);
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'no-store'
    }
  });
}

function offlineFallback(req, url) {
  if (req.destination === 'image') {
    return transparentPixelResponse();
  }

  if (req.destination === 'document') {
    return caches.match('/index.html').then(cached => {
      if (cached) return cached;
      return new Response(
        '<!doctype html><html><body style="font-family:sans-serif;padding:2rem">Offline. Please reconnect and try again.</body></html>',
        {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        }
      );
    });
  }

  if (isApiCall(url)) {
    return jsonResponse({
      ok: false,
      offline: true,
      message: 'Offline â€” server unavailable.'
    }, 503);
  }

  if (req.destination === 'style') {
    return new Response('', {
      status: 503,
      headers: { 'Content-Type': 'text/css; charset=utf-8' }
    });
  }

  if (req.destination === 'script') {
    return new Response('', {
      status: 503,
      headers: { 'Content-Type': 'application/javascript; charset=utf-8' }
    });
  }

  return new Response('', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}

// Install: take control immediately (no waiting for old SW to die)
self.addEventListener('install', () => self.skipWaiting());

// Activate: delete old caches, claim all open clients right away
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch strategy:
//   API calls      â†’ network first, but return offline JSON instead of rejecting
//   Static assets  â†’ network first, cache fallback, then small safe placeholder
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    event.respondWith(
      fetch(req).catch(() => offlineFallback(req, url))
    );
    return;
  }

  if (isApiCall(url)) {
    event.respondWith(
      fetch(req)
        .then(res => res)
        .catch(() => offlineFallback(req, url))
    );
    return;
  }

  if (url.origin !== self.location.origin) {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req)
          .then(res => {
            if (res.ok) {
              const clone = res.clone();
              caches.open(CACHE_NAME).then(c => c.put(req, clone));
            }
            return res;
          })
          .catch(() => offlineFallback(req, url));
      })
    );
    return;
  }

  // ponytail: one network-first rule removes manual asset-version bumps; Cache Storage remains the offline fallback.
  const networkRequest = fetch(req, { cache: 'no-store' })
    .then(res => {
      if (res.ok) {
        const clone = res.clone();
        void caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
      }
      return res;
    });

  event.respondWith(
    networkRequest.catch(() => caches.match(req).then(cached => cached || offlineFallback(req, url)))
  );
});
