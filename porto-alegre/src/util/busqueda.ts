/**
 * Normaliza para busqueda: minusculas y sin tildes/dieresis, de modo que
 * "moji" encuentre "Mojito Jager" y "daiq" encuentre "Daiquiri".
 */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Coincidencia parcial, sin distinguir mayusculas ni acentos. */
export function coincide(texto: string, consulta: string): boolean {
  return normalizar(texto).includes(normalizar(consulta));
}
