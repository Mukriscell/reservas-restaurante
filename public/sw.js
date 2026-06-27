/*
 * Service worker de MESALISTA.
 *
 * Estrategia red-primero sin caché de código: nunca sirve una versión
 * vieja de la app; solo intercepta navegaciones fallidas para mostrar
 * un aviso amable cuando el dispositivo está sin conexión.
 */

const OFFLINE_HTML = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sin conexión — MESALISTA</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
       background:#fdf6ee;color:#3a1609;font-family:system-ui,sans-serif;text-align:center}
  .caja{max-width:26rem;padding:2.5rem 1.5rem}
  .logo{width:72px;height:72px;border-radius:18px;background:#c25a15;display:inline-flex;
        align-items:center;justify-content:center;margin-bottom:1rem}
  h1{font-size:1.4rem;margin:0 0 .5rem}
  p{color:#6c2f16;margin:0 0 1.5rem}
  button{background:#c25a15;color:#fff;border:0;border-radius:.75rem;padding:.8rem 1.6rem;
         font-size:1rem;font-weight:600;cursor:pointer}
</style>
</head>
<body>
<div class="caja">
  <div class="logo">
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"
         stroke-linecap="round" stroke-linejoin="round">
      <path d="m16 2-2.3 2.3a3 3 0 0 0 0 4.2l1.8 1.8a3 3 0 0 0 4.2 0L22 8"/>
      <path d="M15 15 3.3 3.3a4.2 4.2 0 0 0 0 6l7.3 7.3c.7.7 2 .7 2.8 0L15 15Zm0 0 7 7"/>
      <path d="m2.1 21.8 6.4-6.3"/>
      <path d="m19 5-7 7"/>
    </svg>
  </div>
  <h1>Sin conexión</h1>
  <p>MESALISTA necesita internet para registrar y consultar reservas.
     Revisa tu conexión e inténtalo de nuevo.</p>
  <button onclick="location.reload()">Reintentar</button>
</div>
</body>
</html>`;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(
        () =>
          new Response(OFFLINE_HTML, {
            status: 503,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          })
      )
    );
  }
});
