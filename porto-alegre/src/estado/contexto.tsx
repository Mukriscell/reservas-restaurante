import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
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
import {
  MODO_COMPARTIDO,
  ErrorRpc,
  cargarMesa,
  cargarTodo,
  getCliente,
  mapConsumo,
  mapMesa,
  rpc,
  type FilaConsumo,
  type FilaMesa,
} from "../sync/supabase";

/**
 * Estado global de la app.
 *
 * MODO LOCAL (sin Supabase): el reducer es la fuente de verdad y se
 * persiste en localStorage.
 *
 * MODO COMPARTIDO (Supabase): cada mutación se aplica primero en local
 * (optimistic update) y se confirma con una RPC transaccional; los
 * eventos Realtime de todos los garzones llegan como acciones APLICAR_*
 * con los valores autoritativos del servidor. Si una RPC es rechazada
 * (p. ej. la mesa ya fue cerrada), se avisa y se revalida esa mesa.
 */

type Accion =
  // Mutaciones de negocio (modo local + capa optimista del compartido)
  | { tipo: "AGREGAR_PRODUCTO"; mesaId: string; productoId: string }
  | { tipo: "CAMBIAR_CANTIDAD"; mesaId: string; consumoId: string; delta: 1 | -1 }
  | { tipo: "ELIMINAR_CONSUMO"; mesaId: string; consumoId: string }
  | { tipo: "FIJAR_MENU"; mesaId: string; menu: MenuMesa | null }
  | { tipo: "MARCAR_PAGADA"; mesaId: string }
  | { tipo: "REABRIR"; mesaId: string }
  | { tipo: "NUEVA_CUENTA"; mesaId: string }
  // Sincronización (valores autoritativos del servidor)
  | { tipo: "CARGAR_ESTADO"; estado: EstadoApp }
  | { tipo: "APLICAR_MESA"; mesa: Mesa }
  | { tipo: "APLICAR_CONSUMO"; consumo: ConsumoMesa }
  | { tipo: "QUITAR_CONSUMO"; consumoId: string }
  | { tipo: "REEMPLAZAR_CONSUMOS_MESA"; mesaId: string; consumos: ConsumoMesa[] };

const MAX_CANTIDAD = 99;

function consumosDeMesa(consumos: ConsumoMesa[], mesaId: string): ConsumoMesa[] {
  return consumos.filter((c) => c.mesaId === mesaId);
}

/** Recalcula el total (menú + consumos) de la mesa indicada. */
function conTotal(mesa: Mesa, consumos: ConsumoMesa[]): Mesa {
  return {
    ...mesa,
    total:
      totalMenu(mesa.menu) +
      consumosDeMesa(consumos, mesa.id).reduce((s, c) => s + c.subtotal, 0),
  };
}

function reemplazarMesa(estado: EstadoApp, mesa: Mesa): EstadoApp {
  return {
    ...estado,
    mesas: estado.mesas.map((m) => (m.id === mesa.id ? mesa : m)),
  };
}

function conApertura(mesa: Mesa): Mesa {
  return {
    ...mesa,
    fechaApertura: mesa.fechaApertura ?? new Date().toISOString(),
  };
}

export function reducer(estado: EstadoApp, accion: Accion): EstadoApp {
  switch (accion.tipo) {
    /* ------------------- sincronización (autoritativa) ------------------ */

    case "CARGAR_ESTADO": {
      const { mesas, consumos } = accion.estado;
      return { mesas: mesas.map((m) => conTotal(m, consumos)), consumos };
    }

    case "APLICAR_MESA": {
      if (!estado.mesas.some((m) => m.id === accion.mesa.id)) return estado;
      return reemplazarMesa(estado, conTotal(accion.mesa, estado.consumos));
    }

    case "APLICAR_CONSUMO": {
      const existe = estado.consumos.some((c) => c.id === accion.consumo.id);
      const consumos = existe
        ? estado.consumos.map((c) => (c.id === accion.consumo.id ? accion.consumo : c))
        : [...estado.consumos, accion.consumo];
      const mesa = estado.mesas.find((m) => m.id === accion.consumo.mesaId);
      const conConsumos = { ...estado, consumos };
      return mesa ? reemplazarMesa(conConsumos, conTotal(mesa, consumos)) : conConsumos;
    }

    case "QUITAR_CONSUMO": {
      const quitado = estado.consumos.find((c) => c.id === accion.consumoId);
      if (!quitado) return estado;
      const consumos = estado.consumos.filter((c) => c.id !== accion.consumoId);
      const mesa = estado.mesas.find((m) => m.id === quitado.mesaId);
      const conConsumos = { ...estado, consumos };
      return mesa ? reemplazarMesa(conConsumos, conTotal(mesa, consumos)) : conConsumos;
    }

    case "REEMPLAZAR_CONSUMOS_MESA": {
      const consumos = [
        ...estado.consumos.filter((c) => c.mesaId !== accion.mesaId),
        ...accion.consumos,
      ];
      const mesa = estado.mesas.find((m) => m.id === accion.mesaId);
      const conConsumos = { ...estado, consumos };
      return mesa ? reemplazarMesa(conConsumos, conTotal(mesa, consumos)) : conConsumos;
    }

    /* ----------------------- mutaciones de negocio ---------------------- */

    default: {
      const mesa = estado.mesas.find((m) => m.id === accion.mesaId);
      if (!mesa) return estado;

      // Una mesa PAGADA es de solo lectura: solo reabrir o cuenta nueva.
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
            conTotal(conApertura(mesa), consumos)
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
          return reemplazarMesa({ ...estado, consumos }, conTotal(mesa, consumos));
        }

        case "ELIMINAR_CONSUMO": {
          const consumos = estado.consumos.filter(
            (c) => !(c.id === accion.consumoId && c.mesaId === mesa.id)
          );
          return reemplazarMesa({ ...estado, consumos }, conTotal(mesa, consumos));
        }

        case "FIJAR_MENU": {
          const base = { ...mesa, menu: accion.menu };
          const abierta = accion.menu ? conApertura(base) : base;
          return reemplazarMesa(estado, conTotal(abierta, estado.consumos));
        }

        case "MARCAR_PAGADA":
          return reemplazarMesa(estado, {
            ...mesa,
            estado: "PAGADA",
            fechaCierre: new Date().toISOString(),
          });

        case "REABRIR":
          return reemplazarMesa(estado, {
            ...mesa,
            estado: "PENDIENTE",
            fechaCierre: null,
          });

        case "NUEVA_CUENTA": {
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
  }
}

/* ------------------------------ Contextos ------------------------------ */

export type EstadoConexion = "local" | "conectando" | "online" | "offline";

export interface AvisoApp {
  id: number;
  texto: string;
  tono: "error" | "exito";
}

export interface AccionesApp {
  agregarProducto(mesaId: string, productoId: string): void;
  cambiarCantidad(mesaId: string, consumoId: string, delta: 1 | -1): void;
  eliminarConsumo(mesaId: string, consumoId: string): void;
  fijarMenu(mesaId: string, menu: MenuMesa | null): void;
  /** false si la mesa ya había sido cerrada por otro garzón (Caso 2). */
  marcarPagada(mesaId: string): Promise<boolean>;
  reabrirMesa(mesaId: string): Promise<void>;
  nuevaCuenta(mesaId: string): Promise<void>;
}

const CtxEstado = createContext<EstadoApp | null>(null);
const CtxAcciones = createContext<AccionesApp | null>(null);
const CtxConexion = createContext<EstadoConexion>("local");
const CtxAviso = createContext<{
  aviso: AvisoApp | null;
  cerrarAviso: () => void;
} | null>(null);

export function ProveedorApp({ children }: { children: ReactNode }) {
  // El cache local arranca la UI al instante en ambos modos.
  const [estado, dispatch] = useReducer(reducer, undefined, cargarEstado);
  const [conexion, setConexion] = useState<EstadoConexion>(
    MODO_COMPARTIDO ? "conectando" : "local"
  );
  const [aviso, setAviso] = useState<AvisoApp | null>(null);

  const estadoRef = useRef(estado);
  estadoRef.current = estado;
  const conexionRef = useRef(conexion);
  conexionRef.current = conexion;

  // Cache local: persistencia (modo local) o vista offline (compartido).
  useEffect(() => {
    guardarEstado(estado);
  }, [estado]);

  const avisar = useCallback((texto: string, tono: AvisoApp["tono"] = "error") => {
    setAviso({ id: Date.now(), texto, tono });
  }, []);
  const cerrarAviso = useCallback(() => setAviso(null), []);

  /* ------------------ Realtime + carga inicial (compartido) ------------ */
  useEffect(() => {
    if (!MODO_COMPARTIDO) return;
    let activo = true;

    const refrescar = () => {
      cargarTodo()
        .then((e) => {
          if (activo) dispatch({ tipo: "CARGAR_ESTADO", estado: e });
        })
        .catch(() => {
          if (activo) setConexion("offline");
        });
    };
    refrescar();

    const canal = getCliente()
      .channel("porto-alegre-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "mesas" },
        (p) => {
          if (p.new && "id" in p.new) {
            dispatch({ tipo: "APLICAR_MESA", mesa: mapMesa(p.new as FilaMesa) });
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "consumos" },
        (p) => {
          if (p.eventType === "DELETE") {
            const viejo = p.old as { id?: string };
            if (viejo.id) dispatch({ tipo: "QUITAR_CONSUMO", consumoId: viejo.id });
          } else if (p.new && "id" in p.new) {
            dispatch({
              tipo: "APLICAR_CONSUMO",
              consumo: mapConsumo(p.new as FilaConsumo),
            });
          }
        }
      )
      .subscribe((status) => {
        if (!activo) return;
        if (status === "SUBSCRIBED") {
          setConexion("online");
          refrescar(); // revalidación completa en cada (re)conexión
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          setConexion("offline");
        }
      });

    const alCaer = () => setConexion("offline");
    window.addEventListener("offline", alCaer);
    return () => {
      activo = false;
      window.removeEventListener("offline", alCaer);
      void getCliente().removeChannel(canal);
    };
  }, []);

  /* --------------------------- Mutaciones ------------------------------ */

  const revalidarMesa = useCallback(async (mesaId: string) => {
    try {
      const datos = await cargarMesa(mesaId);
      if (datos) {
        dispatch({ tipo: "APLICAR_MESA", mesa: datos.mesa });
        dispatch({ tipo: "REEMPLAZAR_CONSUMOS_MESA", mesaId, consumos: datos.consumos });
      }
    } catch {
      // Sin conexión: el canal repondrá el estado al reconectar.
    }
  }, []);

  /** Optimistic update + RPC; ante rechazo: aviso y revalidación. */
  const optimista = useCallback(
    (accion: Accion, mesaId: string, llamada: () => Promise<unknown>) => {
      if (!MODO_COMPARTIDO) {
        dispatch(accion);
        return;
      }
      if (conexionRef.current !== "online") {
        avisar("Sin conexión: el cambio no se guardó, reintenta en un momento");
        return;
      }
      dispatch(accion);
      llamada().catch((e: unknown) => {
        avisar(e instanceof ErrorRpc ? e.message : "No se pudo guardar el cambio");
        void revalidarMesa(mesaId);
      });
    },
    [avisar, revalidarMesa]
  );

  /** Operación compare-and-set (cerrar/reabrir/nueva): sin optimismo. */
  const conBloqueo = useCallback(
    async (
      mesaId: string,
      accionLocal: Accion,
      fn: string
    ): Promise<boolean> => {
      if (!MODO_COMPARTIDO) {
        dispatch(accionLocal);
        return true;
      }
      if (conexionRef.current !== "online") {
        avisar("Sin conexión: inténtalo cuando vuelva la señal");
        return false;
      }
      try {
        const fila = await rpc<FilaMesa>(fn, { p_mesa_id: mesaId });
        dispatch({ tipo: "APLICAR_MESA", mesa: mapMesa(fila) });
        if (fn === "nueva_cuenta") {
          dispatch({ tipo: "REEMPLAZAR_CONSUMOS_MESA", mesaId, consumos: [] });
        }
        return true;
      } catch (e: unknown) {
        avisar(e instanceof ErrorRpc ? e.message : "No se pudo completar la operación");
        void revalidarMesa(mesaId);
        return false;
      }
    },
    [avisar, revalidarMesa]
  );

  const acciones = useMemo<AccionesApp>(
    () => ({
      agregarProducto(mesaId, productoId) {
        const producto = getProducto(productoId);
        optimista({ tipo: "AGREGAR_PRODUCTO", mesaId, productoId }, mesaId, () =>
          rpc("agregar_consumo", {
            p_mesa_id: mesaId,
            p_producto_id: productoId,
            p_precio_unitario: producto.precio,
            p_delta: 1,
          })
        );
      },
      cambiarCantidad(mesaId, consumoId, delta) {
        const consumo = estadoRef.current.consumos.find((c) => c.id === consumoId);
        if (!consumo) return;
        optimista({ tipo: "CAMBIAR_CANTIDAD", mesaId, consumoId, delta }, mesaId, () =>
          rpc("agregar_consumo", {
            p_mesa_id: mesaId,
            p_producto_id: consumo.productoId,
            p_precio_unitario: consumo.precioUnitario,
            p_delta: delta,
          })
        );
      },
      eliminarConsumo(mesaId, consumoId) {
        const consumo = estadoRef.current.consumos.find((c) => c.id === consumoId);
        if (!consumo) return;
        optimista({ tipo: "ELIMINAR_CONSUMO", mesaId, consumoId }, mesaId, () =>
          rpc("eliminar_consumo", {
            p_mesa_id: mesaId,
            p_producto_id: consumo.productoId,
          })
        );
      },
      fijarMenu(mesaId, menu) {
        optimista({ tipo: "FIJAR_MENU", mesaId, menu }, mesaId, () =>
          rpc("fijar_menu", {
            p_mesa_id: mesaId,
            p_menu_id: menu?.menuId ?? null,
            p_adultos: menu?.adultos ?? 0,
            p_ninos_6_11: menu?.ninos6a11 ?? 0,
            p_ninos_3_5: menu?.ninos3a5 ?? 0,
          })
        );
      },
      marcarPagada(mesaId) {
        return conBloqueo(mesaId, { tipo: "MARCAR_PAGADA", mesaId }, "cerrar_mesa");
      },
      async reabrirMesa(mesaId) {
        await conBloqueo(mesaId, { tipo: "REABRIR", mesaId }, "reabrir_mesa");
      },
      async nuevaCuenta(mesaId) {
        await conBloqueo(mesaId, { tipo: "NUEVA_CUENTA", mesaId }, "nueva_cuenta");
      },
    }),
    [optimista, conBloqueo]
  );

  const valorAviso = useMemo(() => ({ aviso, cerrarAviso }), [aviso, cerrarAviso]);

  return (
    <CtxEstado.Provider value={estado}>
      <CtxAcciones.Provider value={acciones}>
        <CtxConexion.Provider value={conexion}>
          <CtxAviso.Provider value={valorAviso}>{children}</CtxAviso.Provider>
        </CtxConexion.Provider>
      </CtxAcciones.Provider>
    </CtxEstado.Provider>
  );
}

/* -------------------------------- Hooks -------------------------------- */

export function useEstadoApp(): EstadoApp {
  const estado = useContext(CtxEstado);
  if (!estado) throw new Error("useEstadoApp requiere <ProveedorApp>");
  return estado;
}

export function useAcciones(): AccionesApp {
  const acciones = useContext(CtxAcciones);
  if (!acciones) throw new Error("useAcciones requiere <ProveedorApp>");
  return acciones;
}

export function useConexion(): EstadoConexion {
  return useContext(CtxConexion);
}

export function useAviso() {
  const ctx = useContext(CtxAviso);
  if (!ctx) throw new Error("useAviso requiere <ProveedorApp>");
  return ctx;
}

export function useMesa(mesaId: string): { mesa: Mesa; consumos: ConsumoMesa[] } {
  const { mesas, consumos } = useEstadoApp();
  const mesa = mesas.find((m) => m.id === mesaId);
  if (!mesa) throw new Error(`Mesa desconocida: ${mesaId}`);
  return { mesa, consumos: consumosDeMesa(consumos, mesaId) };
}
