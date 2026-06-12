import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import type { ConsumoMesa, Mesa, MenuMesa } from "../tipos";
import type { MenuId } from "../data/menus";
import type { EstadoApp } from "../db/almacen";

/**
 * Capa de sincronización con Supabase (modo compartido multi-garzón).
 *
 * Sin VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY la app corre en MODO
 * LOCAL (un solo dispositivo, localStorage), útil para desarrollo.
 * Las escrituras van SIEMPRE por las funciones RPC transaccionales del
 * esquema (supabase/migrations/0001_esquema.sql); las tablas solo
 * permiten lectura, y Realtime reparte los cambios a todos los equipos.
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
  numero_mesa: number;
  estado: "PENDIENTE" | "PAGADA";
  fecha_apertura: string | null;
  fecha_cierre: string | null;
  menu_id: MenuId | null;
  adultos: number;
  ninos_6_11: number;
  ninos_3_5: number;
}

export interface FilaConsumo {
  id: string;
  mesa_id: string;
  producto_id: string;
  cantidad: number;
  precio_unitario: number;
}

export function mapMesa(fila: FilaMesa): Mesa {
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
    numeroMesa: fila.numero_mesa,
    estado: fila.estado,
    total: 0, // derivado: el reducer lo recalcula con los consumos
    fechaApertura: fila.fecha_apertura,
    fechaCierre: fila.fecha_cierre,
    menu,
  };
}

export function mapConsumo(fila: FilaConsumo): ConsumoMesa {
  return {
    id: fila.id,
    mesaId: fila.mesa_id,
    productoId: fila.producto_id,
    cantidad: fila.cantidad,
    precioUnitario: fila.precio_unitario,
    subtotal: fila.cantidad * fila.precio_unitario,
  };
}

/* ----------------------------- Lecturas ------------------------------- */

export async function cargarTodo(): Promise<EstadoApp> {
  const sb = getCliente();
  const [mesas, consumos] = await Promise.all([
    sb.from("mesas").select("*").order("numero_mesa"),
    sb.from("consumos").select("*"),
  ]);
  if (mesas.error) throw mesas.error;
  if (consumos.error) throw consumos.error;
  return {
    mesas: (mesas.data as FilaMesa[]).map(mapMesa),
    consumos: (consumos.data as FilaConsumo[]).map(mapConsumo),
  };
}

/** Estado autoritativo de UNA mesa (revalidación tras un rechazo). */
export async function cargarMesa(
  mesaId: string
): Promise<{ mesa: Mesa; consumos: ConsumoMesa[] } | null> {
  const sb = getCliente();
  const [mesa, consumos] = await Promise.all([
    sb.from("mesas").select("*").eq("id", mesaId).maybeSingle(),
    sb.from("consumos").select("*").eq("mesa_id", mesaId),
  ]);
  if (mesa.error) throw mesa.error;
  if (consumos.error) throw consumos.error;
  if (!mesa.data) return null;
  return {
    mesa: mapMesa(mesa.data as FilaMesa),
    consumos: (consumos.data as FilaConsumo[]).map(mapConsumo),
  };
}

/* ------------------------------- RPC ----------------------------------- */

const MENSAJES: Record<string, string> = {
  MESA_YA_CERRADA: "La mesa ya fue cerrada por otro garzón",
  MESA_PAGADA: "La mesa ya está pagada: otro garzón la cerró",
  MESA_NO_PAGADA: "La mesa no está pagada",
  MESA_NO_EXISTE: "La mesa no existe",
  DELTA_INVALIDO: "Cantidad inválida",
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
