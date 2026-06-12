import { useMemo, useState } from "react";
import { History, LogOut, Martini, ScrollText, UserRound } from "lucide-react";
import { useAcciones, useEstadoApp, useGarzonActual } from "../estado/contexto";
import { MODO_COMPARTIDO } from "../sync/supabase";
import { TarjetaMesa } from "../componentes/TarjetaMesa";
import { PillConexion } from "../componentes/Conexion";
import { BotonTema } from "../componentes/BotonTema";

/** Pantalla principal: las 100 mesas permanentes y su estado actual. */
export function PantallaMesas({
  seleccionadaId,
  onAbrirMesa,
  onVerHistorial,
  onVerAuditoria,
  onCambiarGarzon,
}: {
  seleccionadaId: string | null;
  onAbrirMesa: (mesaId: string) => void;
  onVerHistorial: () => void;
  onVerAuditoria: () => void;
  onCambiarGarzon: () => void;
}) {
  const { mesas, atenciones, garzones } = useEstadoApp();
  const { garzonId, garzon } = useGarzonActual();
  const acciones = useAcciones();
  // "Mis mesas": el garzón filtra la grilla a sus atenciones abiertas.
  const [soloMias, setSoloMias] = useState(false);

  const visibles = useMemo(() => {
    if (!soloMias || !garzonId) return mesas;
    return mesas.filter((m) => {
      const atencion = m.atencionActualId ? atenciones[m.atencionActualId] : null;
      return atencion?.garzonId === garzonId;
    });
  }, [soloMias, garzonId, mesas, atenciones]);

  return (
    <div className="mx-auto max-w-5xl px-3 pb-10">
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
              Restobar · Gestión de mesas
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

        <p className="mt-3 flex gap-4 text-xs font-medium text-zinc-500 dark:text-zinc-400">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-verde-600 dark:bg-verde-400" />
            Libre
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amarillo-400" />
            Ocupada
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-azul-700 dark:bg-azul-400" />
            Seleccionada
          </span>
          <button
            onClick={() => setSoloMias((v) => !v)}
            aria-pressed={soloMias}
            className={`ml-auto rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wide transition ${
              soloMias
                ? "bg-azul-700 text-white dark:bg-azul-500"
                : "bg-zinc-200 text-zinc-600 dark:bg-white/10 dark:text-zinc-300"
            }`}
          >
            Mis mesas
          </button>
        </p>
      </header>

      {visibles.length === 0 && (
        <p className="tarjeta p-5 text-center text-sm text-zinc-500 dark:text-zinc-400">
          No tienes mesas abiertas a tu nombre: desactiva “Mis mesas” para
          ver las 100 mesas y abrir una atención.
        </p>
      )}

      <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
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
              onAbrir={onAbrirMesa}
            />
          );
        })}
      </div>
    </div>
  );
}
