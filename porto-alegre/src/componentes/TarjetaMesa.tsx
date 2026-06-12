import { memo } from "react";
import type { Mesa } from "../tipos";
import { formatCLP } from "../util/dinero";

/** Celda de la grilla de mesas: número, estado y total acumulado. */
export const TarjetaMesa = memo(function TarjetaMesa({
  mesa,
  seleccionada,
  onAbrir,
}: {
  mesa: Mesa;
  seleccionada: boolean;
  onAbrir: (mesaId: string) => void;
}) {
  const pagada = mesa.estado === "PAGADA";
  const colores = pagada
    ? "border-verde-200 bg-verde-50 text-verde-800 dark:border-verde-500/25 dark:bg-verde-500/10 dark:text-verde-300"
    : "border-amarillo-200 bg-amarillo-50 text-amarillo-900 dark:border-amarillo-400/25 dark:bg-amarillo-400/10 dark:text-amarillo-300";
  return (
    <button
      onClick={() => onAbrir(mesa.id)}
      aria-label={`Mesa ${mesa.numeroMesa}, ${mesa.estado}, ${formatCLP(mesa.total)}${seleccionada ? ", seleccionada" : ""}`}
      className={`flex min-h-[88px] flex-col items-center justify-center gap-0.5 rounded-2xl border px-1 py-3 shadow-suave transition active:scale-95 ${colores} ${
        seleccionada
          ? "ring-2 ring-azul-700 ring-offset-2 ring-offset-zinc-100 dark:ring-azul-400 dark:ring-offset-azul-950"
          : ""
      }`}
    >
      <span className="text-xl font-black leading-none">{mesa.numeroMesa}</span>
      <span className="text-[10px] font-bold uppercase tracking-wider opacity-75">
        {pagada ? "Pagada" : "Pendiente"}
      </span>
      <span className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
        {formatCLP(mesa.total)}
      </span>
    </button>
  );
});
