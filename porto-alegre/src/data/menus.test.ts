import { describe, it, expect } from "vitest";
import {
  totalMenu,
  desgloseMenu,
  getMenuBuffet,
  PRECIO_NINO_6_11,
  PRECIO_NINO_3_5,
} from "./menus";

describe("totalMenu", () => {
  it("es 0 cuando no hay menú asignado", () => {
    expect(totalMenu(null)).toBe(0);
  });

  it("suma adultos por el precio del menú elegido", () => {
    const precio = getMenuBuffet("BUFFET").precioAdulto;
    expect(
      totalMenu({ menuId: "BUFFET", adultos: 3, ninos6a11: 0, ninos3a5: 0 })
    ).toBe(3 * precio);
  });

  it("aplica tarifa fija a los niños, sin importar el menú adulto", () => {
    const precio = getMenuBuffet("BUFFET_APERITIVO_VINO").precioAdulto;
    const total = totalMenu({
      menuId: "BUFFET_APERITIVO_VINO",
      adultos: 2,
      ninos6a11: 1,
      ninos3a5: 2,
    });
    expect(total).toBe(2 * precio + 1 * PRECIO_NINO_6_11 + 2 * PRECIO_NINO_3_5);
  });
});

describe("desgloseMenu", () => {
  it("omite las líneas con cantidad cero", () => {
    const lineas = desgloseMenu({
      menuId: "BUFFET",
      adultos: 2,
      ninos6a11: 0,
      ninos3a5: 0,
    });
    expect(lineas).toHaveLength(1);
    expect(lineas[0].monto).toBe(2 * getMenuBuffet("BUFFET").precioAdulto);
  });

  it("la suma del desglose coincide con totalMenu", () => {
    const menu = {
      menuId: "BUFFET_APERITIVO_VINO_BEBIDA" as const,
      adultos: 4,
      ninos6a11: 2,
      ninos3a5: 1,
    };
    const suma = desgloseMenu(menu).reduce((s, l) => s + l.monto, 0);
    expect(suma).toBe(totalMenu(menu));
  });
});
