import { memo } from "react";
import type { Mesa } from "../tipos";
import { formatCLP } from "../util/dinero";

/** Celda de la grilla de mesas: número, estado y total acumulado. */
export const TarjetaMesa = memo(function TarjetaMesa({
  mesa,
  onAbrir,
}: {
  mesa: Mesa;
  onAbrir: (mesaId: string) => void;
}) {
  const pagada = mesa.estado === "PAGADA";
  return (
    <button
      onClick={() => onAbrir(mesa.id)}
      aria-label={`Mesa ${mesa.numeroMesa}, ${mesa.estado}, ${formatCLP(mesa.total)}`}
      className={`flex flex-col items-center rounded-xl border px-1 py-2.5 transition active:scale-95 ${
        pagada
          ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
          : "border-yellow-500/50 bg-yellow-500/10 text-yellow-200"
      }`}
    >
      <span className="text-lg font-bold leading-none">{mesa.numeroMesa}</span>
      <span className="mt-1 text-[10px] font-semibold uppercase tracking-wide opacity-80">
        {pagada ? "Pagada" : "Pendiente"}
      </span>
      <span className="mt-0.5 text-[11px] font-medium text-stone-300">
        {formatCLP(mesa.total)}
      </span>
    </button>
  );
});
