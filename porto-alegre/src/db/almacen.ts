import type { ConsumoMesa, Mesa } from "../tipos";

/**
 * "Base de datos" local de la app: todo el estado vive en localStorage
 * del dispositivo del garzón, con esquema versionado para poder migrar
 * en futuras versiones sin perder mesas abiertas.
 */

export interface EstadoApp {
  mesas: Mesa[];
  consumos: ConsumoMesa[];
}

const CLAVE = "porto-alegre-mesas";
const VERSION = 1;

export const TOTAL_MESAS = 100;

/** Seeder de mesas: 100 mesas numeradas, pendientes y sin consumo. */
export function estadoInicial(): EstadoApp {
  return {
    mesas: Array.from({ length: TOTAL_MESAS }, (_, i) => ({
      id: `mesa-${i + 1}`,
      numeroMesa: i + 1,
      estado: "PENDIENTE",
      total: 0,
      fechaApertura: null,
      fechaCierre: null,
      menu: null,
    })),
    consumos: [],
  };
}

export function cargarEstado(): EstadoApp {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (!crudo) return estadoInicial();
    const datos = JSON.parse(crudo) as {
      version: number;
      mesas: Mesa[];
      consumos: ConsumoMesa[];
    };
    if (
      datos.version !== VERSION ||
      !Array.isArray(datos.mesas) ||
      datos.mesas.length !== TOTAL_MESAS ||
      !Array.isArray(datos.consumos)
    ) {
      return estadoInicial();
    }
    return { mesas: datos.mesas, consumos: datos.consumos };
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
