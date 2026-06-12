import type { Abono, Atencion, Consumo, Garzon, Mesa, MenuMesa } from "../tipos";
import { totalMenu } from "../data/menus";

/**
 * "Base de datos" local de la app: cache en localStorage del dispositivo,
 * con esquema versionado. En modo local es la fuente de verdad (incluido
 * el historial de atenciones); en modo compartido es la vista offline.
 */

export interface EstadoApp {
  /** Las 100 mesas permanentes: solo estado operativo actual. */
  mesas: Mesa[];
  /** Atenciones conocidas (abiertas + historial), por id. */
  atenciones: Record<string, Atencion>;
  consumos: Consumo[];
  abonos: Abono[];
  garzones: Garzon[];
}

const CLAVE = "porto-alegre-mesas";
const CLAVE_GARZON = "porto-alegre-garzon";
const VERSION = 2;

export const TOTAL_MESAS = 100;

/** Mismos garzones seed que la migración SQL (modo local). */
export const GARZONES_SEED: Garzon[] = [
  { id: "g-1", nombre: "Juan Pérez", activo: true },
  { id: "g-2", nombre: "María Silva", activo: true },
  { id: "g-3", nombre: "Pedro Santos", activo: true },
  { id: "g-4", nombre: "Ana Souza", activo: true },
  { id: "g-5", nombre: "Diego Ramírez", activo: true },
  { id: "g-6", nombre: "Carla Oliveira", activo: true },
  { id: "g-7", nombre: "Felipe Costa", activo: true },
  { id: "g-8", nombre: "Valentina Rojas", activo: true },
  { id: "g-9", nombre: "Lucas Moreira", activo: true },
  { id: "g-10", nombre: "Camila Duarte", activo: true },
];

/** Seeder: 100 mesas permanentes, todas DISPONIBLES, sin historial. */
export function estadoInicial(): EstadoApp {
  return {
    mesas: Array.from({ length: TOTAL_MESAS }, (_, i) => ({
      id: `mesa-${i + 1}`,
      numero: i + 1,
      estado: "DISPONIBLE",
      atencionActualId: null,
    })),
    atenciones: {},
    consumos: [],
    abonos: [],
    garzones: GARZONES_SEED,
  };
}

/* --------------------- Migración del esquema v1 ----------------------- */

interface MesaV1 {
  id: string;
  numeroMesa: number;
  estado: "PENDIENTE" | "PAGADA";
  fechaApertura: string | null;
  fechaCierre: string | null;
  menu: MenuMesa | null;
}

interface ConsumoV1 {
  mesaId: string;
  productoId: string;
  cantidad: number;
  precioUnitario: number;
}

/**
 * v1 guardaba la cuenta EN la mesa. Se convierte cada mesa con actividad
 * en una atención: las PENDIENTE quedan abiertas (mesa OCUPADA) y las
 * PAGADA pasan al historial (mesa DISPONIBLE). Nada se pierde.
 */
function migrarV1(mesasV1: MesaV1[], consumosV1: ConsumoV1[]): EstadoApp {
  const estado = estadoInicial();
  let numero = 0;
  for (const vieja of mesasV1) {
    const consumos = consumosV1.filter((c) => c.mesaId === vieja.id);
    const conActividad =
      consumos.length > 0 || vieja.menu !== null || vieja.fechaApertura !== null;
    if (!conActividad && vieja.estado === "PENDIENTE") continue;

    numero += 1;
    const atencionId = `a-${numero}`;
    const filas: Consumo[] = consumos.map((c) => ({
      id: `c-${atencionId}-${c.productoId}`,
      atencionId,
      productoId: c.productoId,
      cantidad: c.cantidad,
      precioUnitario: c.precioUnitario,
      subtotal: c.cantidad * c.precioUnitario,
    }));
    const totalConsumos = filas.reduce((s, c) => s + c.subtotal, 0);
    const pagada = vieja.estado === "PAGADA";
    const atencion: Atencion = {
      id: atencionId,
      numero,
      mesaId: vieja.id,
      garzonId: null,
      estado: pagada ? "PAGADA" : "PENDIENTE",
      fechaApertura: vieja.fechaApertura ?? new Date().toISOString(),
      fechaCierre: pagada ? vieja.fechaCierre : null,
      menu: vieja.menu,
      totalMenu: totalMenu(vieja.menu),
      totalConsumos,
      totalAbonos: 0,
      saldoFinal: pagada ? totalMenu(vieja.menu) + totalConsumos : 0,
    };
    estado.atenciones[atencionId] = atencion;
    estado.consumos.push(...filas);
    if (!pagada) {
      const mesa = estado.mesas.find((m) => m.id === vieja.id);
      if (mesa) {
        mesa.estado = "OCUPADA";
        mesa.atencionActualId = atencionId;
      }
    }
  }
  return estado;
}

/* --------------------------- Carga/guardado --------------------------- */

export function cargarEstado(): EstadoApp {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (!crudo) return estadoInicial();
    const datos = JSON.parse(crudo) as { version: number } & Record<string, unknown>;

    if (datos.version === 1) {
      const migrado = migrarV1(
        (datos.mesas as MesaV1[]) ?? [],
        (datos.consumos as ConsumoV1[]) ?? []
      );
      guardarEstado(migrado);
      return migrado;
    }

    if (
      datos.version !== VERSION ||
      !Array.isArray(datos.mesas) ||
      (datos.mesas as Mesa[]).length !== TOTAL_MESAS ||
      typeof datos.atenciones !== "object" ||
      !Array.isArray(datos.consumos) ||
      !Array.isArray(datos.abonos) ||
      !Array.isArray(datos.garzones)
    ) {
      return estadoInicial();
    }
    return {
      mesas: datos.mesas as Mesa[],
      atenciones: datos.atenciones as Record<string, Atencion>,
      consumos: datos.consumos as Consumo[],
      abonos: datos.abonos as Abono[],
      garzones: datos.garzones as Garzon[],
    };
  } catch {
    return estadoInicial();
  }
}

export function guardarEstado(estado: EstadoApp): void {
  try {
    localStorage.setItem(
      CLAVE,
      JSON.stringify({ version: VERSION, ...estado })
    );
  } catch (err) {
    // Sin espacio o storage bloqueado: la app sigue funcionando en memoria.
    console.error("[Porto Alegre] No se pudo guardar el estado:", err);
  }
}

/* ---------------------- Garzón activo del equipo ---------------------- */

export function cargarGarzonId(): string | null {
  try {
    return localStorage.getItem(CLAVE_GARZON);
  } catch {
    return null;
  }
}

export function guardarGarzonId(garzonId: string | null): void {
  try {
    if (garzonId) localStorage.setItem(CLAVE_GARZON, garzonId);
    else localStorage.removeItem(CLAVE_GARZON);
  } catch {
    // ignorar: solo afecta la preferencia local
  }
}
