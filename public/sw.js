/*
 * RADAR service worker.
 *
 * Scope is deliberately narrow:
 *  - Precache the app shell so a previously visited installation can reopen offline.
 *  - Runtime-cache same-origin static assets (hashed JS/CSS, fonts, icons).
 *  - Never cache API responses here; the offline data pack in the app is explicit
 *    and user-controlled. Caching API GETs silently would show stale safety data.
 */

const VERSION = 'radar-shell-v2';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const SHELL_ASSETS = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => Promise.allSettled(SHELL_ASSETS.map((asset) => cache.add(asset))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) => key.startsWith('radar-shell-') && key !== SHELL_CACHE && key !== ASSET_CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return /\.(?:js|mjs|css|woff2?|ttf|otf|png|jpe?g|webp|gif|svg|ico)$/i.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API and uploads always go to the network. Offline reads come from the
  // explicit data pack, not from an invisible HTTP cache.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) return;

  // SPA navigations: network first, then the cached shell.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches
            .open(SHELL_CACHE)
            .then((cache) => cache.put('/index.html', copy))
            .catch(() => {});
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(SHELL_CACHE);
          return (
            (await cache.match('/index.html')) ||
            (await cache.match('/')) ||
            new Response(
              '<!doctype html><meta charset="utf-8"><title>RADAR offline</title><body style="font-family:system-ui;background:#0b1220;color:#e2e8f0;padding:2rem"><h1>RADAR is offline</h1><p>This page has not been cached on this device yet. Reconnect and open RADAR once, then save an offline data pack.</p></body>',
              { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 },
            )
          );
        }),
    );
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) {
          // Stale-while-revalidate keeps hashed assets fast but self-updating.
          fetch(request)
            .then((response) => {
              if (response.ok) cache.put(request, response.clone());
            })
            .catch(() => {});
          return cached;
        }
        try {
          const response = await fetch(request);
          if (response.ok) cache.put(request, response.clone());
          return response;
        } catch {
          return new Response('', { status: 504, statusText: 'Offline' });
        }
      }),
    );
  }
});

self.addEventListener('push', (event) => {
  let data = {
    title: 'RADAR announcement',
    body: 'Open your school workspace to view the update.',
    url: '/alerts',
  };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    /* Generic notification for malformed payloads. */
  }
  event.waitUntil(
    self.registration.showNotification(String(data.title), {
      body: String(data.body),
      icon: '/favicon.svg',
      tag: String(data.tag ?? 'radar-alert'),
      data: {
        url:
          typeof data.url === 'string' && data.url.startsWith('/') && !data.url.startsWith('//')
            ? data.url
            : '/alerts',
      },
    }),
  );
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url ?? '/alerts', self.location.origin).toString();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
      for (const client of windows)
        if (new URL(client.url).origin === self.location.origin) {
          await client.navigate(url);
          return client.focus();
        }
      return clients.openWindow(url);
    }),
  );
});
