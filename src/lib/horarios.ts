/**
 * Horarios de ingreso del restaurante.
 *
 * Se reciben reservas solo viernes, sábado y domingo:
 *  - Viernes: cena de 18:30 a 22:15.
 *  - Sábado y domingo: almuerzo de 12:45 a 16:15 y cena de 18:30 a 22:15.
 */

export interface Servicio {
  id: "ALMUERZO" | "CENA";
  nombre: string;
  desde: string; // primera hora de ingreso (HH:MM)
  hasta: string; // última hora de ingreso (HH:MM)
}

export const ALMUERZO: Servicio = {
  id: "ALMUERZO",
  nombre: "Almuerzo",
  desde: "12:45",
  hasta: "16:15",
};

export const CENA: Servicio = {
  id: "CENA",
  nombre: "Cena",
  desde: "18:30",
  hasta: "22:15",
};

/** Días con atención y sus servicios, para mostrar en la web y el Excel. */
export const DIAS_ATENCION: { nombre: string; servicios: Servicio[] }[] = [
  { nombre: "Viernes", servicios: [CENA] },
  { nombre: "Sábado", servicios: [ALMUERZO, CENA] },
  { nombre: "Domingo", servicios: [ALMUERZO, CENA] },
];

/** Servicios por día de la semana (0 = domingo … 6 = sábado). */
const SERVICIOS_POR_DIA: Record<number, Servicio[]> = {
  5: [CENA],
  6: [ALMUERZO, CENA],
  0: [ALMUERZO, CENA],
};

const NOMBRES_DIA = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
];

/** Día de la semana de una fecha AAAA-MM-DD, sin depender de la zona horaria. */
export function diaSemana(fecha: string): number {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function nombreDia(fecha: string): string {
  return NOMBRES_DIA[diaSemana(fecha)];
}

/** Servicios disponibles para una fecha; vacío si ese día no hay atención. */
export function serviciosParaFecha(fecha: string): Servicio[] {
  return SERVICIOS_POR_DIA[diaSemana(fecha)] ?? [];
}

function aMinutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

/** Servicio cuya ventana de ingreso contiene la fecha/hora dada, si existe. */
export function servicioParaReserva(
  fecha: string,
  hora: string
): Servicio | undefined {
  const min = aMinutos(hora);
  return serviciosParaFecha(fecha).find(
    (s) => min >= aMinutos(s.desde) && min <= aMinutos(s.hasta)
  );
}

/** Horas de ingreso de un servicio, en pasos de 15 minutos. */
export function horasDeIngreso(servicio: Servicio): string[] {
  const horas: string[] = [];
  for (
    let m = aMinutos(servicio.desde);
    m <= aMinutos(servicio.hasta);
    m += 15
  ) {
    const hh = String(Math.floor(m / 60)).padStart(2, "0");
    const mm = String(m % 60).padStart(2, "0");
    horas.push(`${hh}:${mm}`);
  }
  return horas;
}
