import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  type Dispatch,
  type ReactNode,
} from "react";
import type { ConsumoMesa, Mesa, MenuMesa } from "../tipos";
import { getProducto } from "../data/catalogo";
import { totalMenu } from "../data/menus";
import {
  cargarEstado,
  guardarEstado,
  type EstadoApp,
} from "../db/almacen";

export type Accion =
  | { tipo: "AGREGAR_PRODUCTO"; mesaId: string; productoId: string }
  | { tipo: "CAMBIAR_CANTIDAD"; mesaId: string; consumoId: string; delta: 1 | -1 }
  | { tipo: "ELIMINAR_CONSUMO"; mesaId: string; consumoId: string }
  | { tipo: "FIJAR_MENU"; mesaId: string; menu: MenuMesa | null }
  | { tipo: "MARCAR_PAGADA"; mesaId: string }
  | { tipo: "REABRIR"; mesaId: string }
  | { tipo: "NUEVA_CUENTA"; mesaId: string };

const MAX_CANTIDAD = 99;

function consumosDeMesa(consumos: ConsumoMesa[], mesaId: string): ConsumoMesa[] {
  return consumos.filter((c) => c.mesaId === mesaId);
}

/** Recalcula el total (menú + consumos) y la fecha de apertura de la mesa. */
function actualizarMesa(mesa: Mesa, consumos: ConsumoMesa[]): Mesa {
  const total =
    totalMenu(mesa.menu) +
    consumosDeMesa(consumos, mesa.id).reduce((s, c) => s + c.subtotal, 0);
  const tieneActividad =
    mesa.menu !== null || consumosDeMesa(consumos, mesa.id).length > 0;
  return {
    ...mesa,
    total,
    fechaApertura:
      mesa.fechaApertura ?? (tieneActividad ? new Date().toISOString() : null),
  };
}

function reemplazarMesa(estado: EstadoApp, mesa: Mesa): EstadoApp {
  return {
    ...estado,
    mesas: estado.mesas.map((m) => (m.id === mesa.id ? mesa : m)),
  };
}

export function reducer(estado: EstadoApp, accion: Accion): EstadoApp {
  const mesa = estado.mesas.find((m) => m.id === accion.mesaId);
  if (!mesa) return estado;

  // Una mesa PAGADA es de solo lectura: solo se puede reabrir o iniciar
  // una cuenta nueva.
  const esMutacionDeCuenta =
    accion.tipo === "AGREGAR_PRODUCTO" ||
    accion.tipo === "CAMBIAR_CANTIDAD" ||
    accion.tipo === "ELIMINAR_CONSUMO" ||
    accion.tipo === "FIJAR_MENU" ||
    accion.tipo === "MARCAR_PAGADA";
  if (mesa.estado === "PAGADA" && esMutacionDeCuenta) return estado;

  switch (accion.tipo) {
    case "AGREGAR_PRODUCTO": {
      const existente = estado.consumos.find(
        (c) => c.mesaId === mesa.id && c.productoId === accion.productoId
      );
      let consumos: ConsumoMesa[];
      if (existente) {
        const cantidad = Math.min(existente.cantidad + 1, MAX_CANTIDAD);
        consumos = estado.consumos.map((c) =>
          c.id === existente.id
            ? { ...c, cantidad, subtotal: cantidad * c.precioUnitario }
            : c
        );
      } else {
        const producto = getProducto(accion.productoId);
        consumos = [
          ...estado.consumos,
          {
            id: `c-${mesa.id}-${producto.id}`,
            mesaId: mesa.id,
            productoId: producto.id,
            cantidad: 1,
            precioUnitario: producto.precio,
            subtotal: producto.precio,
          },
        ];
      }
      return reemplazarMesa(
        { ...estado, consumos },
        actualizarMesa(mesa, consumos)
      );
    }

    case "CAMBIAR_CANTIDAD": {
      const consumos = estado.consumos.map((c) => {
        if (c.id !== accion.consumoId || c.mesaId !== mesa.id) return c;
        const cantidad = Math.min(
          Math.max(c.cantidad + accion.delta, 1),
          MAX_CANTIDAD
        );
        return { ...c, cantidad, subtotal: cantidad * c.precioUnitario };
      });
      return reemplazarMesa(
        { ...estado, consumos },
        actualizarMesa(mesa, consumos)
      );
    }

    case "ELIMINAR_CONSUMO": {
      const consumos = estado.consumos.filter(
        (c) => !(c.id === accion.consumoId && c.mesaId === mesa.id)
      );
      return reemplazarMesa(
        { ...estado, consumos },
        actualizarMesa(mesa, consumos)
      );
    }

    case "FIJAR_MENU": {
      const conMenu = { ...mesa, menu: accion.menu };
      return reemplazarMesa(estado, actualizarMesa(conMenu, estado.consumos));
    }

    case "MARCAR_PAGADA":
      return reemplazarMesa(estado, {
        ...mesa,
        estado: "PAGADA",
        fechaCierre: new Date().toISOString(),
      });

    case "REABRIR":
      // Vuelve a PENDIENTE conservando la cuenta (pago marcado por error).
      return reemplazarMesa(estado, {
        ...mesa,
        estado: "PENDIENTE",
        fechaCierre: null,
      });

    case "NUEVA_CUENTA": {
      // Mesa pagada que recibe clientes nuevos: cuenta desde cero.
      const consumos = estado.consumos.filter((c) => c.mesaId !== mesa.id);
      return reemplazarMesa(
        { ...estado, consumos },
        {
          ...mesa,
          estado: "PENDIENTE",
          total: 0,
          fechaApertura: null,
          fechaCierre: null,
          menu: null,
        }
      );
    }
  }
}

const CtxEstado = createContext<EstadoApp | null>(null);
const CtxDispatch = createContext<Dispatch<Accion> | null>(null);

export function ProveedorApp({ children }: { children: ReactNode }) {
  const [estado, dispatch] = useReducer(reducer, undefined, cargarEstado);

  useEffect(() => {
    guardarEstado(estado);
  }, [estado]);

  return (
    <CtxEstado.Provider value={estado}>
      <CtxDispatch.Provider value={dispatch}>{children}</CtxDispatch.Provider>
    </CtxEstado.Provider>
  );
}

export function useEstadoApp(): EstadoApp {
  const estado = useContext(CtxEstado);
  if (!estado) throw new Error("useEstadoApp requiere <ProveedorApp>");
  return estado;
}

export function useDispatchApp(): Dispatch<Accion> {
  const dispatch = useContext(CtxDispatch);
  if (!dispatch) throw new Error("useDispatchApp requiere <ProveedorApp>");
  return dispatch;
}

export function useMesa(mesaId: string): {
  mesa: Mesa;
  consumos: ConsumoMesa[];
} {
  const { mesas, consumos } = useEstadoApp();
  const mesa = mesas.find((m) => m.id === mesaId);
  if (!mesa) throw new Error(`Mesa desconocida: ${mesaId}`);
  return { mesa, consumos: consumosDeMesa(consumos, mesaId) };
}
