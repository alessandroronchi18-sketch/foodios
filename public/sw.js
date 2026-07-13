// FoodOS service worker — Modalità Dipendente PWA (2026-06-18)
//
// Strategie:
// - Static assets (JS/CSS/font/icone) → stale-while-revalidate
// - HTML navigations → network-first con fallback offline
// - API/Supabase → network-only (mai cachare scritture/RLS dati)
// - Push notifications → handler base
//
// Cache versioning: bumpa CACHE_VERSION quando cambi contratti.

// IMPORTANT: bumpa questa versione ad ogni deploy con cambi UI/UX.
// Altrimenti i client con SW attivo vedono il vecchio shell HTML/CSS.
const CACHE_VERSION = 'foodios-2026-07-13-234b94b';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

// Asset critici per il primo render (precachato in install).
// Aggiungi qui i path stabili — Vite genera asset con hash, quindi
// non li precachiamo (li serve runtime cache).
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/favicon.svg',
  '/logo.svg',
];

// Hosts che NON devono essere cachati (sempre network).
const NEVER_CACHE_HOSTS = [
  'supabase.co',
  'api.anthropic.com',
  'api.stripe.com',
  'api.openai.com',
  'sentry.io',
];

// ── install: precache + skipWaiting ──────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      await cache.addAll(PRECACHE_URLS).catch(() => {});
      self.skipWaiting();
    })()
  );
});

// ── activate: cleanup vecchie cache + claim ──────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// ── fetch: routing strategie ─────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Solo GET (no caching su POST/PUT/DELETE — rischio replay attacks).
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Mai cachare host con dati live/auth/payment.
  if (NEVER_CACHE_HOSTS.some((h) => url.hostname.includes(h))) {
    return;
  }

  // API interne: network-only (sono /api/*).
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // HTML navigations → network-first (così aggiornamenti sito sono immediati).
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(networkFirstHTML(request));
    return;
  }

  // Asset statici (js/css/png/svg/font) → stale-while-revalidate.
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

async function networkFirstHTML(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (e) {
    const cached = await caches.match(request);
    if (cached) return cached;
    const fallback = await caches.match('/');
    if (fallback) return fallback;
    return new Response('Offline e cache vuota.', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((res) => {
      if (res && res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => cached);
  return cached || networkPromise;
}

// ── push: handler base per notifiche server-driven ──────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'FoodOS', body: event.data.text() };
  }
  const title = payload.title || 'FoodOS';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/favicon.svg',
    badge: payload.badge || '/favicon.svg',
    tag: payload.tag || 'foodios-generic',
    data: { url: payload.url || '/', ...(payload.data || {}) },
    requireInteraction: !!payload.requireInteraction,
    silent: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// ── notificationclick: apri/focus tab corrispondente ─────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      // Se c'è già una finestra FoodOS aperta, focus + navigate.
      for (const client of allClients) {
        if (client.url.includes(self.location.origin)) {
          if ('focus' in client) await client.focus();
          if ('navigate' in client) await client.navigate(targetUrl);
          return;
        }
      }
      // Altrimenti, apri nuova.
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })()
  );
});

// ── message: dal client per skipWaiting / cache clear ───────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
    );
  }
});
