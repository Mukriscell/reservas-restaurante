import { memo } from "react";
import type { Mesa } from "../tipos";
import { formatCLP } from "../util/dinero";

type EstadoVisual = "libre" | "pendiente" | "pagada";

/** Estado visual derivado: una mesa pendiente sin abrir se muestra "libre". */
function estadoVisual(mesa: Mesa): EstadoVisual {
  if (mesa.estado === "PAGADA") return "pagada";
  if (mesa.fechaApertura || mesa.total > 0) return "pendiente";
  return "libre";
}

const ESTILOS: Record<
  EstadoVisual,
  { contenedor: string; franja: string; rotulo: string; texto: string }
> = {
  libre: {
    contenedor:
      "border-zinc-200 bg-white text-zinc-400 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-500",
    franja: "bg-zinc-300 dark:bg-white/15",
    rotulo: "Libre",
    texto: "text-zinc-400 dark:text-zinc-600",
  },
  pendiente: {
    contenedor:
      "border-amarillo-200 bg-amarillo-50 text-amarillo-900 dark:border-amarillo-400/25 dark:bg-amarillo-400/[0.08] dark:text-amarillo-200",
    franja: "bg-amarillo-400",
    rotulo: "Pendiente",
    texto: "text-amarillo-900 dark:text-amarillo-200",
  },
  pagada: {
    contenedor:
      "border-verde-200 bg-verde-50 text-verde-800 dark:border-verde-500/25 dark:bg-verde-500/[0.08] dark:text-verde-300",
    franja: "bg-verde-600 dark:bg-verde-400",
    rotulo: "Pagada",
    texto: "text-verde-800 dark:text-verde-300",
  },
};

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
  const visual = estadoVisual(mesa);
  const e = ESTILOS[visual];
  return (
    <button
      onClick={() => onAbrir(mesa.id)}
      aria-label={`Mesa ${mesa.numeroMesa}, ${e.rotulo}, ${formatCLP(mesa.total)}${seleccionada ? ", seleccionada" : ""}`}
      className={`group relative flex min-h-[92px] flex-col items-center justify-center gap-0.5 overflow-hidden rounded-2xl border px-1 py-3 shadow-suave transition-all duration-150 hover:-translate-y-0.5 hover:shadow-realce active:scale-95 ${e.contenedor} ${
        seleccionada
          ? "ring-2 ring-azul-600 ring-offset-2 ring-offset-zinc-50 dark:ring-azul-400 dark:ring-offset-azul-950"
          : ""
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute inset-x-0 top-0 h-1 ${e.franja}`}
      />
      <span className="text-2xl font-black leading-none tabular">
        {mesa.numeroMesa}
      </span>
      <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">
        {e.rotulo}
      </span>
      <span className={`text-[11px] font-bold tabular ${e.texto}`}>
        {formatCLP(mesa.total)}
      </span>
    </button>
  );
});
