import { describe, it, expect } from "vitest";
import { reducer } from "./contexto";
import type { EstadoApp } from "../db/almacen";
import { getMenuBuffet } from "../data/menus";

const PRODUCTO = "heineken"; // "Heineken" → $3.800
const PRECIO = 3800;

function estadoBase(): EstadoApp {
  return {
    mesas: [
      {
        id: "mesa-1",
        numeroMesa: 1,
        estado: "PENDIENTE",
        total: 0,
        fechaApertura: null,
        fechaCierre: null,
        menu: null,
      },
    ],
    consumos: [],
  };
}

describe("reducer · consumos", () => {
  it("AGREGAR_PRODUCTO crea la línea, abre la mesa y suma el total", () => {
    const e = reducer(estadoBase(), {
      tipo: "AGREGAR_PRODUCTO",
      mesaId: "mesa-1",
      productoId: PRODUCTO,
    });
    expect(e.consumos).toHaveLength(1);
    expect(e.consumos[0].cantidad).toBe(1);
    expect(e.mesas[0].total).toBe(PRECIO);
    expect(e.mesas[0].fechaApertura).not.toBeNull();
  });

  it("AGREGAR_PRODUCTO repetido incrementa la cantidad, no duplica la línea", () => {
    let e = reducer(estadoBase(), {
      tipo: "AGREGAR_PRODUCTO",
      mesaId: "mesa-1",
      productoId: PRODUCTO,
    });
    e = reducer(e, { tipo: "AGREGAR_PRODUCTO", mesaId: "mesa-1", productoId: PRODUCTO });
    expect(e.consumos).toHaveLength(1);
    expect(e.consumos[0].cantidad).toBe(2);
    expect(e.mesas[0].total).toBe(2 * PRECIO);
  });

  it("CAMBIAR_CANTIDAD nunca baja de 1", () => {
    let e = reducer(estadoBase(), {
      tipo: "AGREGAR_PRODUCTO",
      mesaId: "mesa-1",
      productoId: PRODUCTO,
    });
    const consumoId = e.consumos[0].id;
    e = reducer(e, { tipo: "CAMBIAR_CANTIDAD", mesaId: "mesa-1", consumoId, delta: -1 });
    expect(e.consumos[0].cantidad).toBe(1);
  });
});

describe("reducer · menú y ciclo de la mesa", () => {
  it("FIJAR_MENU recalcula el total con menú + consumos", () => {
    let e = reducer(estadoBase(), {
      tipo: "AGREGAR_PRODUCTO",
      mesaId: "mesa-1",
      productoId: PRODUCTO,
    });
    e = reducer(e, {
      tipo: "FIJAR_MENU",
      mesaId: "mesa-1",
      menu: { menuId: "BUFFET", adultos: 2, ninos6a11: 0, ninos3a5: 0 },
    });
    expect(e.mesas[0].total).toBe(PRECIO + 2 * getMenuBuffet("BUFFET").precioAdulto);
  });

  it("una mesa PAGADA es de solo lectura ante mutaciones de cuenta", () => {
    let e = reducer(estadoBase(), {
      tipo: "AGREGAR_PRODUCTO",
      mesaId: "mesa-1",
      productoId: PRODUCTO,
    });
    e = reducer(e, { tipo: "MARCAR_PAGADA", mesaId: "mesa-1" });
    expect(e.mesas[0].estado).toBe("PAGADA");
    const tras = reducer(e, {
      tipo: "AGREGAR_PRODUCTO",
      mesaId: "mesa-1",
      productoId: PRODUCTO,
    });
    expect(tras).toBe(e); // sin cambios
  });

  it("NUEVA_CUENTA limpia consumos, menú y deja la mesa en $0 pendiente", () => {
    let e = reducer(estadoBase(), {
      tipo: "AGREGAR_PRODUCTO",
      mesaId: "mesa-1",
      productoId: PRODUCTO,
    });
    e = reducer(e, { tipo: "MARCAR_PAGADA", mesaId: "mesa-1" });
    e = reducer(e, { tipo: "NUEVA_CUENTA", mesaId: "mesa-1" });
    expect(e.consumos).toHaveLength(0);
    expect(e.mesas[0].estado).toBe("PENDIENTE");
    expect(e.mesas[0].total).toBe(0);
    expect(e.mesas[0].menu).toBeNull();
  });
});
