const CACHE_NAME = 'cpre-studio-v2';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Nunca intercepta rotas de API nem Supabase
  if (url.pathname.startsWith('/api/') || url.origin !== self.location.origin) {
    return;
  }

  // Network-first com fallback de cache para ativos estáticos (sprites, ícones, mídias)
  if (
    url.pathname.startsWith('/sprites/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/media/')
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        try {
          const fresh = await fetch(req);
          if (fresh.ok) cache.put(req, fresh.clone());
          return fresh;
        } catch {
          const cached = await cache.match(req);
          if (cached) return cached;
          throw new Error('Offline e sem cache disponível.');
        }
      })
    );
  }
});
