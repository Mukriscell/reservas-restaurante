import type { MenuId } from "./menu";
import type { Salon } from "./salones";

/** Reserva persistida. */
export interface Reserva {
  id: string;
  creadaEn: string; // ISO 8601
  nombreEncargado: string;
  telefono?: string;
  fecha: string; // AAAA-MM-DD
  hora: string; // HH:MM
  adultos: number;
  ninos6a11: number;
  ninos3a5: number;
  menuId: MenuId;
  salon?: Salon;
  accesibilidad: boolean;
  detalles: string;
  totalEstimado: number; // CLP
}
