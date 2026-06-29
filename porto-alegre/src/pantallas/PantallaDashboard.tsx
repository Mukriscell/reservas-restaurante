import { useMemo, useState } from "react";
import { ArrowLeft, Coins, Crown, RotateCcw, TrendingUp } from "lucide-react";
import { useDashboard } from "../estado/contexto";
import { formatCLP } from "../util/dinero";
import { PillConexion } from "../componentes/Conexion";

type Rango = "hoy" | "mes" | "todo";

/** Límites ISO [desde, hasta) del rango elegido (en hora local). */
function limites(rango: Rango): { desde: string | null; hasta: string | null } {
  if (rango === "todo") return { desde: null, hasta: null };
  const ahora = new Date();
  const inicioDia = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  if (rango === "hoy") {
    const finDia = new Date(inicioDia.getTime() + 24 * 60 * 60 * 1000);
    return { desde: inicioDia.toISOString(), hasta: finDia.toISOString() };
  }
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
  return { desde: inicioMes.toISOString(), hasta: null };
}

const RANGOS: [Rango, string][] = [
  ["hoy", "Hoy"],
  ["mes", "Este mes"],
  ["todo", "Histórico"],
];

/**
 * Dashboard de propinas (exclusivo de ADMIN): total y promedio de
 * propinas, total de ventas y ranking de propinas por garzón.
 */
export function PantallaDashboard({ onVolver }: { onVolver: () => void }) {
  const [rango, setRango] = useState<Rango>("hoy");
  const [version, setVersion] = useState(0);
  const { desde, hasta } = useMemo(() => limites(rango), [rango]);
  const { resumen, cargando } = useDashboard(desde, hasta, version);

  const maxPropina = resumen.filas.reduce(
    (m, f) => Math.max(m, f.totalPropinas),
    0
  );

  return (
    <div className="mx-auto max-w-2xl px-3 pb-10">
      <header className="barra-sup -mx-3 mb-4 px-3 py-3">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onVolver}
            aria-label="Volver a las mesas"
            className="btn btn-borde btn-icono"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="flex flex-1 items-center gap-2 text-lg font-black tracking-tight">
            <TrendingUp className="h-5 w-5 text-verde-700 dark:text-amarillo-400" />
            Dashboard de propinas
          </h1>
          <button
            onClick={() => setVersion((v) => v + 1)}
            aria-label="Actualizar"
            className="btn btn-borde btn-icono"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <PillConexion />
        </div>

        <div className="mt-3 flex gap-2">
          {RANGOS.map(([valor, etiqueta]) => (
            <button
              key={valor}
              onClick={() => setRango(valor)}
              className={`flex-1 rounded-xl border px-3 py-2 text-sm font-bold transition ${
                rango === valor
                  ? "border-verde-600 bg-verde-600 text-white"
                  : "border-zinc-300 bg-white text-zinc-700 dark:border-white/15 dark:bg-white/5 dark:text-zinc-200"
              }`}
            >
              {etiqueta}
            </button>
          ))}
        </div>
      </header>

      {/* Tarjetas resumen */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="rounded-2xl border border-verde-500/25 bg-verde-50 p-3 shadow-suave dark:border-verde-500/20 dark:bg-verde-500/[0.08]">
          <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-verde-700/80 dark:text-verde-400/80">
            <Coins className="h-3.5 w-3.5" /> Total propinas
          </p>
          <p className="mt-1 text-lg font-black leading-tight text-verde-700 dark:text-verde-300">
            {formatCLP(resumen.totalPropinas)}
          </p>
        </div>
        <div className="tarjeta p-3">
          <p className="text-[10px] font-black uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
            Promedio / cuenta
          </p>
          <p className="mt-1 text-lg font-black leading-tight">
            {formatCLP(resumen.promedioPropina)}
          </p>
        </div>
        <div className="tarjeta p-3">
          <p className="text-[10px] font-black uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
            Cuentas
          </p>
          <p className="mt-1 text-lg font-black leading-tight">{resumen.cuentas}</p>
        </div>
      </div>

      {/* Ranking por garzón */}
      <section className="tarjeta mt-3 p-4">
        <h2 className="text-sm font-bold text-verde-700 dark:text-verde-400">
          Ranking de propinas por garzón
        </h2>
        {cargando && resumen.filas.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Cargando…
          </p>
        ) : resumen.filas.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            No hay cuentas cerradas en este rango.
          </p>
        ) : (
          <ol className="mt-2 space-y-2">
            {resumen.filas.map((f, i) => (
              <li key={f.garzonId ?? `-${i}`} className="flex items-center gap-3">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${
                    i === 0
                      ? "bg-amarillo-400 text-azul-950 shadow-glow-amarillo"
                      : i === 1
                        ? "bg-zinc-300 text-zinc-700 dark:bg-zinc-400/30 dark:text-zinc-100"
                        : i === 2
                          ? "bg-orange-400 text-orange-950 dark:bg-orange-500/30 dark:text-orange-200"
                          : "bg-zinc-200 text-zinc-600 dark:bg-white/10 dark:text-zinc-300"
                  }`}
                >
                  {i === 0 ? <Crown className="h-4 w-4" /> : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-bold">{f.nombre}</span>
                    <span className="shrink-0 text-sm font-black text-verde-700 dark:text-amarillo-400">
                      {formatCLP(f.totalPropinas)}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10">
                    <div
                      className="h-full rounded-full bg-verde-600 dark:bg-verde-500"
                      style={{
                        width: `${maxPropina > 0 ? (f.totalPropinas / maxPropina) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                    {f.cuentas} {f.cuentas === 1 ? "cuenta" : "cuentas"} · ventas{" "}
                    {formatCLP(f.totalVentas)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
