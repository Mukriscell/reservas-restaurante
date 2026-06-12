import { useMemo } from "react";
import { ArrowLeft, History } from "lucide-react";
import { totalCuenta } from "../tipos";
import { useHistorial } from "../estado/contexto";
import { formatCLP } from "../util/dinero";
import { ItemAtencion } from "../componentes/ItemAtencion";
import { PillConexion } from "../componentes/Conexion";

/**
 * Historial de ventas: atenciones PAGADAS de todas las mesas, más
 * recientes primero. Se consulta SIEMPRE desde atenciones/consumos/
 * abonos (nunca desde el estado actual de las mesas), por lo que puede
 * crecer sin límite aunque las mesas se reutilicen infinitamente.
 */
export function PantallaHistorial({
  onVolver,
  onVerDesglose,
}: {
  onVolver: () => void;
  onVerDesglose: (atencionId: string) => void;
}) {
  const { atenciones, cargando } = useHistorial(undefined, 100);

  const resumenHoy = useMemo(() => {
    const hoy = new Date().toDateString();
    const deHoy = atenciones.filter(
      (a) => a.fechaCierre && new Date(a.fechaCierre).toDateString() === hoy
    );
    return {
      cantidad: deHoy.length,
      total: deHoy.reduce((s, a) => s + totalCuenta(a), 0),
    };
  }, [atenciones]);

  return (
    <div className="mx-auto max-w-xl px-3 pb-10">
      <header className="sticky top-0 z-20 -mx-3 mb-4 border-b border-zinc-200/80 bg-zinc-100/95 px-3 py-3 backdrop-blur dark:border-white/10 dark:bg-azul-950/95">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onVolver}
            aria-label="Volver a las mesas"
            className="btn btn-borde h-12 w-12 !px-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="flex flex-1 items-center gap-2 text-lg font-black tracking-tight">
            <History className="h-5 w-5 text-verde-700 dark:text-amarillo-400" />
            Historial de atenciones
          </h1>
          <PillConexion />
        </div>

        <div className="mt-3 flex items-baseline justify-between rounded-2xl bg-azul-950 px-4 py-2.5 text-white dark:bg-azul-900">
          <span className="text-xs font-black uppercase tracking-[0.15em]">
            Hoy · {resumenHoy.cantidad}{" "}
            {resumenHoy.cantidad === 1 ? "cuenta" : "cuentas"}
          </span>
          <span className="text-xl font-black text-amarillo-400">
            {formatCLP(resumenHoy.total)}
          </span>
        </div>
      </header>

      <section className="tarjeta p-4">
        {cargando && atenciones.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Cargando historial…
          </p>
        ) : atenciones.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Aún no hay atenciones cerradas: cobra la primera mesa y aparecerá
            aquí.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-white/10">
            {atenciones.map((a) => (
              <ItemAtencion
                key={a.id}
                atencion={a}
                conMesa
                onVer={onVerDesglose}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
