import { memo } from "react";
import type { Atencion, Mesa } from "../tipos";
import { totalCuenta } from "../tipos";
import { formatCLP } from "../util/dinero";

/** Celda de la grilla: número permanente, estado y cuenta en curso. */
export const TarjetaMesa = memo(function TarjetaMesa({
  mesa,
  atencion,
  garzonNombre,
  seleccionada,
  onAbrir,
}: {
  mesa: Mesa;
  /** Atención abierta de la mesa (null si está libre). */
  atencion: Atencion | null;
  garzonNombre: string | null;
  seleccionada: boolean;
  onAbrir: (mesaId: string) => void;
}) {
  const ocupada = mesa.estado === "OCUPADA";
  const colores = ocupada
    ? "border-amarillo-200 bg-amarillo-50 text-amarillo-900 dark:border-amarillo-400/25 dark:bg-amarillo-400/10 dark:text-amarillo-300"
    : "border-verde-200 bg-verde-50 text-verde-800 dark:border-verde-500/25 dark:bg-verde-500/10 dark:text-verde-300";
  const detalle = ocupada
    ? `${formatCLP(atencion ? totalCuenta(atencion) : 0)}${garzonNombre ? `, atiende ${garzonNombre}` : ""}`
    : "libre";
  return (
    <button
      onClick={() => onAbrir(mesa.id)}
      aria-label={`Mesa ${mesa.numero}, ${ocupada ? "ocupada" : "libre"}, ${detalle}${seleccionada ? ", seleccionada" : ""}`}
      className={`flex min-h-[88px] flex-col items-center justify-center gap-0.5 rounded-2xl border px-1 py-3 shadow-suave transition active:scale-95 ${colores} ${
        seleccionada
          ? "ring-2 ring-azul-700 ring-offset-2 ring-offset-zinc-100 dark:ring-azul-400 dark:ring-offset-azul-950"
          : ""
      }`}
    >
      <span className="text-xl font-black leading-none">{mesa.numero}</span>
      <span className="text-[10px] font-bold uppercase tracking-wider opacity-75">
        {ocupada ? "Ocupada" : "Libre"}
      </span>
      {ocupada ? (
        <>
          <span className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
            {formatCLP(atencion ? totalCuenta(atencion) : 0)}
          </span>
          {garzonNombre && (
            <span className="max-w-full truncate px-1 text-[10px] text-zinc-500 dark:text-zinc-400">
              {garzonNombre}
            </span>
          )}
        </>
      ) : (
        <span className="text-[11px] font-semibold opacity-60">—</span>
      )}
    </button>
  );
});
