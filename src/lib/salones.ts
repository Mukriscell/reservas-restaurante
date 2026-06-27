/** Salones disponibles para asignar a una mesa (elección opcional). */

export const SALONES = [
  "Salón Eventos",
  "Salón 1",
  "Salón 2",
  "2do Piso",
  "Terraza Techada",
] as const;

export type Salon = (typeof SALONES)[number];

export const SIN_SALON = "Sin preferencia" as const;
