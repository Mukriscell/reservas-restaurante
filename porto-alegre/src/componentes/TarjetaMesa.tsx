import { memo } from "react";
import { Clock, Plus, UserRound } from "lucide-react";
import type { Atencion, Mesa } from "../tipos";
import { totalCuenta } from "../tipos";
import { formatCLP } from "../util/dinero";
import { tiempoTranscurrido } from "../util/tiempo";
import {
  estadoVisualMesa,
  ETIQUETA_ESTADO,
  type EstadoVisual,
} from "../util/estadoMesa";

/** Paleta premium por estado: tarjeta-mesa, tablero, sillas e indicador. */
const ESTILO: Record<
  EstadoVisual,
  {
    card: string;
    table: string;
    numero: string;
    chair: string;
    punto: string;
    pill: string;
  }
> = {
  libre: {
    card: "border-verde-500/25 bg-gradient-to-b from-verde-500/[0.06] to-transparent dark:border-verde-500/20 dark:from-verde-500/10",
    table:
      "border-verde-500/30 bg-verde-50 dark:bg-verde-500/10 dark:border-verde-400/25",
    numero: "text-verde-700 dark:text-verde-300",
    chair: "bg-verde-500/35 dark:bg-verde-400/30",
    punto: "bg-verde-500",
    pill: "bg-verde-500/12 text-verde-700 dark:bg-verde-500/15 dark:text-verde-300",
  },
  consumiendo: {
    card: "border-amarillo-400/30 bg-gradient-to-b from-amarillo-400/[0.09] to-transparent dark:border-amarillo-400/25 dark:from-amarillo-400/10",
    table:
      "border-amarillo-400/40 bg-amarillo-50 dark:bg-amarillo-400/10 dark:border-amarillo-400/30",
    numero: "text-amarillo-800 dark:text-amarillo-200",
    chair: "bg-amarillo-400/50 dark:bg-amarillo-400/40",
    punto: "bg-amarillo-400",
    pill: "bg-amarillo-400/15 text-amarillo-800 dark:bg-amarillo-400/15 dark:text-amarillo-200",
  },
  por_pagar: {
    card: "border-red-500/40 bg-gradient-to-b from-red-500/[0.11] to-transparent dark:border-red-500/35 dark:from-red-500/12",
    table: "border-red-500/45 bg-red-50 dark:bg-red-500/12 dark:border-red-500/35",
    numero: "text-red-700 dark:text-red-200",
    chair: "bg-red-500/45 dark:bg-red-500/40",
    punto: "bg-red-500",
    pill: "bg-red-500/15 text-red-700 dark:bg-red-500/15 dark:text-red-200",
  },
  cerrada: {
    card: "border-zinc-300/70 bg-zinc-100/50 opacity-80 dark:border-white/10 dark:bg-white/5",
    table: "border-zinc-300 bg-zinc-100 dark:bg-white/5 dark:border-white/10",
    numero: "text-zinc-500 dark:text-zinc-400",
    chair: "bg-zinc-300 dark:bg-white/10",
    punto: "bg-zinc-400",
    pill: "bg-zinc-200 text-zinc-600 dark:bg-white/10 dark:text-zinc-300",
  },
  reservada: {
    card: "border-violet-500/35 bg-gradient-to-b from-violet-500/[0.09] to-transparent dark:border-violet-500/30 dark:from-violet-500/12",
    table:
      "border-violet-500/40 bg-violet-50 dark:bg-violet-500/12 dark:border-violet-400/30",
    numero: "text-violet-700 dark:text-violet-200",
    chair: "bg-violet-500/40 dark:bg-violet-500/35",
    punto: "bg-violet-500",
    pill: "bg-violet-500/15 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200",
  },
};

/**
 * Mesa del plano de salón (POS): tablero redondo visto desde arriba con
 * sillas, número permanente al centro, total acumulado, garzón responsable
 * y tiempo en mesa. El color comunica el estado de un vistazo.
 */
export const TarjetaMesa = memo(function TarjetaMesa({
  mesa,
  atencion,
  garzonNombre,
  seleccionada,
  ahora,
  reservada = false,
  onAbrir,
}: {
  mesa: Mesa;
  /** Atención abierta de la mesa (null si está libre). */
  atencion: Atencion | null;
  garzonNombre: string | null;
  seleccionada: boolean;
  /** Reloj compartido (epoch ms) para el tiempo en mesa. */
  ahora: number;
  /** Reserva externa (futura integración con MESALISTA). */
  reservada?: boolean;
  onAbrir: (mesaId: string) => void;
}) {
  const estado = estadoVisualMesa(mesa, atencion, reservada);
  const e = ESTILO[estado];
  const activa = estado === "consumiendo" || estado === "por_pagar";
  const total = atencion ? totalCuenta(atencion) : 0;
  const tiempo =
    activa && atencion ? tiempoTranscurrido(atencion.fechaApertura, ahora) : null;

  const lectura =
    `Mesa ${mesa.numero}, ${ETIQUETA_ESTADO[estado]}` +
    (activa
      ? `, total ${formatCLP(total)}${garzonNombre ? `, atiende ${garzonNombre}` : ""}${tiempo ? `, hace ${tiempo}` : ""}`
      : "") +
    (seleccionada ? ", seleccionada" : "");

  return (
    <button
      onClick={() => onAbrir(mesa.id)}
      aria-label={lectura}
      className={`relative flex min-h-[156px] flex-col items-center justify-between gap-1.5 rounded-3xl border p-3 text-center shadow-suave transition active:scale-[0.97] ${e.card} ${
        seleccionada
          ? "ring-2 ring-azul-600 ring-offset-2 ring-offset-zinc-100 dark:ring-azul-400 dark:ring-offset-azul-950"
          : ""
      }`}
    >
      {/* Encabezado: estado + tiempo en mesa */}
      <div className="flex w-full items-center justify-between gap-1">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${e.pill}`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${e.punto} ${
              estado === "por_pagar" ? "animate-pulse" : ""
            }`}
          />
          {ETIQUETA_ESTADO[estado]}
        </span>
        {tiempo && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold tabular-nums text-zinc-500 dark:text-zinc-400">
            <Clock className="h-3 w-3" />
            {tiempo}
          </span>
        )}
      </div>

      {/* Mesa vista desde arriba: tablero redondo + sillas */}
      <span className="relative grid h-[84px] w-[84px] shrink-0 place-items-center">
        <span
          className={`absolute left-1/2 top-0 h-2.5 w-7 -translate-x-1/2 rounded-full ${e.chair}`}
        />
        <span
          className={`absolute bottom-0 left-1/2 h-2.5 w-7 -translate-x-1/2 rounded-full ${e.chair}`}
        />
        <span
          className={`absolute left-0 top-1/2 h-7 w-2.5 -translate-y-1/2 rounded-full ${e.chair}`}
        />
        <span
          className={`absolute right-0 top-1/2 h-7 w-2.5 -translate-y-1/2 rounded-full ${e.chair}`}
        />
        <span
          className={`relative grid h-[58px] w-[58px] place-items-center rounded-full border shadow-suave ${e.table}`}
        >
          {/* Brillo del tablero (apariencia de mesa real) */}
          <span className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_32%_26%,rgba(255,255,255,0.4),transparent_58%)] dark:bg-[radial-gradient(circle_at_32%_26%,rgba(255,255,255,0.13),transparent_58%)]" />
          <span className={`relative text-2xl font-black leading-none ${e.numero}`}>
            {mesa.numero}
          </span>
        </span>
      </span>

      {/* Pie: total + garzón, o pista según el estado */}
      <div className="flex min-h-[18px] w-full items-center justify-between gap-1">
        {activa ? (
          <>
            <span className="text-sm font-black tabular-nums text-zinc-800 dark:text-zinc-100">
              {formatCLP(total)}
            </span>
            {garzonNombre && (
              <span className="flex min-w-0 items-center gap-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                <UserRound className="h-3 w-3 shrink-0" />
                <span className="truncate">{garzonNombre}</span>
              </span>
            )}
          </>
        ) : estado === "libre" ? (
          <span className="mx-auto inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-verde-700/70 dark:text-verde-300/70">
            <Plus className="h-3 w-3" />
            Abrir
          </span>
        ) : (
          <span className="mx-auto text-[11px] font-semibold uppercase tracking-wide opacity-60">
            {estado === "reservada" ? "Reservada" : "Cuenta cerrada"}
          </span>
        )}
      </div>
    </button>
  );
});
