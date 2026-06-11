/**
 * URL pública de la app, para armar enlaces absolutos (correos).
 * Usa APP_URL si está definida; si no, la deduce de la petición.
 */
export function urlBase(request: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, "");
  const host = (
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    "localhost:3000"
  )
    .split(",")[0]
    .trim();
  const proto =
    request.headers.get("x-forwarded-proto")?.split(",")[0].trim() ??
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}
