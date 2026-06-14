import { useEffect, useMemo, useState } from "react";
import {
  History,
  LogOut,
  Martini,
  ScrollText,
  TrendingUp,
  UserRound,
} from "lucide-react";
import { useAcciones, useEstadoApp, useGarzonActual } from "../estado/contexto";
import { MODO_COMPARTIDO } from "../sync/supabase";
import { TarjetaMesa } from "../componentes/TarjetaMesa";
import { PillConexion } from "../componentes/Conexion";
import { BotonTema } from "../componentes/BotonTema";
import {
  estadoVisualMesa,
  ESTADOS_ORDEN,
  PUNTO_ESTADO,
  type EstadoVisual,
} from "../util/estadoMesa";

/** Chip de filtro por estado (doble como leyenda con conteo en vivo). */
function ChipFiltro({
  activo,
  onClick,
  etiqueta,
  conteo,
  punto,
  disabled,
}: {
  activo: boolean;
  onClick: () => void;
  etiqueta: string;
  conteo: number;
  punto?: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={activo}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition disabled:opacity-40 ${
        activo
          ? "bg-azul-700 text-white shadow-suave dark:bg-azul-500"
          : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:ring-zinc-300 dark:bg-white/5 dark:text-zinc-300 dark:ring-white/10"
      }`}
    >
      {punto && <span className={`h-2 w-2 rounded-full ${punto}`} />}
      {etiqueta}
      <span
        className={`tabular-nums ${activo ? "text-white/80" : "text-zinc-400 dark:text-zinc-500"}`}
      >
        {conteo}
      </span>
    </button>
  );
}

/** Pantalla principal: las 100 mesas permanentes como plano de salón. */
export function PantallaMesas({
  seleccionadaId,
  onAbrirMesa,
  onVerHistorial,
  onVerAuditoria,
  onVerDashboard,
  onCambiarGarzon,
}: {
  seleccionadaId: string | null;
  onAbrirMesa: (mesaId: string) => void;
  onVerHistorial: () => void;
  onVerAuditoria: () => void;
  onVerDashboard: () => void;
  onCambiarGarzon: () => void;
}) {
  const { mesas, atenciones, garzones } = useEstadoApp();
  const { garzonId, garzon } = useGarzonActual();
  const acciones = useAcciones();
  // "Mis mesas": el garzón filtra la grilla a sus atenciones abiertas.
  const [soloMias, setSoloMias] = useState(false);
  // Filtro por estado del plano (null = todas).
  const [filtro, setFiltro] = useState<EstadoVisual | null>(null);

  // Reloj compartido: una sola actualización alimenta el "tiempo en mesa"
  // de todas las tarjetas sin levantar 100 timers.
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Conteo por estado para la leyenda/filtros.
  const conteo = useMemo(() => {
    const c: Record<EstadoVisual, number> = {
      libre: 0,
      consumiendo: 0,
      por_pagar: 0,
      cerrada: 0,
      reservada: 0,
    };
    for (const m of mesas)
      c[estadoVisualMesa(m, m.atencionActualId ? atenciones[m.atencionActualId] ?? null : null)]++;
    return c;
  }, [mesas, atenciones]);

  const visibles = useMemo(() => {
    return mesas.filter((m) => {
      const atencion = m.atencionActualId ? atenciones[m.atencionActualId] ?? null : null;
      if (soloMias && garzonId && atencion?.garzonId !== garzonId) return false;
      if (filtro && estadoVisualMesa(m, atencion) !== filtro) return false;
      return true;
    });
  }, [soloMias, garzonId, filtro, mesas, atenciones]);

  return (
    <div className="mx-auto max-w-6xl px-3 pb-10">
      <header className="sticky top-0 z-20 -mx-3 mb-4 border-b border-zinc-200/80 bg-zinc-100/95 px-3 py-3 backdrop-blur dark:border-white/10 dark:bg-azul-950/95">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-verde-600 text-white shadow-suave">
            <Martini className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-black leading-none tracking-tight">
              PORTO{" "}
              <span className="text-verde-700 dark:text-amarillo-400">
                ALEGRE
              </span>
            </h1>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
              Restobar · Plano de salón
            </p>
          </div>
          <PillConexion />
          <BotonTema />
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button onClick={onCambiarGarzon} className="btn btn-borde min-w-0">
            <UserRound className="h-4 w-4 shrink-0" />
            <span className="truncate">{garzon?.nombre ?? "Elegir garzón"}</span>
          </button>
          <button onClick={onVerHistorial} className="btn btn-borde">
            <History className="h-4 w-4" /> Historial
          </button>
          <button onClick={onVerAuditoria} className="btn btn-borde">
            <ScrollText className="h-4 w-4" /> Auditoría
          </button>
          {garzon?.rol === "ADMIN" && (
            <button onClick={onVerDashboard} className="btn btn-borde">
              <TrendingUp className="h-4 w-4" /> Dashboard
            </button>
          )}
          <span className="flex-1" />
          {MODO_COMPARTIDO && (
            <button
              onClick={() => void acciones.cerrarSesion()}
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
              className="btn btn-borde !px-3"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Filtros / leyenda por estado del plano */}
        <div className="-mx-1 mt-3 flex items-center gap-1.5 overflow-x-auto px-1 pb-1">
          <ChipFiltro
            activo={!filtro}
            onClick={() => setFiltro(null)}
            etiqueta="Todas"
            conteo={mesas.length}
          />
          {ESTADOS_ORDEN.map(({ estado, plural }) => (
            <ChipFiltro
              key={estado}
              activo={filtro === estado}
              onClick={() => setFiltro((f) => (f === estado ? null : estado))}
              etiqueta={plural}
              conteo={conteo[estado]}
              punto={PUNTO_ESTADO[estado]}
              disabled={conteo[estado] === 0 && filtro !== estado}
            />
          ))}
          <span className="flex-1" />
          <button
            onClick={() => setSoloMias((v) => !v)}
            aria-pressed={soloMias}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-black uppercase tracking-wide transition ${
              soloMias
                ? "bg-verde-600 text-white shadow-suave"
                : "bg-zinc-200 text-zinc-600 dark:bg-white/10 dark:text-zinc-300"
            }`}
          >
            Mis mesas
          </button>
        </div>
      </header>

      {visibles.length === 0 && (
        <p className="tarjeta p-5 text-center text-sm text-zinc-500 dark:text-zinc-400">
          No hay mesas en esta vista: ajusta los filtros o desactiva “Mis
          mesas” para ver las 100 mesas del salón.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {visibles.map((mesa) => {
          const atencion = mesa.atencionActualId
            ? atenciones[mesa.atencionActualId] ?? null
            : null;
          const garzonMesa = atencion?.garzonId
            ? garzones.find((g) => g.id === atencion.garzonId)?.nombre ?? null
            : null;
          return (
            <TarjetaMesa
              key={mesa.id}
              mesa={mesa}
              atencion={atencion}
              garzonNombre={garzonMesa}
              seleccionada={mesa.id === seleccionadaId}
              ahora={ahora}
              onAbrir={onAbrirMesa}
            />
          );
        })}
      </div>
    </div>
  );
}
