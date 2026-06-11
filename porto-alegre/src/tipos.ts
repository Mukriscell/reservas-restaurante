import type { MenuId } from "./data/menus";

export type EstadoMesa = "PENDIENTE" | "PAGADA";

/** Menú buffet asignado a la mesa (mismo desglose que la app de reservas). */
export interface MenuMesa {
  menuId: MenuId;
  adultos: number;
  ninos6a11: number;
  ninos3a5: number;
}

export interface Mesa {
  id: string;
  numeroMesa: number;
  estado: EstadoMesa;
  total: number; // CLP: menú + consumos, recalculado en cada mutación
  fechaApertura: string | null; // ISO 8601
  fechaCierre: string | null; // ISO 8601
  menu: MenuMesa | null;
}

export interface Producto {
  id: string;
  nombre: string;
  categoria: string;
  precio: number; // CLP
}

export interface ConsumoMesa {
  id: string;
  mesaId: string;
  productoId: string;
  cantidad: number;
  precioUnitario: number; // CLP
  subtotal: number; // CLP = cantidad × precioUnitario
}
