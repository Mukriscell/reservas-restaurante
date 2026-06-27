import { Martini } from "lucide-react";
import { useEstadoApp } from "../estado/contexto";
import { TarjetaMesa } from "../componentes/TarjetaMesa";
import { ResumenTurno } from "../componentes/ResumenTurno";
import { PillConexion } from "../componentes/Conexion";
import { BotonTema } from "../componentes/BotonTema";

/** Pantalla principal: las 100 mesas con número, estado y total. */
export function PantallaMesas({
  seleccionadaId,
  onAbrirMesa,
}: {
  seleccionadaId: string | null;
  onAbrirMesa: (mesaId: string) => void;
}) {
  const { mesas } = useEstadoApp();

  return (
    <div className="mx-auto max-w-5xl px-3 pb-10">
      <header className="barra-sup -mx-3 mb-4 px-3 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-verde-600 text-white shadow-realce">
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

        <div className="mt-3">
          <ResumenTurno mesas={mesas} />
        </div>

        <p className="mt-3 flex gap-4 text-xs font-medium text-zinc-500 dark:text-zinc-400">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amarillo-400" />
            Pendiente
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-verde-600 dark:bg-verde-400" />
            Pagada
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-zinc-300 dark:bg-white/20" />
            Libre
          </span>
        </p>
      </header>

      <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
        {mesas.map((mesa) => (
          <TarjetaMesa
            key={mesa.id}
            mesa={mesa}
            seleccionada={mesa.id === seleccionadaId}
            onAbrir={onAbrirMesa}
          />
        ))}
      </div>
    </div>
  );
}
