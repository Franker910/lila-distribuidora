/* ─── LILA DISTRIBUIDORA — SERVICE WORKER ─────────────────────────────────
   Actualizar CACHE_VERSION en cada deploy (igual que APP_VERSION en index.html)
   ───────────────────────────────────────────────────────────────────────── */
const CACHE_VERSION = '20260723-01';
const CACHE_NAME    = 'lila-v' + CACHE_VERSION;
const SCOPE         = '/lila-distribuidora/';

// ── INSTALL: cachear index.html y activar de inmediato ───────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => c.add(SCOPE))
      .then(() => self.skipWaiting()) // no esperar a que cierren otras pestañas
  );
});

// ── ACTIVATE: limpiar cachés viejas, tomar control y avisar a las páginas ─
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys    = await caches.keys();
    const oldKeys = keys.filter(k => k !== CACHE_NAME);
    const esUpdate = oldKeys.length > 0;

    // Borrar cachés de versiones anteriores
    await Promise.all(oldKeys.map(k => caches.delete(k)));

    // Tomar control de todas las pestañas abiertas sin esperar recarga
    await self.clients.claim();

    // Solo notificar si es una ACTUALIZACIÓN (no primera instalación)
    if (esUpdate) {
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach(c => c.postMessage({ type: 'SW_ACTUALIZADO', version: CACHE_VERSION }));
    }
  })());
});

// ── FETCH: network-first para index.html, pass-through para todo lo demás ─
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Solo interceptar navegaciones dentro del scope de la app
  if (e.request.mode !== 'navigate') return;
  if (!url.pathname.startsWith(SCOPE))  return;

  e.respondWith((async () => {
    try {
      // Siempre intentar red primero, ignorando caché HTTP del CDN
      const res = await fetch(e.request, { cache: 'no-cache' });
      if (res.ok) {
        const c = await caches.open(CACHE_NAME);
        c.put(e.request, res.clone()); // actualizar caché local en segundo plano
      }
      return res;
    } catch {
      // Sin conexión: servir desde caché local
      const cached = await caches.match(e.request)
                  || await caches.match(url.origin + SCOPE);
      return cached ?? new Response('Sin conexión. Abrí la app cuando tengas internet.', {
        status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  })());
});

// ── MESSAGE: permitir que la página pida activación manual (fallback) ─────
self.addEventListener('message', e => {
  if (e.data?.type === 'SW_SKIP_WAITING') self.skipWaiting();
});
