import type { MenuId } from "./menu";
import type { Salon } from "./salones";

export type EstadoReserva = "CONFIRMADA" | "CANCELADA";

/** Reserva persistida. */
export interface Reserva {
  id: string;
  creadaEn: string; // ISO 8601
  estado: EstadoReserva;
  nombreEncargado: string;
  email: string; // recibe la confirmación y el enlace de gestión
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
  abono: number; // CLP abonado al reservar; se descuenta del total de la cuenta
  totalEstimado: number; // CLP
}
