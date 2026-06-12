import { ChevronRight } from "lucide-react";
import type { Atencion } from "../tipos";
import { totalCuenta } from "../tipos";
import { useEstadoApp, useGarzon } from "../estado/contexto";
import { formatCLP } from "../util/dinero";
import { formatFechaHora } from "../util/fechas";

/** Fila del historial: atención cerrada con sus totales congelados. */
export function ItemAtencion({
  atencion,
  conMesa,
  onVer,
}: {
  atencion: Atencion;
  /** Mostrar el número de mesa (en el historial global). */
  conMesa: boolean;
  onVer: (atencionId: string) => void;
}) {
  const { mesas } = useEstadoApp();
  const garzon = useGarzon(atencion.garzonId);
  const mesa = mesas.find((m) => m.id === atencion.mesaId);

  return (
    <li>
      <button
        onClick={() => onVer(atencion.id)}
        className="flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left transition hover:bg-zinc-100 active:bg-zinc-200 dark:hover:bg-white/10 dark:active:bg-white/15"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">
            Atención #{atencion.numero}
            {conMesa && mesa ? ` · Mesa ${mesa.numero}` : ""}
          </p>
          <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
            {atencion.fechaCierre ? formatFechaHora(atencion.fechaCierre) : "—"}
            {garzon ? ` · ${garzon.nombre}` : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-black text-verde-700 dark:text-amarillo-400">
            {formatCLP(totalCuenta(atencion))}
          </p>
          {atencion.totalAbonos > 0 && (
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              abonos −{formatCLP(atencion.totalAbonos)}
            </p>
          )}
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
      </button>
    </li>
  );
}
