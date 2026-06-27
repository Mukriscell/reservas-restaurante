const formato = new Intl.DateTimeFormat("es-CL", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** "2026-06-11T21:14:00.000Z" → "11-06-2026, 18:14" (hora local). */
export function formatFechaHora(iso: string): string {
  return formato.format(new Date(iso));
}
