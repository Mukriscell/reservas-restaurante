/*
 * Service worker de Porto Alegre.
 *
 * Estrategia: red primero con respaldo en caché para peticiones GET del
 * mismo origen. Como los assets de Vite llevan hash en el nombre, cachear
 * lo que va llegando es seguro; tras la primera carga la app completa
 * funciona sin conexión (los datos viven en localStorage del dispositivo).
 */
const CACHE = "porto-alegre-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((claves) =>
        Promise.all(claves.filter((c) => c !== CACHE).map((c) => caches.delete(c)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || !request.url.startsWith(self.location.origin)) {
    return;
  }
  event.respondWith(
    (async () => {
      try {
        const respuesta = await fetch(request);
        const cache = await caches.open(CACHE);
        cache.put(request, respuesta.clone());
        return respuesta;
      } catch {
        const cacheada = await caches.match(request);
        if (cacheada) return cacheada;
        // Navegación sin conexión: servir el shell de la app.
        if (request.mode === "navigate") {
          const shell = await caches.match("/index.html");
          if (shell) return shell;
        }
        return new Response("Sin conexión", { status: 503 });
      }
    })()
  );
});
