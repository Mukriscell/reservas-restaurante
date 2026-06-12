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
import {
  saldoPendiente,
  totalCuenta,
  type Abono,
  type Atencion,
  type Consumo,
  type Garzon,
  type Mesa,
  type MenuMesa,
  type RegistroAuditoria,
  type RolGarzon,
} from "../tipos";
import { getProducto } from "../data/catalogo";
import { totalMenu } from "../data/menus";
import {
  cargarEstado,
  cargarGarzonId,
  guardarEstado,
  guardarGarzonId,
  MAX_AUDITORIA_LOCAL,
  type EstadoApp,
} from "../db/almacen";
import {
  MODO_COMPARTIDO,
  ErrorRpc,
  actualizarContrasena as authActualizarContrasena,
  cerrarSesionAuth,
  iniciarSesion as authIniciarSesion,
  recuperarContrasena as authRecuperarContrasena,
  registrarse as authRegistrarse,
  cargarAtencion,
  cargarHistorial as consultarHistorial,
  cargarMesa,
  cargarTodo,
  getCliente,
  mapAbono,
  mapAtencion,
  mapGarzon,
  mapMesa,
  mapConsumo,
  rpc,
  type FilaAbono,
  type FilaAtencion,
  type FilaConsumo,
  type FilaGarzon,
  type FilaMesa,
  type ResultadoAtencionMesa,
} from "../sync/supabase";

/**
 * Estado global de la app.
 *
 * MODELO: las MESAS son permanentes (solo DISPONIBLE/OCUPADA); cada
 * ocupación crea una ATENCIÓN a la que se asocian consumos y abonos.
 * Cerrar la atención congela sus totales (historial) y libera la mesa.
 *
 * MODO LOCAL (sin Supabase): el reducer es la fuente de verdad y se
 * persiste en localStorage, historial incluido.
 *
 * MODO COMPARTIDO (Supabase): los consumos y el menú se aplican primero
 * en local (optimistic update) y se confirman con una RPC transaccional;
 * abrir/cerrar/reabrir atenciones, abonos y garzones esperan la
 * confirmación del servidor (operaciones con bloqueo lógico). Los
 * eventos Realtime de todos los garzones llegan como acciones APLICAR_*
 * con los valores autoritativos del servidor.
 */

type Accion =
  // Mutaciones de negocio (modo local + capa optimista del compartido)
  | { tipo: "AGREGAR_PRODUCTO"; atencionId: string; productoId: string }
  | { tipo: "CAMBIAR_CANTIDAD"; atencionId: string; consumoId: string; delta: 1 | -1 }
  | { tipo: "ELIMINAR_CONSUMO"; atencionId: string; consumoId: string }
  | { tipo: "FIJAR_MENU"; atencionId: string; menu: MenuMesa | null }
  | { tipo: "TRANSFERIR_ATENCION"; atencionId: string; garzonId: string }
  // Mutaciones de negocio (solo modo local; en compartido las resuelve la RPC)
  | { tipo: "ABRIR_ATENCION"; atencion: Atencion }
  | { tipo: "CERRAR_ATENCION"; atencionId: string }
  | { tipo: "REABRIR_ATENCION"; atencionId: string }
  // Sincronización (valores autoritativos del servidor o altas locales)
  | { tipo: "CARGAR_ESTADO"; estado: EstadoApp }
  | { tipo: "APLICAR_MESA"; mesa: Mesa }
  | { tipo: "APLICAR_ATENCION"; atencion: Atencion }
  | { tipo: "APLICAR_CONSUMO"; consumo: Consumo }
  | { tipo: "QUITAR_CONSUMO"; consumoId: string }
  | { tipo: "APLICAR_ABONO"; abono: Abono }
  | { tipo: "QUITAR_ABONO"; abonoId: string }
  | { tipo: "APLICAR_GARZON"; garzon: Garzon }
  | { tipo: "AGREGAR_AUDITORIA"; registro: RegistroAuditoria }
  | {
      tipo: "REEMPLAZAR_DETALLE";
      atencionId: string;
      consumos: Consumo[];
      abonos: Abono[];
    };

const MAX_CANTIDAD = 99;

function consumosDe(consumos: Consumo[], atencionId: string): Consumo[] {
  return consumos.filter((c) => c.atencionId === atencionId);
}

function abonosDe(abonos: Abono[], atencionId: string): Abono[] {
  return abonos.filter((a) => a.atencionId === atencionId);
}

/**
 * Recalcula los totales vivos de una atención ABIERTA a partir de sus
 * filas. Las atenciones PAGADAS conservan sus totales congelados.
 */
function conTotales(
  atencion: Atencion,
  consumos: Consumo[],
  abonos: Abono[]
): Atencion {
  if (atencion.estado !== "PENDIENTE") return atencion;
  return {
    ...atencion,
    totalMenu: totalMenu(atencion.menu),
    totalConsumos: consumosDe(consumos, atencion.id).reduce(
      (s, c) => s + c.subtotal,
      0
    ),
    totalAbonos: abonosDe(abonos, atencion.id).reduce((s, a) => s + a.monto, 0),
  };
}

function conAtencion(estado: EstadoApp, atencion: Atencion): EstadoApp {
  return {
    ...estado,
    atenciones: { ...estado.atenciones, [atencion.id]: atencion },
  };
}

function recalcular(estado: EstadoApp, atencionId: string): EstadoApp {
  const atencion = estado.atenciones[atencionId];
  if (!atencion) return estado;
  return conAtencion(
    estado,
    conTotales(atencion, estado.consumos, estado.abonos)
  );
}

export function reducer(estado: EstadoApp, accion: Accion): EstadoApp {
  switch (accion.tipo) {
    /* ------------------- sincronización (autoritativa) ------------------ */

    case "CARGAR_ESTADO": {
      // El servidor manda mesas/garzones completos y las atenciones
      // ABIERTAS; se conserva el historial ya conocido (PAGADAS).
      const pagadas = Object.fromEntries(
        Object.entries(estado.atenciones).filter(([, a]) => a.estado === "PAGADA")
      );
      const conocidas = { ...pagadas, ...accion.estado.atenciones };
      return {
        mesas: accion.estado.mesas,
        garzones: accion.estado.garzones,
        // La auditoría local solo aplica en modo local; se conserva.
        auditoria: estado.auditoria,
        atenciones: conocidas,
        consumos: [
          ...estado.consumos.filter(
            (c) => pagadas[c.atencionId] && !accion.estado.atenciones[c.atencionId]
          ),
          ...accion.estado.consumos,
        ],
        abonos: [
          ...estado.abonos.filter(
            (a) => pagadas[a.atencionId] && !accion.estado.atenciones[a.atencionId]
          ),
          ...accion.estado.abonos,
        ],
      };
    }

    case "APLICAR_MESA": {
      if (!estado.mesas.some((m) => m.id === accion.mesa.id)) return estado;
      return {
        ...estado,
        mesas: estado.mesas.map((m) => (m.id === accion.mesa.id ? accion.mesa : m)),
      };
    }

    case "APLICAR_ATENCION":
      return conAtencion(estado, accion.atencion);

    case "APLICAR_GARZON": {
      const existe = estado.garzones.some((g) => g.id === accion.garzon.id);
      return {
        ...estado,
        garzones: existe
          ? estado.garzones.map((g) => (g.id === accion.garzon.id ? accion.garzon : g))
          : [...estado.garzones, accion.garzon],
      };
    }

    case "AGREGAR_AUDITORIA":
      // Append-only, igual que la tabla del servidor (con tope local).
      return {
        ...estado,
        auditoria: [...estado.auditoria, accion.registro].slice(-MAX_AUDITORIA_LOCAL),
      };

    case "APLICAR_CONSUMO": {
      const existe = estado.consumos.some((c) => c.id === accion.consumo.id);
      const consumos = existe
        ? estado.consumos.map((c) => (c.id === accion.consumo.id ? accion.consumo : c))
        : [...estado.consumos, accion.consumo];
      return recalcular({ ...estado, consumos }, accion.consumo.atencionId);
    }

    case "QUITAR_CONSUMO": {
      const quitado = estado.consumos.find((c) => c.id === accion.consumoId);
      if (!quitado) return estado;
      const consumos = estado.consumos.filter((c) => c.id !== accion.consumoId);
      return recalcular({ ...estado, consumos }, quitado.atencionId);
    }

    case "APLICAR_ABONO": {
      const existe = estado.abonos.some((a) => a.id === accion.abono.id);
      const abonos = existe
        ? estado.abonos.map((a) => (a.id === accion.abono.id ? accion.abono : a))
        : [...estado.abonos, accion.abono];
      return recalcular({ ...estado, abonos }, accion.abono.atencionId);
    }

    case "QUITAR_ABONO": {
      const quitado = estado.abonos.find((a) => a.id === accion.abonoId);
      if (!quitado) return estado;
      const abonos = estado.abonos.filter((a) => a.id !== accion.abonoId);
      return recalcular({ ...estado, abonos }, quitado.atencionId);
    }

    case "REEMPLAZAR_DETALLE": {
      const consumos = [
        ...estado.consumos.filter((c) => c.atencionId !== accion.atencionId),
        ...accion.consumos,
      ];
      const abonos = [
        ...estado.abonos.filter((a) => a.atencionId !== accion.atencionId),
        ...accion.abonos,
      ];
      return recalcular({ ...estado, consumos, abonos }, accion.atencionId);
    }

    /* --------------- ciclo de vida de la atención (modo local) ---------- */

    case "ABRIR_ATENCION": {
      const mesa = estado.mesas.find((m) => m.id === accion.atencion.mesaId);
      if (!mesa || mesa.estado === "OCUPADA") return estado;
      return {
        ...conAtencion(estado, accion.atencion),
        mesas: estado.mesas.map((m) =>
          m.id === mesa.id
            ? { ...m, estado: "OCUPADA", atencionActualId: accion.atencion.id }
            : m
        ),
      };
    }

    case "CERRAR_ATENCION": {
      const atencion = estado.atenciones[accion.atencionId];
      if (!atencion || atencion.estado !== "PENDIENTE") return estado;
      const viva = conTotales(atencion, estado.consumos, estado.abonos);
      const cerrada: Atencion = {
        ...viva,
        estado: "PAGADA",
        fechaCierre: new Date().toISOString(),
        saldoFinal: viva.totalMenu + viva.totalConsumos - viva.totalAbonos,
      };
      return {
        ...conAtencion(estado, cerrada),
        mesas: estado.mesas.map((m) =>
          m.id === atencion.mesaId
            ? { ...m, estado: "DISPONIBLE", atencionActualId: null }
            : m
        ),
      };
    }

    case "REABRIR_ATENCION": {
      const atencion = estado.atenciones[accion.atencionId];
      if (!atencion || atencion.estado !== "PAGADA") return estado;
      const mesa = estado.mesas.find((m) => m.id === atencion.mesaId);
      if (!mesa || mesa.estado === "OCUPADA") return estado;
      // Solo la última atención de la mesa se puede reabrir.
      const hayPosterior = Object.values(estado.atenciones).some(
        (a) => a.mesaId === atencion.mesaId && a.numero > atencion.numero
      );
      if (hayPosterior) return estado;
      const abierta: Atencion = {
        ...atencion,
        estado: "PENDIENTE",
        fechaCierre: null,
        saldoFinal: 0,
      };
      return {
        ...conAtencion(estado, abierta),
        mesas: estado.mesas.map((m) =>
          m.id === mesa.id
            ? { ...m, estado: "OCUPADA", atencionActualId: atencion.id }
            : m
        ),
      };
    }

    /* ----------------- mutaciones de la cuenta abierta ------------------ */

    default: {
      const atencion = estado.atenciones[accion.atencionId];
      // Una atención PAGADA es historial: de solo lectura.
      if (!atencion || atencion.estado !== "PENDIENTE") return estado;

      switch (accion.tipo) {
        case "AGREGAR_PRODUCTO": {
          const existente = estado.consumos.find(
            (c) => c.atencionId === atencion.id && c.productoId === accion.productoId
          );
          let consumos: Consumo[];
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
                id: `c-${atencion.id}-${producto.id}`,
                atencionId: atencion.id,
                productoId: producto.id,
                cantidad: 1,
                precioUnitario: producto.precio,
                subtotal: producto.precio,
              },
            ];
          }
          return recalcular({ ...estado, consumos }, atencion.id);
        }

        case "CAMBIAR_CANTIDAD": {
          const consumos = estado.consumos.map((c) => {
            if (c.id !== accion.consumoId || c.atencionId !== atencion.id) return c;
            const cantidad = Math.min(
              Math.max(c.cantidad + accion.delta, 1),
              MAX_CANTIDAD
            );
            return { ...c, cantidad, subtotal: cantidad * c.precioUnitario };
          });
          return recalcular({ ...estado, consumos }, atencion.id);
        }

        case "ELIMINAR_CONSUMO": {
          const consumos = estado.consumos.filter(
            (c) => !(c.id === accion.consumoId && c.atencionId === atencion.id)
          );
          return recalcular({ ...estado, consumos }, atencion.id);
        }

        case "FIJAR_MENU":
          return recalcular(
            conAtencion(estado, { ...atencion, menu: accion.menu }),
            atencion.id
          );

        case "TRANSFERIR_ATENCION":
          return conAtencion(estado, { ...atencion, garzonId: accion.garzonId });
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
  /** Garzón que opera este dispositivo (persistido localmente). */
  seleccionarGarzon(garzonId: string | null): void;
  crearGarzon(nombre: string): Promise<Garzon | null>;
  /** Devuelve el id de la atención creada, o null si la mesa ya fue ocupada. */
  abrirAtencion(mesaId: string): Promise<string | null>;
  agregarProducto(atencionId: string, productoId: string): void;
  cambiarCantidad(atencionId: string, consumoId: string, delta: 1 | -1): void;
  eliminarConsumo(atencionId: string, consumoId: string): void;
  fijarMenu(atencionId: string, menu: MenuMesa | null): void;
  agregarAbono(
    atencionId: string,
    monto: number,
    observacion: string
  ): Promise<boolean>;
  eliminarAbono(abonoId: string): Promise<void>;
  /** false si la atención ya había sido cerrada por otro garzón. */
  cerrarAtencion(atencionId: string): Promise<boolean>;
  reabrirAtencion(atencionId: string): Promise<boolean>;
  /** Traspasa la atención abierta a otro garzón (TRANSFERENCIA_MESA). */
  transferirAtencion(atencionId: string, garzonNuevoId: string): Promise<boolean>;
  /** Gestión de usuarios (solo ADMIN en la interfaz). */
  modificarGarzon(garzonId: string, nombre: string, rol: RolGarzon): Promise<boolean>;
  desactivarGarzon(garzonId: string): Promise<boolean>;
  /** Deja constancia GENERAR_PRECUENTA en la auditoría. */
  registrarPrecuenta(atencionId: string): void;
  /* ------ Autenticación por mesero (modo compartido, Supabase Auth) ----- */
  /** null si entró bien; si no, el error legible. Audita INICIO_SESION. */
  iniciarSesion(email: string, contrasena: string): Promise<string | null>;
  registrarse(
    nombre: string,
    email: string,
    contrasena: string,
    telefono: string
  ): Promise<{ error: string | null; requiereConfirmacion: boolean }>;
  /** Audita CIERRE_SESION y cierra la sesión de Supabase. */
  cerrarSesion(): Promise<void>;
  recuperarContrasena(email: string): Promise<string | null>;
  actualizarContrasena(nueva: string): Promise<string | null>;
}

/** Sesión del mesero en este dispositivo (modo compartido). */
export interface EstadoAuth {
  /** true mientras Supabase restaura la sesión persistida. */
  cargando: boolean;
  userId: string | null;
  email: string | null;
  /** El usuario llegó desde un enlace de recuperar contraseña. */
  recuperando: boolean;
  terminarRecuperacion(): void;
}

const CtxEstado = createContext<EstadoApp | null>(null);
const CtxAcciones = createContext<AccionesApp | null>(null);
const CtxConexion = createContext<EstadoConexion>("local");
const CtxGarzon = createContext<string | null>(null);
const CtxAuth = createContext<EstadoAuth | null>(null);
const CtxRevalidar = createContext<((atencionId: string) => Promise<void>) | null>(
  null
);
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
  // Modo local: garzón elegido en el dispositivo. Modo compartido: se
  // deriva del perfil de la sesión autenticada (Supabase Auth).
  const [garzonId, setGarzonId] = useState<string | null>(
    MODO_COMPARTIDO ? null : cargarGarzonId
  );
  const [aviso, setAviso] = useState<AvisoApp | null>(null);
  const [sesion, setSesion] = useState<{
    cargando: boolean;
    userId: string | null;
    email: string | null;
    recuperando: boolean;
  }>({ cargando: MODO_COMPARTIDO, userId: null, email: null, recuperando: false });

  const estadoRef = useRef(estado);
  estadoRef.current = estado;
  const conexionRef = useRef(conexion);
  conexionRef.current = conexion;
  const garzonRef = useRef(garzonId);
  garzonRef.current = garzonId;

  // Cache local: persistencia (modo local) o vista offline (compartido).
  useEffect(() => {
    guardarEstado(estado);
  }, [estado]);

  const avisar = useCallback((texto: string, tono: AvisoApp["tono"] = "error") => {
    setAviso({ id: Date.now(), texto, tono });
  }, []);
  const cerrarAviso = useCallback(() => setAviso(null), []);

  /* ----------------- Sesión por mesero (Supabase Auth) ----------------- */
  useEffect(() => {
    if (!MODO_COMPARTIDO) return;
    let activo = true;
    const sb = getCliente();
    void sb.auth.getSession().then(({ data }) => {
      if (!activo) return;
      setSesion((s) => ({
        ...s,
        cargando: false,
        userId: data.session?.user.id ?? null,
        email: data.session?.user.email ?? null,
      }));
    });
    const { data: suscripcion } = sb.auth.onAuthStateChange((evento, datos) => {
      if (!activo) return;
      setSesion((s) => ({
        cargando: false,
        userId: datos?.user.id ?? null,
        email: datos?.user.email ?? null,
        recuperando: evento === "PASSWORD_RECOVERY" ? true : s.recuperando,
      }));
    });
    return () => {
      activo = false;
      suscripcion.subscription.unsubscribe();
    };
  }, []);

  // El garzón del dispositivo ES el perfil de la cuenta autenticada.
  useEffect(() => {
    if (!MODO_COMPARTIDO) return;
    const perfil = estado.garzones.find(
      (g) => g.authUserId && g.authUserId === sesion.userId
    );
    setGarzonId(perfil?.id ?? null);
  }, [sesion.userId, estado.garzones]);

  /* ------------------ Realtime + carga inicial (compartido) ------------ */
  useEffect(() => {
    if (!MODO_COMPARTIDO) return;
    // Sin sesión no hay lecturas (RLS): el canal se monta al autenticarse.
    if (!sesion.userId) {
      setConexion("conectando");
      return;
    }
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
        { event: "*", schema: "public", table: "atenciones" },
        (p) => {
          if (p.new && "id" in p.new) {
            dispatch({
              tipo: "APLICAR_ATENCION",
              atencion: mapAtencion(p.new as FilaAtencion),
            });
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
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "abonos" },
        (p) => {
          if (p.eventType === "DELETE") {
            const viejo = p.old as { id?: string };
            if (viejo.id) dispatch({ tipo: "QUITAR_ABONO", abonoId: viejo.id });
          } else if (p.new && "id" in p.new) {
            dispatch({
              tipo: "APLICAR_ABONO",
              abono: mapAbono(p.new as FilaAbono),
            });
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "garzones" },
        (p) => {
          if (p.new && "id" in p.new) {
            dispatch({
              tipo: "APLICAR_GARZON",
              garzon: mapGarzon(p.new as FilaGarzon),
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
  }, [sesion.userId]);

  /* --------------------------- Mutaciones ------------------------------ */

  const revalidarAtencion = useCallback(async (atencionId: string) => {
    try {
      const datos = await cargarAtencion(atencionId);
      if (datos) {
        dispatch({ tipo: "APLICAR_ATENCION", atencion: datos.atencion });
        if (datos.mesa) dispatch({ tipo: "APLICAR_MESA", mesa: datos.mesa });
        dispatch({
          tipo: "REEMPLAZAR_DETALLE",
          atencionId,
          consumos: datos.consumos,
          abonos: datos.abonos,
        });
      }
    } catch {
      // Sin conexión: el canal repondrá el estado al reconectar.
    }
  }, []);

  const revalidarMesa = useCallback(async (mesaId: string) => {
    try {
      const datos = await cargarMesa(mesaId);
      if (!datos) return;
      dispatch({ tipo: "APLICAR_MESA", mesa: datos.mesa });
      if (datos.atencion) {
        dispatch({ tipo: "APLICAR_ATENCION", atencion: datos.atencion });
        dispatch({
          tipo: "REEMPLAZAR_DETALLE",
          atencionId: datos.atencion.id,
          consumos: datos.consumos,
          abonos: datos.abonos,
        });
      }
    } catch {
      // Sin conexión: el canal repondrá el estado al reconectar.
    }
  }, []);

  /** Optimistic update + RPC; ante rechazo: aviso y revalidación. */
  const optimista = useCallback(
    (accion: Accion, atencionId: string, llamada: () => Promise<unknown>) => {
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
        void revalidarAtencion(atencionId);
      });
    },
    [avisar, revalidarAtencion]
  );

  /** RPC con bloqueo lógico que devuelve atención + mesa autoritativas. */
  const rpcAtencionMesa = useCallback(
    async (
      fn: string,
      args: Record<string, unknown>
    ): Promise<Atencion | null> => {
      const r = await rpc<ResultadoAtencionMesa>(fn, args);
      const atencion = mapAtencion(r.atencion);
      dispatch({ tipo: "APLICAR_ATENCION", atencion });
      dispatch({ tipo: "APLICAR_MESA", mesa: mapMesa(r.mesa) });
      return atencion;
    },
    []
  );

  const sinConexion = useCallback((): boolean => {
    if (conexionRef.current !== "online") {
      avisar("Sin conexión: inténtalo cuando vuelva la señal");
      return true;
    }
    return false;
  }, [avisar]);

  /* --------------------------- Auditoría ------------------------------- */

  // En modo compartido la auditoría la escriben las funciones SQL dentro
  // de cada transacción; en modo local se replica aquí, append-only.
  const auditSeq = useRef(0);
  const auditarLocal = useCallback(
    (
      registro: Omit<
        RegistroAuditoria,
        "id" | "creadoEn" | "nombreUsuario" | "rolUsuario"
      >
    ) => {
      if (MODO_COMPARTIDO) return;
      const garzon = estadoRef.current.garzones.find(
        (g) => g.id === registro.usuarioId
      );
      auditSeq.current += 1;
      dispatch({
        tipo: "AGREGAR_AUDITORIA",
        registro: {
          ...registro,
          id: `aud-${Date.now()}-${auditSeq.current}`,
          creadoEn: new Date().toISOString(),
          nombreUsuario: garzon?.nombre ?? "sistema",
          rolUsuario: garzon?.rol ?? "",
        },
      });
    },
    []
  );

  const numeroDeMesa = useCallback((mesaId: string | null): number | null => {
    if (!mesaId) return null;
    return estadoRef.current.mesas.find((m) => m.id === mesaId)?.numero ?? null;
  }, []);

  /**
   * Cambio de garzón del dispositivo (SOLO modo local; en compartido la
   * identidad sale de la sesión autenticada). Audita inicio/cierre.
   */
  const seleccionar = useCallback(
    (nuevo: string | null) => {
      if (MODO_COMPARTIDO) return;
      const anterior = garzonRef.current;
      if (anterior === nuevo) return;
      const auditarSesion = (
        garzonId2: string,
        accion: "INICIO_SESION" | "CIERRE_SESION"
      ) => {
        auditarLocal({
          usuarioId: garzonId2,
          accion,
          entidad: "garzones",
          entidadId: garzonId2,
          mesaNumero: null,
          atencionId: null,
          valorAnterior: null,
          valorNuevo: null,
          observacion: "",
        });
      };
      if (anterior) auditarSesion(anterior, "CIERRE_SESION");
      if (nuevo) auditarSesion(nuevo, "INICIO_SESION");
      setGarzonId(nuevo);
      guardarGarzonId(nuevo);
    },
    [auditarLocal]
  );

  const acciones = useMemo<AccionesApp>(
    () => ({
      seleccionarGarzon(nuevo) {
        seleccionar(nuevo);
      },

      async crearGarzon(nombre) {
        const limpio = nombre.trim();
        if (limpio.length < 2 || limpio.length > 40) {
          avisar("El nombre debe tener entre 2 y 40 caracteres");
          return null;
        }
        if (!MODO_COMPARTIDO) {
          const existente = estadoRef.current.garzones.find(
            (g) => g.nombre.toLowerCase() === limpio.toLowerCase()
          );
          if (existente) return existente;
          const garzon: Garzon = {
            id: `g-l-${Date.now()}`,
            nombre: limpio,
            activo: true,
            rol: "GARZON",
          };
          auditarLocal({
            usuarioId: garzonRef.current,
            accion: "CREACION_USUARIO",
            entidad: "garzones",
            entidadId: garzon.id,
            mesaNumero: null,
            atencionId: null,
            valorAnterior: null,
            valorNuevo: { nombre: garzon.nombre, rol: garzon.rol },
            observacion: "",
          });
          dispatch({ tipo: "APLICAR_GARZON", garzon });
          return garzon;
        }
        if (sinConexion()) return null;
        try {
          const fila = await rpc<FilaGarzon>("crear_garzon", { p_nombre: limpio });
          const garzon = mapGarzon(fila);
          dispatch({ tipo: "APLICAR_GARZON", garzon });
          return garzon;
        } catch (e: unknown) {
          avisar(e instanceof ErrorRpc ? e.message : "No se pudo crear el garzón");
          return null;
        }
      },

      async modificarGarzon(garzonId2, nombre, rol) {
        const limpio = nombre.trim();
        if (limpio.length < 2 || limpio.length > 40) {
          avisar("El nombre debe tener entre 2 y 40 caracteres");
          return false;
        }
        if (!MODO_COMPARTIDO) {
          const garzon = estadoRef.current.garzones.find((g) => g.id === garzonId2);
          if (!garzon) return false;
          const duplicado = estadoRef.current.garzones.some(
            (g) => g.id !== garzonId2 && g.nombre.toLowerCase() === limpio.toLowerCase()
          );
          if (duplicado) {
            avisar("Ya existe un garzón con ese nombre");
            return false;
          }
          auditarLocal({
            usuarioId: garzonRef.current,
            accion: "MODIFICACION_USUARIO",
            entidad: "garzones",
            entidadId: garzonId2,
            mesaNumero: null,
            atencionId: null,
            valorAnterior: { nombre: garzon.nombre, rol: garzon.rol },
            valorNuevo: { nombre: limpio, rol },
            observacion: "",
          });
          dispatch({
            tipo: "APLICAR_GARZON",
            garzon: { ...garzon, nombre: limpio, rol },
          });
          return true;
        }
        if (sinConexion()) return false;
        try {
          const fila = await rpc<FilaGarzon>("modificar_garzon", {
            p_garzon_id: garzonId2,
            p_nombre: limpio,
            p_rol: rol,
          });
          dispatch({ tipo: "APLICAR_GARZON", garzon: mapGarzon(fila) });
          return true;
        } catch (e: unknown) {
          avisar(e instanceof ErrorRpc ? e.message : "No se pudo modificar el garzón");
          return false;
        }
      },

      async desactivarGarzon(garzonId2) {
        if (!MODO_COMPARTIDO) {
          const garzon = estadoRef.current.garzones.find((g) => g.id === garzonId2);
          if (!garzon || !garzon.activo) return false;
          auditarLocal({
            usuarioId: garzonRef.current,
            accion: "DESACTIVACION_USUARIO",
            entidad: "garzones",
            entidadId: garzonId2,
            mesaNumero: null,
            atencionId: null,
            valorAnterior: { activo: true },
            valorNuevo: { activo: false, nombre: garzon.nombre },
            observacion: "",
          });
          dispatch({ tipo: "APLICAR_GARZON", garzon: { ...garzon, activo: false } });
          if (garzonRef.current === garzonId2) seleccionar(null);
          return true;
        }
        if (sinConexion()) return false;
        try {
          const fila = await rpc<FilaGarzon>("desactivar_garzon", {
            p_garzon_id: garzonId2,
          });
          dispatch({ tipo: "APLICAR_GARZON", garzon: mapGarzon(fila) });
          if (garzonRef.current === garzonId2) seleccionar(null);
          return true;
        } catch (e: unknown) {
          avisar(e instanceof ErrorRpc ? e.message : "No se pudo desactivar el garzón");
          return false;
        }
      },

      async abrirAtencion(mesaId) {
        const garzon = garzonRef.current;
        if (!garzon) {
          avisar("Selecciona primero qué garzón atiende");
          return null;
        }
        if (!MODO_COMPARTIDO) {
          const numeros = Object.values(estadoRef.current.atenciones).map(
            (a) => a.numero
          );
          const numero = numeros.length ? Math.max(...numeros) + 1 : 1;
          const atencion: Atencion = {
            id: `a-${numero}`,
            numero,
            mesaId,
            garzonId: garzon,
            estado: "PENDIENTE",
            fechaApertura: new Date().toISOString(),
            fechaCierre: null,
            menu: null,
            totalMenu: 0,
            totalConsumos: 0,
            totalAbonos: 0,
            saldoFinal: 0,
          };
          const mesa = estadoRef.current.mesas.find((m) => m.id === mesaId);
          if (!mesa || mesa.estado === "OCUPADA") return null;
          auditarLocal({
            usuarioId: garzon,
            accion: "APERTURA_MESA",
            entidad: "atenciones",
            entidadId: atencion.id,
            mesaNumero: mesa.numero,
            atencionId: atencion.id,
            valorAnterior: { estadoMesa: "DISPONIBLE" },
            valorNuevo: { estadoMesa: "OCUPADA", atencion: numero },
            observacion: "",
          });
          dispatch({ tipo: "ABRIR_ATENCION", atencion });
          return atencion.id;
        }
        if (sinConexion()) return null;
        try {
          const atencion = await rpcAtencionMesa("abrir_atencion", { p_mesa_id: mesaId });
          return atencion?.id ?? null;
        } catch (e: unknown) {
          avisar(e instanceof ErrorRpc ? e.message : "No se pudo abrir la atención");
          void revalidarMesa(mesaId);
          return null;
        }
      },

      agregarProducto(atencionId, productoId) {
        const producto = getProducto(productoId);
        const atencion = estadoRef.current.atenciones[atencionId];
        if (atencion?.estado === "PENDIENTE") {
          const previo = estadoRef.current.consumos.find(
            (c) => c.atencionId === atencionId && c.productoId === productoId
          );
          const cantidad = Math.min((previo?.cantidad ?? 0) + 1, 99);
          if (!previo || cantidad !== previo.cantidad) {
            auditarLocal({
              usuarioId: garzonRef.current,
              accion: previo ? "MODIFICAR_CANTIDAD" : "AGREGAR_PRODUCTO",
              entidad: "consumos",
              entidadId: previo?.id ?? `c-${atencionId}-${productoId}`,
              mesaNumero: numeroDeMesa(atencion.mesaId),
              atencionId,
              valorAnterior: previo ? { cantidad: previo.cantidad } : null,
              valorNuevo: previo
                ? { producto: producto.nombre, cantidad }
                : {
                    producto: producto.nombre,
                    cantidad: 1,
                    precioUnitario: producto.precio,
                  },
              observacion: previo ? producto.nombre : "",
            });
          }
        }
        optimista(
          { tipo: "AGREGAR_PRODUCTO", atencionId, productoId },
          atencionId,
          () =>
            rpc("agregar_consumo", {
              p_atencion_id: atencionId,
              p_producto_id: productoId,
              p_producto_nombre: producto.nombre,
              p_precio_unitario: producto.precio,
              p_delta: 1,
            })
        );
      },

      cambiarCantidad(atencionId, consumoId, delta) {
        const consumo = estadoRef.current.consumos.find((c) => c.id === consumoId);
        if (!consumo) return;
        const producto = getProducto(consumo.productoId);
        const atencion = estadoRef.current.atenciones[atencionId];
        if (atencion?.estado === "PENDIENTE") {
          const cantidad = Math.min(Math.max(consumo.cantidad + delta, 1), 99);
          if (cantidad !== consumo.cantidad) {
            auditarLocal({
              usuarioId: garzonRef.current,
              accion: "MODIFICAR_CANTIDAD",
              entidad: "consumos",
              entidadId: consumoId,
              mesaNumero: numeroDeMesa(atencion.mesaId),
              atencionId,
              valorAnterior: { cantidad: consumo.cantidad },
              valorNuevo: { producto: producto.nombre, cantidad },
              observacion: producto.nombre,
            });
          }
        }
        optimista(
          { tipo: "CAMBIAR_CANTIDAD", atencionId, consumoId, delta },
          atencionId,
          () =>
            rpc("agregar_consumo", {
              p_atencion_id: atencionId,
              p_producto_id: consumo.productoId,
              p_producto_nombre: producto.nombre,
              p_precio_unitario: consumo.precioUnitario,
              p_delta: delta,
            })
        );
      },

      eliminarConsumo(atencionId, consumoId) {
        const consumo = estadoRef.current.consumos.find((c) => c.id === consumoId);
        if (!consumo) return;
        const producto = getProducto(consumo.productoId);
        const atencion = estadoRef.current.atenciones[atencionId];
        if (atencion?.estado === "PENDIENTE") {
          auditarLocal({
            usuarioId: garzonRef.current,
            accion: "ELIMINAR_PRODUCTO",
            entidad: "consumos",
            entidadId: consumoId,
            mesaNumero: numeroDeMesa(atencion.mesaId),
            atencionId,
            valorAnterior: {
              producto: producto.nombre,
              cantidad: consumo.cantidad,
              subtotal: consumo.subtotal,
            },
            valorNuevo: null,
            observacion: "",
          });
        }
        optimista(
          { tipo: "ELIMINAR_CONSUMO", atencionId, consumoId },
          atencionId,
          () =>
            rpc("eliminar_consumo", {
              p_atencion_id: atencionId,
              p_producto_id: consumo.productoId,
              p_producto_nombre: producto.nombre,
            })
        );
      },

      fijarMenu(atencionId, menu) {
        const atencion = estadoRef.current.atenciones[atencionId];
        if (atencion?.estado === "PENDIENTE") {
          auditarLocal({
            usuarioId: garzonRef.current,
            accion: "FIJAR_MENU",
            entidad: "atenciones",
            entidadId: atencionId,
            mesaNumero: numeroDeMesa(atencion.mesaId),
            atencionId,
            valorAnterior: {
              menu: atencion.menu?.menuId ?? null,
              totalMenu: atencion.totalMenu,
            },
            valorNuevo: { menu: menu?.menuId ?? null, totalMenu: totalMenu(menu) },
            observacion: "",
          });
        }
        optimista({ tipo: "FIJAR_MENU", atencionId, menu }, atencionId, () =>
          rpc("fijar_menu", {
            p_atencion_id: atencionId,
            p_menu_id: menu?.menuId ?? null,
            p_adultos: menu?.adultos ?? 0,
            p_ninos_6_11: menu?.ninos6a11 ?? 0,
            p_ninos_3_5: menu?.ninos3a5 ?? 0,
            p_total_menu: totalMenu(menu),
          })
        );
      },

      async agregarAbono(atencionId, monto, observacion) {
        if (!Number.isFinite(monto) || monto <= 0) {
          avisar("Ingresa un monto válido");
          return false;
        }
        if (!MODO_COMPARTIDO) {
          const atencion = estadoRef.current.atenciones[atencionId];
          if (!atencion || atencion.estado !== "PENDIENTE") return false;
          const abono: Abono = {
            id: `ab-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
            atencionId,
            monto: Math.round(monto),
            observacion: observacion.trim().slice(0, 120),
            garzonId: garzonRef.current,
            creadoEn: new Date().toISOString(),
          };
          auditarLocal({
            usuarioId: garzonRef.current,
            accion: "REGISTRAR_ABONO",
            entidad: "abonos",
            entidadId: abono.id,
            mesaNumero: numeroDeMesa(atencion.mesaId),
            atencionId,
            valorAnterior: null,
            valorNuevo: { monto: abono.monto, observacion: abono.observacion },
            observacion: abono.observacion,
          });
          dispatch({ tipo: "APLICAR_ABONO", abono });
          return true;
        }
        if (sinConexion()) return false;
        try {
          const fila = await rpc<FilaAbono>("agregar_abono", {
            p_atencion_id: atencionId,
            p_monto: Math.round(monto),
            p_observacion: observacion,
          });
          dispatch({ tipo: "APLICAR_ABONO", abono: mapAbono(fila) });
          return true;
        } catch (e: unknown) {
          avisar(e instanceof ErrorRpc ? e.message : "No se pudo registrar el abono");
          void revalidarAtencion(atencionId);
          return false;
        }
      },

      async eliminarAbono(abonoId) {
        const abono = estadoRef.current.abonos.find((a) => a.id === abonoId);
        if (!abono) return;
        if (!MODO_COMPARTIDO) {
          const atencion = estadoRef.current.atenciones[abono.atencionId];
          if (!atencion || atencion.estado !== "PENDIENTE") return;
          auditarLocal({
            usuarioId: garzonRef.current,
            accion: "ELIMINAR_ABONO",
            entidad: "abonos",
            entidadId: abonoId,
            mesaNumero: numeroDeMesa(atencion.mesaId),
            atencionId: abono.atencionId,
            valorAnterior: { monto: abono.monto, observacion: abono.observacion },
            valorNuevo: null,
            observacion: "",
          });
          dispatch({ tipo: "QUITAR_ABONO", abonoId });
          return;
        }
        if (sinConexion()) return;
        try {
          await rpc("eliminar_abono", { p_abono_id: abonoId });
          dispatch({ tipo: "QUITAR_ABONO", abonoId });
        } catch (e: unknown) {
          avisar(e instanceof ErrorRpc ? e.message : "No se pudo eliminar el abono");
          void revalidarAtencion(abono.atencionId);
        }
      },

      async cerrarAtencion(atencionId) {
        if (!MODO_COMPARTIDO) {
          const atencion = estadoRef.current.atenciones[atencionId];
          if (atencion?.estado === "PENDIENTE") {
            auditarLocal({
              usuarioId: garzonRef.current,
              accion: "CIERRE_MESA",
              entidad: "atenciones",
              entidadId: atencionId,
              mesaNumero: numeroDeMesa(atencion.mesaId),
              atencionId,
              valorAnterior: { estado: "PENDIENTE" },
              valorNuevo: {
                estado: "PAGADA",
                total: totalCuenta(atencion),
                abonos: atencion.totalAbonos,
                saldo: saldoPendiente(atencion),
              },
              observacion: "",
            });
          }
          dispatch({ tipo: "CERRAR_ATENCION", atencionId });
          return true;
        }
        if (sinConexion()) return false;
        try {
          await rpcAtencionMesa("cerrar_atencion", { p_atencion_id: atencionId });
          return true;
        } catch (e: unknown) {
          avisar(
            e instanceof ErrorRpc ? e.message : "No se pudo cerrar la atención"
          );
          void revalidarAtencion(atencionId);
          return false;
        }
      },

      async reabrirAtencion(atencionId) {
        if (!MODO_COMPARTIDO) {
          const atencion = estadoRef.current.atenciones[atencionId];
          const mesa = atencion
            ? estadoRef.current.mesas.find((m) => m.id === atencion.mesaId)
            : undefined;
          const esUltima =
            atencion &&
            !Object.values(estadoRef.current.atenciones).some(
              (a) => a.mesaId === atencion.mesaId && a.numero > atencion.numero
            );
          if (
            atencion?.estado === "PAGADA" &&
            mesa?.estado === "DISPONIBLE" &&
            esUltima
          ) {
            auditarLocal({
              usuarioId: garzonRef.current,
              accion: "REAPERTURA_MESA",
              entidad: "atenciones",
              entidadId: atencionId,
              mesaNumero: mesa.numero,
              atencionId,
              valorAnterior: { estado: "PAGADA" },
              valorNuevo: { estado: "PENDIENTE" },
              observacion: "",
            });
          }
          dispatch({ tipo: "REABRIR_ATENCION", atencionId });
          return true;
        }
        if (sinConexion()) return false;
        try {
          await rpcAtencionMesa("reabrir_atencion", { p_atencion_id: atencionId });
          return true;
        } catch (e: unknown) {
          avisar(
            e instanceof ErrorRpc ? e.message : "No se pudo reabrir la atención"
          );
          void revalidarAtencion(atencionId);
          return false;
        }
      },

      async transferirAtencion(atencionId, garzonNuevoId) {
        if (!MODO_COMPARTIDO) {
          const atencion = estadoRef.current.atenciones[atencionId];
          if (!atencion || atencion.estado !== "PENDIENTE") return false;
          if (atencion.garzonId === garzonNuevoId) return true;
          const nombreDe = (id: string | null) =>
            estadoRef.current.garzones.find((g) => g.id === id)?.nombre ?? "—";
          auditarLocal({
            usuarioId: garzonRef.current,
            accion: "TRANSFERENCIA_MESA",
            entidad: "atenciones",
            entidadId: atencionId,
            mesaNumero: numeroDeMesa(atencion.mesaId),
            atencionId,
            valorAnterior: { garzon: nombreDe(atencion.garzonId) },
            valorNuevo: { garzon: nombreDe(garzonNuevoId) },
            observacion: "",
          });
          dispatch({
            tipo: "TRANSFERIR_ATENCION",
            atencionId,
            garzonId: garzonNuevoId,
          });
          return true;
        }
        if (sinConexion()) return false;
        try {
          const fila = await rpc<FilaAtencion>("transferir_atencion", {
            p_atencion_id: atencionId,
            p_garzon_nuevo_id: garzonNuevoId,
          });
          dispatch({ tipo: "APLICAR_ATENCION", atencion: mapAtencion(fila) });
          avisar("Mesa transferida", "exito");
          return true;
        } catch (e: unknown) {
          avisar(e instanceof ErrorRpc ? e.message : "No se pudo transferir la mesa");
          void revalidarAtencion(atencionId);
          return false;
        }
      },

      registrarPrecuenta(atencionId) {
        const atencion = estadoRef.current.atenciones[atencionId];
        if (!atencion) return;
        if (!MODO_COMPARTIDO) {
          auditarLocal({
            usuarioId: garzonRef.current,
            accion: "GENERAR_PRECUENTA",
            entidad: "atenciones",
            entidadId: atencionId,
            mesaNumero: numeroDeMesa(atencion.mesaId),
            atencionId,
            valorAnterior: null,
            valorNuevo: {
              total: totalCuenta(atencion),
              abonos: atencion.totalAbonos,
              saldo: saldoPendiente(atencion),
            },
            observacion: "",
          });
          return;
        }
        if (conexionRef.current === "online") {
          void rpc("registrar_precuenta", {
            p_atencion_id: atencionId,
          }).catch(() => undefined);
        }
      },

      /* ----------------- Autenticación (Supabase Auth) ------------------ */

      async iniciarSesion(email, contrasena) {
        if (!MODO_COMPARTIDO) return "La autenticación requiere Supabase";
        const error = await authIniciarSesion(email, contrasena);
        if (error) return error;
        // INICIO_SESION queda en la auditoría con la identidad del JWT.
        void rpc("registrar_sesion", { p_accion: "INICIO_SESION" }).catch(
          () => undefined
        );
        return null;
      },

      async registrarse(nombre, email, contrasena, telefono) {
        if (!MODO_COMPARTIDO) {
          return { error: "El registro requiere Supabase", requiereConfirmacion: false };
        }
        const limpio = nombre.trim();
        if (limpio.length < 2 || limpio.length > 40) {
          return {
            error: "El nombre debe tener entre 2 y 40 caracteres",
            requiereConfirmacion: false,
          };
        }
        const resultado = await authRegistrarse(limpio, email, contrasena, telefono);
        if (!resultado.error && !resultado.requiereConfirmacion) {
          // Quedó autenticado de inmediato: también es un inicio de sesión.
          void rpc("registrar_sesion", { p_accion: "INICIO_SESION" }).catch(
            () => undefined
          );
        }
        return resultado;
      },

      async cerrarSesion() {
        if (!MODO_COMPARTIDO) {
          seleccionar(null);
          return;
        }
        // CIERRE_SESION se audita ANTES de invalidar el token.
        try {
          await rpc("registrar_sesion", { p_accion: "CIERRE_SESION" });
        } catch {
          // sin conexión o sesión ya inválida: el logout sigue igual
        }
        await cerrarSesionAuth();
      },

      async recuperarContrasena(email) {
        if (!MODO_COMPARTIDO) return "La recuperación requiere Supabase";
        return authRecuperarContrasena(email);
      },

      async actualizarContrasena(nueva) {
        if (!MODO_COMPARTIDO) return "La autenticación requiere Supabase";
        if (nueva.length < 6) {
          return "La contraseña debe tener al menos 6 caracteres";
        }
        const error = await authActualizarContrasena(nueva);
        if (!error) {
          setSesion((s) => ({ ...s, recuperando: false }));
          avisar("Contraseña actualizada", "exito");
        }
        return error;
      },
    }),
    [
      auditarLocal,
      avisar,
      numeroDeMesa,
      optimista,
      revalidarAtencion,
      revalidarMesa,
      rpcAtencionMesa,
      seleccionar,
      sinConexion,
    ]
  );

  const valorAviso = useMemo(() => ({ aviso, cerrarAviso }), [aviso, cerrarAviso]);

  const valorAuth = useMemo<EstadoAuth>(
    () => ({
      cargando: sesion.cargando,
      userId: sesion.userId,
      email: sesion.email,
      recuperando: sesion.recuperando,
      terminarRecuperacion() {
        setSesion((s) => ({ ...s, recuperando: false }));
      },
    }),
    [sesion]
  );

  return (
    <CtxEstado.Provider value={estado}>
      <CtxAcciones.Provider value={acciones}>
        <CtxConexion.Provider value={conexion}>
          <CtxGarzon.Provider value={garzonId}>
            <CtxAuth.Provider value={valorAuth}>
              <CtxRevalidar.Provider value={revalidarAtencion}>
                <CtxAviso.Provider value={valorAviso}>{children}</CtxAviso.Provider>
              </CtxRevalidar.Provider>
            </CtxAuth.Provider>
          </CtxGarzon.Provider>
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

/** Sesión del mesero (modo compartido). En modo local, userId es null. */
export function useAuth(): EstadoAuth {
  const ctx = useContext(CtxAuth);
  if (!ctx) throw new Error("useAuth requiere <ProveedorApp>");
  return ctx;
}

export function useAviso() {
  const ctx = useContext(CtxAviso);
  if (!ctx) throw new Error("useAviso requiere <ProveedorApp>");
  return ctx;
}

/** Garzón que opera este dispositivo (null si aún no se elige). */
export function useGarzonActual(): { garzonId: string | null; garzon: Garzon | null } {
  const garzonId = useContext(CtxGarzon);
  const { garzones } = useEstadoApp();
  return {
    garzonId,
    garzon: garzones.find((g) => g.id === garzonId) ?? null,
  };
}

export function useGarzon(garzonId: string | null): Garzon | null {
  const { garzones } = useEstadoApp();
  if (!garzonId) return null;
  return garzones.find((g) => g.id === garzonId) ?? null;
}

/** Mesa + su atención abierta (si la tiene) con consumos y abonos. */
export function useMesa(mesaId: string): {
  mesa: Mesa;
  atencion: Atencion | null;
  consumos: Consumo[];
  abonos: Abono[];
} {
  const { mesas, atenciones, consumos, abonos } = useEstadoApp();
  const mesa = mesas.find((m) => m.id === mesaId);
  if (!mesa) throw new Error(`Mesa desconocida: ${mesaId}`);
  const atencion = mesa.atencionActualId
    ? atenciones[mesa.atencionActualId] ?? null
    : null;
  return {
    mesa,
    atencion,
    consumos: atencion ? consumosDe(consumos, atencion.id) : [],
    abonos: atencion ? abonosDe(abonos, atencion.id) : [],
  };
}

/**
 * Una atención cualquiera (abierta o histórica) con su detalle. En modo
 * compartido trae del servidor lo que falte (atención vieja o detalle
 * de una cerrada que no está en memoria).
 */
export function useDetalleAtencion(atencionId: string): {
  atencion: Atencion | null;
  consumos: Consumo[];
  abonos: Abono[];
  cargando: boolean;
} {
  const estado = useEstadoApp();
  const atencion = estado.atenciones[atencionId] ?? null;
  const consumos = consumosDe(estado.consumos, atencionId);
  const abonos = abonosDe(estado.abonos, atencionId);

  const revalidar = useContext(CtxRevalidar);
  const faltaDetalle =
    MODO_COMPARTIDO &&
    (!atencion ||
      (atencion.estado === "PAGADA" &&
        ((atencion.totalConsumos > 0 && consumos.length === 0) ||
          (atencion.totalAbonos > 0 && abonos.length === 0))));
  const [cargando, setCargando] = useState(faltaDetalle);
  const pedidaRef = useRef<string | null>(null);

  useEffect(() => {
    if (!faltaDetalle || !revalidar || pedidaRef.current === atencionId) return;
    pedidaRef.current = atencionId;
    setCargando(true);
    void revalidar(atencionId).finally(() => setCargando(false));
  }, [atencionId, faltaDetalle, revalidar]);

  return { atencion, consumos, abonos, cargando };
}

/** Historial de atenciones PAGADAS (global o de una mesa), más recientes
 *  primero. Nunca se consulta el estado actual de las mesas. */
export function useHistorial(
  mesaId?: string,
  limite = 100
): { atenciones: Atencion[]; cargando: boolean } {
  const estado = useEstadoApp();
  const [remotas, setRemotas] = useState<Atencion[]>([]);
  const [cargando, setCargando] = useState(MODO_COMPARTIDO);

  useEffect(() => {
    if (!MODO_COMPARTIDO) return;
    let activo = true;
    setCargando(true);
    consultarHistorial(mesaId, limite)
      .then((filas) => {
        if (activo) setRemotas(filas);
      })
      .catch(() => undefined)
      .finally(() => {
        if (activo) setCargando(false);
      });
    return () => {
      activo = false;
    };
  }, [mesaId, limite]);

  const atenciones = useMemo(() => {
    const porId = new Map<string, Atencion>();
    for (const a of remotas) porId.set(a.id, a);
    // Las cerradas en vivo (Realtime o este dispositivo) pisan/expanden
    // la consulta inicial.
    for (const a of Object.values(estado.atenciones)) {
      if (a.estado !== "PAGADA") {
        porId.delete(a.id); // reabierta: sale del historial
        continue;
      }
      if (mesaId && a.mesaId !== mesaId) continue;
      porId.set(a.id, a);
    }
    return [...porId.values()]
      .sort((a, b) => (b.fechaCierre ?? "").localeCompare(a.fechaCierre ?? ""))
      .slice(0, limite);
  }, [remotas, estado.atenciones, mesaId, limite]);

  return { atenciones, cargando };
}
