import type { Atencion, Mesa } from "../tipos";

/**
 * Estado VISUAL de una mesa en el plano de salón (POS). Se deriva solo de
 * los datos que ya existen — no cambia la lógica ni la base de datos:
 *
 *   - libre        Verde   · mesa DISPONIBLE
 *   - reservada    Morado  · marca externa, futura integración con MESALISTA
 *   - consumiendo  Amarillo· cuenta abierta en curso
 *   - por_pagar    Rojo    · cuenta abierta que ya empezó a pagarse (hay abonos)
 *   - cerrada      Gris    · atención ya PAGADA aún referenciada (transitorio)
 */
export type EstadoVisual =
  | "libre"
  | "consumiendo"
  | "por_pagar"
  | "cerrada"
  | "reservada";

export function estadoVisualMesa(
  mesa: Mesa,
  atencion: Atencion | null,
  reservada = false
): EstadoVisual {
  if (mesa.estado === "DISPONIBLE") return reservada ? "reservada" : "libre";
  if (!atencion) return "consumiendo";
  if (atencion.estado === "PAGADA") return "cerrada";
  return atencion.totalAbonos > 0 ? "por_pagar" : "consumiendo";
}

/** Etiqueta singular para la tarjeta de mesa. */
export const ETIQUETA_ESTADO: Record<EstadoVisual, string> = {
  libre: "Libre",
  consumiendo: "Consumiendo",
  por_pagar: "Por pagar",
  cerrada: "Cerrada",
  reservada: "Reservada",
};

/** Color del punto/indicador por estado (leyenda y filtros). */
export const PUNTO_ESTADO: Record<EstadoVisual, string> = {
  libre: "bg-verde-500",
  consumiendo: "bg-amarillo-400",
  por_pagar: "bg-red-500",
  cerrada: "bg-zinc-400",
  reservada: "bg-violet-500",
};

/** Orden de presentación en la leyenda/filtros, con etiqueta en plural. */
export const ESTADOS_ORDEN: { estado: EstadoVisual; plural: string }[] = [
  { estado: "libre", plural: "Libres" },
  { estado: "consumiendo", plural: "Consumiendo" },
  { estado: "por_pagar", plural: "Por pagar" },
  { estado: "reservada", plural: "Reservadas" },
  { estado: "cerrada", plural: "Cerradas" },
];
