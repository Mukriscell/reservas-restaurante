import type { MenuId } from "./data/menus";

/**
 * MODELO OPERACIONAL:
 *  - Las MESAS son permanentes (1 a 100): nunca se crean ni se borran,
 *    solo alternan entre DISPONIBLE y OCUPADA.
 *  - Cada ocupación crea una ATENCIÓN; consumos y abonos cuelgan de la
 *    atención. Al pagar, la atención se cierra (PAGADA) y queda como
 *    historial; la mesa vuelve a DISPONIBLE.
 *  - Todo reporte histórico sale de atenciones/consumos/abonos.
 */

export type EstadoMesa = "DISPONIBLE" | "OCUPADA";
export type EstadoAtencion = "PENDIENTE" | "PAGADA";

export interface Mesa {
  id: string;
  numero: number;
  estado: EstadoMesa;
  /** Atención PENDIENTE en curso; null si la mesa está libre. */
  atencionActualId: string | null;
}

export interface Garzon {
  id: string;
  nombre: string;
  activo: boolean;
}

/** Menú buffet asignado a la atención (mismo desglose que MESALISTA). */
export interface MenuMesa {
  menuId: MenuId;
  adultos: number;
  ninos6a11: number;
  ninos3a5: number;
}

export interface Atencion {
  id: string;
  /** Correlativo humano: "Atención #145". */
  numero: number;
  mesaId: string;
  garzonId: string | null;
  estado: EstadoAtencion;
  fechaApertura: string; // ISO 8601
  fechaCierre: string | null;
  menu: MenuMesa | null;
  /** Totales CLP mantenidos en cada mutación; congelados al cerrar. */
  totalMenu: number;
  totalConsumos: number;
  totalAbonos: number;
  saldoFinal: number;
}

export interface Producto {
  id: string;
  nombre: string;
  categoria: string;
  precio: number; // CLP
}

export interface Consumo {
  id: string;
  atencionId: string;
  productoId: string;
  cantidad: number;
  precioUnitario: number; // CLP
  subtotal: number; // CLP = cantidad × precioUnitario
}

export interface Abono {
  id: string;
  atencionId: string;
  monto: number; // CLP
  observacion: string;
  garzonId: string | null;
  creadoEn: string; // ISO 8601
}

/** Total de la cuenta (menú + consumos) de una atención. */
export function totalCuenta(a: Atencion): number {
  return a.totalMenu + a.totalConsumos;
}

/** Saldo pendiente: total de la cuenta menos lo ya abonado. */
export function saldoPendiente(a: Atencion): number {
  return totalCuenta(a) - a.totalAbonos;
}
