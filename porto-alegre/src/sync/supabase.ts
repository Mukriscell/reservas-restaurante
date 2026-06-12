import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import type {
  Abono,
  AccionAuditoria,
  Atencion,
  Consumo,
  Garzon,
  Mesa,
  MenuMesa,
  RegistroAuditoria,
} from "../tipos";
import type { MenuId } from "../data/menus";
import type { EstadoApp } from "../db/almacen";

/**
 * Capa de sincronización con Supabase (modo compartido multi-garzón).
 *
 * Sin VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY la app corre en MODO
 * LOCAL (un solo dispositivo, localStorage), útil para desarrollo.
 * Las escrituras van SIEMPRE por las funciones RPC transaccionales del
 * esquema (supabase/migrations/0002_atenciones.sql); las tablas solo
 * permiten lectura, y Realtime reparte los cambios a todos los equipos.
 *
 * La carga inicial trae mesas + garzones + atenciones ABIERTAS (con sus
 * consumos y abonos). El historial (atenciones PAGADAS) se consulta bajo
 * demanda: puede crecer sin límite y no debe viajar completo a la app.
 */

const URL_SUPABASE = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const CLAVE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const MODO_COMPARTIDO = Boolean(URL_SUPABASE && CLAVE_ANON);

let cliente: SupabaseClient | null = null;

export function getCliente(): SupabaseClient {
  if (!cliente) {
    if (!MODO_COMPARTIDO) throw new Error("Supabase no está configurado");
    cliente = createClient(URL_SUPABASE!, CLAVE_ANON!, {
      auth: { persistSession: false },
    });
  }
  return cliente;
}

/* ------------------------- Mapeo de filas ----------------------------- */

export interface FilaMesa {
  id: string;
  numero: number;
  estado: "DISPONIBLE" | "OCUPADA";
  atencion_actual_id: string | null;
}

export interface FilaGarzon {
  id: string;
  nombre: string;
  activo: boolean;
  rol?: "ADMIN" | "GARZON";
}

export interface FilaAuditoria {
  id: number;
  usuario_id: string | null;
  nombre_usuario: string;
  rol_usuario: string;
  accion: AccionAuditoria;
  entidad: string;
  entidad_id: string | null;
  mesa_numero: number | null;
  atencion_id: string | null;
  valor_anterior: Record<string, unknown> | null;
  valor_nuevo: Record<string, unknown> | null;
  observacion: string;
  created_at: string;
}

export interface FilaAtencion {
  id: string;
  numero: number;
  mesa_id: string;
  garzon_id: string | null;
  estado: "PENDIENTE" | "PAGADA";
  fecha_apertura: string;
  fecha_cierre: string | null;
  menu_id: MenuId | null;
  adultos: number;
  ninos_6_11: number;
  ninos_3_5: number;
  total_menu: number;
  total_consumos: number;
  total_abonos: number;
  saldo_final: number;
}

export interface FilaConsumo {
  id: string;
  atencion_id: string;
  producto_id: string;
  cantidad: number;
  precio_unitario: number;
}

export interface FilaAbono {
  id: string;
  atencion_id: string;
  monto: number;
  observacion: string;
  garzon_id: string | null;
  creado_en: string;
}

/** Lo que devuelven abrir_atencion / cerrar_atencion / reabrir_atencion. */
export interface ResultadoAtencionMesa {
  atencion: FilaAtencion;
  mesa: FilaMesa;
}

export function mapMesa(fila: FilaMesa): Mesa {
  return {
    id: fila.id,
    numero: fila.numero,
    estado: fila.estado,
    atencionActualId: fila.atencion_actual_id,
  };
}

export function mapGarzon(fila: FilaGarzon): Garzon {
  return {
    id: fila.id,
    nombre: fila.nombre,
    activo: fila.activo,
    rol: fila.rol === "ADMIN" ? "ADMIN" : "GARZON",
  };
}

export function mapAuditoria(fila: FilaAuditoria): RegistroAuditoria {
  return {
    id: String(fila.id),
    usuarioId: fila.usuario_id,
    nombreUsuario: fila.nombre_usuario,
    rolUsuario: fila.rol_usuario,
    accion: fila.accion,
    entidad: fila.entidad,
    entidadId: fila.entidad_id,
    mesaNumero: fila.mesa_numero,
    atencionId: fila.atencion_id,
    valorAnterior: fila.valor_anterior,
    valorNuevo: fila.valor_nuevo,
    observacion: fila.observacion,
    creadoEn: fila.created_at,
  };
}

export function mapAtencion(fila: FilaAtencion): Atencion {
  const menu: MenuMesa | null = fila.menu_id
    ? {
        menuId: fila.menu_id,
        adultos: fila.adultos,
        ninos6a11: fila.ninos_6_11,
        ninos3a5: fila.ninos_3_5,
      }
    : null;
  return {
    id: fila.id,
    numero: fila.numero,
    mesaId: fila.mesa_id,
    garzonId: fila.garzon_id,
    estado: fila.estado,
    fechaApertura: fila.fecha_apertura,
    fechaCierre: fila.fecha_cierre,
    menu,
    totalMenu: fila.total_menu,
    totalConsumos: fila.total_consumos,
    totalAbonos: fila.total_abonos,
    saldoFinal: fila.saldo_final,
  };
}

export function mapConsumo(fila: FilaConsumo): Consumo {
  return {
    id: fila.id,
    atencionId: fila.atencion_id,
    productoId: fila.producto_id,
    cantidad: fila.cantidad,
    precioUnitario: fila.precio_unitario,
    subtotal: fila.cantidad * fila.precio_unitario,
  };
}

export function mapAbono(fila: FilaAbono): Abono {
  return {
    id: fila.id,
    atencionId: fila.atencion_id,
    monto: fila.monto,
    observacion: fila.observacion,
    garzonId: fila.garzon_id,
    creadoEn: fila.creado_en,
  };
}

/* ----------------------------- Lecturas ------------------------------- */

async function detalleDeAtenciones(
  ids: string[]
): Promise<{ consumos: Consumo[]; abonos: Abono[] }> {
  if (ids.length === 0) return { consumos: [], abonos: [] };
  const sb = getCliente();
  const [consumos, abonos] = await Promise.all([
    sb.from("consumos").select("*").in("atencion_id", ids),
    sb.from("abonos").select("*").in("atencion_id", ids),
  ]);
  if (consumos.error) throw consumos.error;
  if (abonos.error) throw abonos.error;
  return {
    consumos: (consumos.data as FilaConsumo[]).map(mapConsumo),
    abonos: (abonos.data as FilaAbono[]).map(mapAbono),
  };
}

/** Estado operativo completo: mesas, garzones y atenciones ABIERTAS. */
export async function cargarTodo(): Promise<EstadoApp> {
  const sb = getCliente();
  const [mesas, garzones, atenciones] = await Promise.all([
    sb.from("mesas").select("*").order("numero"),
    sb.from("garzones").select("*").order("nombre"),
    sb.from("atenciones").select("*").eq("estado", "PENDIENTE"),
  ]);
  if (mesas.error) throw mesas.error;
  if (garzones.error) throw garzones.error;
  if (atenciones.error) throw atenciones.error;

  const abiertas = (atenciones.data as FilaAtencion[]).map(mapAtencion);
  const { consumos, abonos } = await detalleDeAtenciones(abiertas.map((a) => a.id));

  return {
    mesas: (mesas.data as FilaMesa[]).map(mapMesa),
    garzones: (garzones.data as FilaGarzon[]).map(mapGarzon),
    atenciones: Object.fromEntries(abiertas.map((a) => [a.id, a])),
    consumos,
    abonos,
    auditoria: [], // en modo compartido la auditoría vive en el servidor
  };
}

/** Estado autoritativo de UNA atención con su mesa y detalle. */
export async function cargarAtencion(atencionId: string): Promise<{
  atencion: Atencion;
  mesa: Mesa | null;
  consumos: Consumo[];
  abonos: Abono[];
} | null> {
  const sb = getCliente();
  const fila = await sb
    .from("atenciones")
    .select("*")
    .eq("id", atencionId)
    .maybeSingle();
  if (fila.error) throw fila.error;
  if (!fila.data) return null;
  const atencion = mapAtencion(fila.data as FilaAtencion);

  const [mesa, detalle] = await Promise.all([
    sb.from("mesas").select("*").eq("id", atencion.mesaId).maybeSingle(),
    detalleDeAtenciones([atencion.id]),
  ]);
  if (mesa.error) throw mesa.error;

  return {
    atencion,
    mesa: mesa.data ? mapMesa(mesa.data as FilaMesa) : null,
    consumos: detalle.consumos,
    abonos: detalle.abonos,
  };
}

/** Estado autoritativo de UNA mesa y su atención abierta (si tiene). */
export async function cargarMesa(mesaId: string): Promise<{
  mesa: Mesa;
  atencion: Atencion | null;
  consumos: Consumo[];
  abonos: Abono[];
} | null> {
  const sb = getCliente();
  const fila = await sb.from("mesas").select("*").eq("id", mesaId).maybeSingle();
  if (fila.error) throw fila.error;
  if (!fila.data) return null;
  const mesa = mapMesa(fila.data as FilaMesa);

  if (!mesa.atencionActualId) {
    return { mesa, atencion: null, consumos: [], abonos: [] };
  }
  const datos = await cargarAtencion(mesa.atencionActualId);
  return {
    mesa,
    atencion: datos?.atencion ?? null,
    consumos: datos?.consumos ?? [],
    abonos: datos?.abonos ?? [],
  };
}

/**
 * Historial: atenciones PAGADAS, más reciente primero. Los reportes
 * históricos SIEMPRE salen de atenciones/consumos/abonos, nunca del
 * estado actual de las mesas.
 */
export async function cargarHistorial(
  mesaId: string | undefined,
  limite: number
): Promise<Atencion[]> {
  const sb = getCliente();
  let consulta = sb
    .from("atenciones")
    .select("*")
    .eq("estado", "PAGADA")
    .order("fecha_cierre", { ascending: false })
    .limit(limite);
  if (mesaId) consulta = consulta.eq("mesa_id", mesaId);
  const { data, error } = await consulta;
  if (error) throw error;
  return (data as FilaAtencion[]).map(mapAtencion);
}

/** Filtros de la pantalla de auditoría (se aplican en el servidor). */
export interface FiltroAuditoria {
  /** Día local "YYYY-MM-DD". */
  fecha?: string;
  usuarioId?: string;
  mesaNumero?: number;
  accion?: AccionAuditoria;
  /**
   * Restricción para garzones (no ADMIN): solo sus propias acciones o
   * las de sus atenciones.
   */
  soloDe?: { garzonId: string; atencionIds: string[] };
  limite?: number;
}

/**
 * Auditoría: SIEMPRE desde la tabla `auditoria` (inalterable), más
 * recientes primero.
 */
export async function consultarAuditoria(
  filtro: FiltroAuditoria
): Promise<RegistroAuditoria[]> {
  const sb = getCliente();
  let consulta = sb
    .from("auditoria")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(filtro.limite ?? 200);

  if (filtro.fecha) {
    const desde = new Date(`${filtro.fecha}T00:00:00`);
    const hasta = new Date(desde.getTime() + 24 * 60 * 60 * 1000);
    consulta = consulta
      .gte("created_at", desde.toISOString())
      .lt("created_at", hasta.toISOString());
  }
  if (filtro.usuarioId) consulta = consulta.eq("usuario_id", filtro.usuarioId);
  if (filtro.mesaNumero !== undefined) {
    consulta = consulta.eq("mesa_numero", filtro.mesaNumero);
  }
  if (filtro.accion) consulta = consulta.eq("accion", filtro.accion);
  if (filtro.soloDe) {
    const { garzonId, atencionIds } = filtro.soloDe;
    consulta = atencionIds.length
      ? consulta.or(
          `usuario_id.eq.${garzonId},atencion_id.in.(${atencionIds.join(",")})`
        )
      : consulta.eq("usuario_id", garzonId);
  }

  const { data, error } = await consulta;
  if (error) throw error;
  return (data as FilaAuditoria[]).map(mapAuditoria);
}

/** Ids de las atenciones de un garzón (para su vista de auditoría). */
export async function atencionesDeGarzon(garzonId: string): Promise<string[]> {
  const sb = getCliente();
  const { data, error } = await sb
    .from("atenciones")
    .select("id")
    .eq("garzon_id", garzonId)
    .order("numero", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data as { id: string }[]).map((a) => a.id);
}

/* ------------------------------- RPC ----------------------------------- */

const MENSAJES: Record<string, string> = {
  MESA_OCUPADA: "La mesa ya fue ocupada por otro garzón",
  MESA_NO_EXISTE: "La mesa no existe",
  ATENCION_NO_EXISTE: "La atención ya no existe",
  ATENCION_PAGADA: "La cuenta ya fue cerrada por otro garzón",
  ATENCION_YA_CERRADA: "La mesa ya fue cerrada por otro garzón",
  ATENCION_NO_PAGADA: "La cuenta sigue abierta",
  ATENCION_ANTIGUA: "Solo se puede reabrir la última cuenta de la mesa",
  GARZON_INVALIDO: "Selecciona un garzón válido",
  NOMBRE_INVALIDO: "El nombre debe tener entre 2 y 40 caracteres",
  NOMBRE_DUPLICADO: "Ya existe un garzón con ese nombre",
  ROL_INVALIDO: "Rol inválido",
  MONTO_INVALIDO: "El monto del abono no es válido",
  ABONO_NO_EXISTE: "El abono ya no existe",
  DELTA_INVALIDO: "Cantidad inválida",
  ACCION_INVALIDA: "Acción inválida",
};

export class ErrorRpc extends Error {
  codigo: string;
  constructor(codigo: string, mensaje: string) {
    super(mensaje);
    this.codigo = codigo;
  }
}

export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await getCliente().rpc(fn, args);
  if (error) {
    const codigo =
      Object.keys(MENSAJES).find((c) => error.message?.includes(c)) ?? "DESCONOCIDO";
    throw new ErrorRpc(
      codigo,
      MENSAJES[codigo] ?? "No se pudo guardar el cambio: revisa la conexión"
    );
  }
  return data as T;
}
