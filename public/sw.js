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
const CACHE_VERSION = 'foodos-2026-09-16-4938e5c';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

// ── Il magazzino dei file che non cambiano ───────────────────────────────────
//
// Vite mette il contenuto nel nome del file: `index-DNeLJPZJ.js` cambia nome
// solo se cambia dentro. Un file col nome diverso è un file diverso, e uno
// con lo stesso nome è identico per definizione — quindi tenerlo non può
// mai servire una versione vecchia.
//
// Prima non era così. Il nome della cache conteneva la versione, e `activate`
// cancellava tutto quello che non cominciava con la versione nuova: **a ogni
// rilascio il telefono buttava via tutto e riscaricava 1,5 MB**, compresi i
// 635 kB del modulo PDF e i 453 kB dei grafici che non erano cambiati di una
// virgola. In negozio, con la rete del telefono, è la differenza fra aprire
// l'app e aspettare.
//
// Ora i file con l'impronta nel nome stanno in un magazzino a parte che non
// si svuota mai per versione: dopo un rilascio si scarica solo quello che è
// davvero cambiato. Il magazzino ha un tetto, o crescerebbe a ogni rilascio.
const ASSET_CACHE = 'foodos-assets-v1';
const MAX_ASSET_ENTRIES = 120;

// Un file "con l'impronta" è un file il cui nome contiene un pezzo di hash
// generato dalla compilazione: `nome-A1b2C3d4.js`.
//
// Il riconoscimento è per **cartella**, non per forma del nome: la
// compilazione mette in `/assets/` soltanto file con l'impronta — verificato
// il 15/09/2026, tutti e 105 — mentre quelli che possono cambiare restando
// con lo stesso nome (favicon.svg, logo.svg, manifest.json, index.html)
// stanno alla radice. Riconoscerli dal nome era fragile: l'impronta di Vite
// può contenere un trattino (`AdminPage-Ds8yKJ-s.js`), e una regola che lo
// ammette scambia per impronta anche `mio-file-normale.js`.
function haImpronta(pathname) {
  return pathname.startsWith('/assets/');
}

// Tetto al magazzino: si buttano le più vecchie, non a caso.
async function sfoltisci(cache) {
  try {
    const chiavi = await cache.keys();
    if (chiavi.length <= MAX_ASSET_ENTRIES) return;
    for (const k of chiavi.slice(0, chiavi.length - MAX_ASSET_ENTRIES)) {
      await cache.delete(k);
    }
  } catch (e) { /* un magazzino che non si sfoltisce è meglio di uno rotto */ }
}

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
          // Il magazzino dei file con l'impronta sopravvive ai rilasci: è il
          // motivo per cui dopo un aggiornamento non si riscarica tutto.
          .filter((k) => k !== ASSET_CACHE && !k.startsWith(CACHE_VERSION))
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

  // File con l'impronta nel nome: si servono dal magazzino, e se non ci sono
  // si scaricano una volta sola. Non serve nemmeno controllare se sono
  // cambiati — se cambiano, cambia il nome.
  if (url.origin === self.location.origin && haImpronta(url.pathname)) {
    event.respondWith(dalMagazzino(request));
    return;
  }

  // Tutto il resto (favicon, logo, manifest) → stale-while-revalidate.
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

async function dalMagazzino(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res && res.ok) {
      await cache.put(request, res.clone());
      sfoltisci(cache);
    }
    return res;
  } catch (e) {
    // Senza rete e senza copia non si può fare niente: si lascia fallire
    // come farebbe il browser, invece di restituire una pagina di errore
    // dove il browser si aspetta uno script.
    throw e;
  }
}

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
    tag: payload.tag || 'foodos-generic',
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
    // Si svuota tutto TRANNE il magazzino dei file con l'impronta.
    //
    // Prima cancellava anche quello, e annullava da solo il motivo per cui
    // esiste: dopo ogni aggiornamento il telefono riscaricava 1,5 MB, compresi
    // i file che non erano cambiati di una virgola. Un file il cui nome
    // contiene l'impronta del contenuto non può MAI essere obsoleto — se
    // cambia, cambia il nome — quindi buttarlo è lavoro sprecato e basta.
    //
    // Quello che va davvero buttato è la pagina HTML e i file dal nome
    // stabile: lì una copia vecchia è un problema vero.
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(
        keys.filter((k) => k !== ASSET_CACHE).map((k) => caches.delete(k))
      ))
    );
  }
});
