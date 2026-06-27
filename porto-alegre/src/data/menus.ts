import type { MenuMesa } from "../tipos";
import { formatCLP } from "../util/dinero";

/**
 * Menús buffet por persona — mismos valores y desglose que la app de
 * reservas (MESALISTA): el precio del menú aplica a cada adulto y los
 * niños pagan tarifa fija según tramo (menores de 3 no pagan).
 */

export type MenuId =
  | "BUFFET"
  | "BUFFET_APERITIVO_VINO"
  | "BUFFET_APERITIVO_VINO_BEBIDA"
  | "BUFFET_APERITIVO_VINO_BEBIDA_TRAGO";

export interface MenuBuffet {
  id: MenuId;
  nombre: string;
  precioAdulto: number; // CLP por adulto
}

export const MENUS: MenuBuffet[] = [
  { id: "BUFFET", nombre: "Buffet", precioAdulto: 20990 },
  {
    id: "BUFFET_APERITIVO_VINO",
    nombre: "Buffet + Aperitivo + Vino",
    precioAdulto: 25500,
  },
  {
    id: "BUFFET_APERITIVO_VINO_BEBIDA",
    nombre: "Buffet + Aperitivo + Vino + Bebida",
    precioAdulto: 27700,
  },
  {
    id: "BUFFET_APERITIVO_VINO_BEBIDA_TRAGO",
    nombre: "Buffet + Aperitivo + Vino + Bebida + Trago",
    precioAdulto: 30900,
  },
];

export const PRECIO_NINO_6_11 = 9990;
export const PRECIO_NINO_3_5 = 4990;

export function getMenuBuffet(id: MenuId): MenuBuffet {
  const menu = MENUS.find((m) => m.id === id);
  if (!menu) throw new Error(`Menú desconocido: ${id}`);
  return menu;
}

export function totalMenu(menu: MenuMesa | null): number {
  if (!menu) return 0;
  return (
    menu.adultos * getMenuBuffet(menu.menuId).precioAdulto +
    menu.ninos6a11 * PRECIO_NINO_6_11 +
    menu.ninos3a5 * PRECIO_NINO_3_5
  );
}

export interface LineaDesglose {
  texto: string;
  monto: number;
}

/** Líneas "N x concepto = $monto" del menú, como en la app de reservas. */
export function desgloseMenu(menu: MenuMesa | null): LineaDesglose[] {
  if (!menu) return [];
  const precioAdulto = getMenuBuffet(menu.menuId).precioAdulto;
  const lineas: LineaDesglose[] = [];
  if (menu.adultos > 0) {
    lineas.push({
      texto: `${menu.adultos} x Adulto (${formatCLP(precioAdulto)} c/u)`,
      monto: menu.adultos * precioAdulto,
    });
  }
  if (menu.ninos6a11 > 0) {
    lineas.push({
      texto: `${menu.ninos6a11} x Niño 6-11 (${formatCLP(PRECIO_NINO_6_11)} c/u)`,
      monto: menu.ninos6a11 * PRECIO_NINO_6_11,
    });
  }
  if (menu.ninos3a5 > 0) {
    lineas.push({
      texto: `${menu.ninos3a5} x Niño 3-5 (${formatCLP(PRECIO_NINO_3_5)} c/u)`,
      monto: menu.ninos3a5 * PRECIO_NINO_3_5,
    });
  }
  return lineas;
}
