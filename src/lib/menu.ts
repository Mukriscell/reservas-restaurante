/**
 * Catálogo de menús y precios del restaurante (CLP).
 *
 * Precios por persona adulta según tipo de menú. Los niños pagan
 * tarifa fija de buffet según su tramo de edad, independiente del
 * menú elegido por los adultos.
 */

export const MENUS = [
  {
    id: "BUFFET",
    nombre: "Buffet",
    nombreCorto: "Buffet",
    descripcion: "Buffet libre",
    precioAdulto: 20990,
  },
  {
    id: "BUFFET_APERITIVO_VINO",
    nombre: "Buffet + Aperitivo + Vino",
    nombreCorto: "Buffet+Aper+Vino",
    descripcion: "Buffet libre, aperitivo de bienvenida y copa de vino",
    precioAdulto: 25500,
  },
  {
    id: "BUFFET_APERITIVO_VINO_BEBIDA",
    nombre: "Buffet + Aperitivo + Vino + Bebida",
    nombreCorto: "Buffet+Aper+Vino+Bebida",
    descripcion: "Buffet libre, aperitivo, copa de vino y bebida",
    precioAdulto: 27700,
  },
  {
    id: "BUFFET_APERITIVO_VINO_BEBIDA_TRAGO",
    nombre: "Buffet + Aperitivo + Vino + Bebida + Trago",
    nombreCorto: "Buffet+Aper+Vino+Beb+Trago",
    descripcion: "Buffet libre, aperitivo, copa de vino, bebida y trago",
    precioAdulto: 30900,
  },
] as const;

export type MenuId = (typeof MENUS)[number]["id"];

export const MENU_IDS = MENUS.map((m) => m.id) as [MenuId, ...MenuId[]];

/** Tarifas fijas para niños (cualquier menú). */
export const PRECIO_NINO_6_11 = 9990;
export const PRECIO_NINO_3_5 = 4990;

export function getMenu(id: MenuId) {
  const menu = MENUS.find((m) => m.id === id);
  if (!menu) throw new Error(`Menú desconocido: ${id}`);
  return menu;
}

export function calcularTotal(input: {
  menuId: MenuId;
  adultos: number;
  ninos6a11: number;
  ninos3a5: number;
}): number {
  const menu = getMenu(input.menuId);
  return (
    input.adultos * menu.precioAdulto +
    input.ninos6a11 * PRECIO_NINO_6_11 +
    input.ninos3a5 * PRECIO_NINO_3_5
  );
}

export function formatCLP(monto: number): string {
  return `$${monto.toLocaleString("es-CL")}`;
}
