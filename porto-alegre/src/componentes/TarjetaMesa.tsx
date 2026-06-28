import { memo } from "react";
import { Clock, Lock, Plus, UserRound } from "lucide-react";
import type { Atencion, Mesa } from "../tipos";
import { totalCuenta } from "../tipos";
import { formatCLP } from "../util/dinero";
import { tiempoTranscurrido } from "../util/tiempo";
import {
  estadoVisualMesa,
  ETIQUETA_ESTADO,
  type EstadoVisual,
} from "../util/estadoMesa";

/** Estilo neón por estado: anillo brillante, número y pill. */
const ESTILO: Record<
  EstadoVisual,
  {
    card: string;
    ring: string;
    glow: string;
    numero: string;
    dot: string;
    pill: string;
    pulso?: boolean;
  }
> = {
  libre: {
    card: "border-verde-500/20 bg-white dark:border-verde-500/15 dark:bg-verde-500/[0.04]",
    ring: "border-verde-400 dark:border-verde-400",
    glow: "shadow-glow-verde",
    numero: "text-verde-600 dark:text-verde-300",
    dot: "bg-verde-500",
    pill: "text-verde-700 dark:text-verde-300",
  },
  consumiendo: {
    card: "border-amarillo-400/25 bg-white dark:border-amarillo-400/15 dark:bg-amarillo-400/[0.05]",
    ring: "border-amarillo-400",
    glow: "shadow-glow-amarillo",
    numero: "text-amarillo-600 dark:text-amarillo-300",
    dot: "bg-amarillo-400",
    pill: "text-amarillo-700 dark:text-amarillo-300",
  },
  por_pagar: {
    card: "border-red-500/30 bg-white dark:border-red-500/20 dark:bg-red-500/[0.06]",
    ring: "border-red-500",
    glow: "shadow-glow-rojo",
    numero: "text-red-600 dark:text-red-300",
    dot: "bg-red-500",
    pill: "text-red-600 dark:text-red-300",
    pulso: true,
  },
  reservada: {
    card: "border-violet-500/25 bg-white dark:border-violet-500/15 dark:bg-violet-500/[0.06]",
    ring: "border-violet-400",
    glow: "shadow-glow-violeta",
    numero: "text-violet-600 dark:text-violet-300",
    dot: "bg-violet-500",
    pill: "text-violet-700 dark:text-violet-300",
  },
  cerrada: {
    card: "border-zinc-300/60 bg-zinc-50 opacity-80 dark:border-white/10 dark:bg-white/[0.03]",
    ring: "border-zinc-300 dark:border-white/20",
    glow: "",
    numero: "text-zinc-400 dark:text-zinc-500",
    dot: "bg-zinc-400",
    pill: "text-zinc-500 dark:text-zinc-400",
  },
};

/**
 * Mesa del plano de salón como anillo neón (estilo POS): el color y el
 * resplandor comunican el estado de un vistazo; número permanente al centro,
 * total acumulado, garzón a cargo y tiempo en mesa.
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
  atencion: Atencion | null;
  garzonNombre: string | null;
  seleccionada: boolean;
  ahora: number;
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
      className={`relative flex min-h-[150px] flex-col items-center justify-center gap-2.5 rounded-3xl border p-3 text-center transition-all duration-150 hover:-translate-y-0.5 active:scale-[0.97] ${e.card} ${
        seleccionada
          ? "ring-2 ring-azul-500 ring-offset-2 ring-offset-zinc-50 dark:ring-azul-400 dark:ring-offset-azul-950"
          : ""
      }`}
    >
      {tiempo && (
        <span className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 text-[10px] font-bold tabular text-zinc-400 dark:text-zinc-500">
          <Clock className="h-3 w-3" />
          {tiempo}
        </span>
      )}

      {/* Anillo neón con el número */}
      <span
        className={`grid h-[68px] w-[68px] place-items-center rounded-full border-2 bg-white dark:bg-azul-950 ${e.ring} ${e.glow} ${
          e.pulso ? "animate-pulse" : ""
        }`}
      >
        <span className={`text-2xl font-black leading-none tabular ${e.numero}`}>
          {mesa.numero}
        </span>
      </span>

      {/* Etiqueta de estado */}
      <span
        className={`inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider ${e.pill}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${e.dot}`} />
        {ETIQUETA_ESTADO[estado]}
      </span>

      {/* Pie: total + garzón / abrir / cuenta cerrada */}
      <div className="flex min-h-[16px] w-full items-center justify-center gap-1.5">
        {activa ? (
          <>
            <span className="text-sm font-black tabular text-zinc-800 dark:text-zinc-100">
              {formatCLP(total)}
            </span>
            {garzonNombre && (
              <span className="flex min-w-0 items-center gap-0.5 text-[10px] font-medium text-zinc-400 dark:text-zinc-500">
                <UserRound className="h-3 w-3 shrink-0" />
                <span className="truncate">{garzonNombre}</span>
              </span>
            )}
          </>
        ) : estado === "libre" ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-verde-600/80 dark:text-verde-400/80">
            <Plus className="h-3 w-3" /> Abrir
          </span>
        ) : estado === "cerrada" ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
            <Lock className="h-3 w-3" /> Cerrada
          </span>
        ) : (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-500">
            Reservada
          </span>
        )}
      </div>
    </button>
  );
});
