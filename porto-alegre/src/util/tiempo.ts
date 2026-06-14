/**
 * Tiempo transcurrido legible desde una fecha ISO hasta `ahora` (epoch ms).
 * Pensado para el plano de salón: "recién", "8 min", "1 h 05", "3 h".
 */
export function tiempoTranscurrido(desdeISO: string, ahora: number): string {
  const ms = ahora - new Date(desdeISO).getTime();
  const min = Math.max(0, Math.floor(ms / 60000));
  if (min < 1) return "recién";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}
