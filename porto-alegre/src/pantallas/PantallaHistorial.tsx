import { useMemo, useState } from "react";
import { ArrowLeft, History, Trash2 } from "lucide-react";
import { totalCuenta } from "../tipos";
import { useAcciones, useGarzonActual, useHistorial } from "../estado/contexto";
import { formatCLP } from "../util/dinero";
import { ItemAtencion } from "../componentes/ItemAtencion";
import { PillConexion } from "../componentes/Conexion";

/** "YYYY-MM-DD" (local) → ISO del inicio de ese día. */
function inicioDia(fecha: string): string {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(a, m - 1, d).toISOString();
}
/** "YYYY-MM-DD" (local) → ISO del inicio del día SIGUIENTE (límite < ). */
function finDia(fecha: string): string {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(a, m - 1, d + 1).toISOString();
}

/**
 * Historial de ventas: atenciones PAGADAS de todas las mesas, más
 * recientes primero. Se consulta SIEMPRE desde atenciones/consumos/
 * abonos (nunca desde el estado actual de las mesas). El ADMIN puede
 * limpiar el historial por rango de fechas (sin tocar usuarios ni
 * auditoría).
 */
export function PantallaHistorial({
  onVolver,
  onVerDesglose,
}: {
  onVolver: () => void;
  onVerDesglose: (atencionId: string) => void;
}) {
  const acciones = useAcciones();
  const { garzon } = useGarzonActual();
  const esAdmin = garzon?.rol === "ADMIN";
  const [version, setVersion] = useState(0);
  const { atenciones, cargando } = useHistorial(undefined, 100, version);

  const [limpieza, setLimpieza] = useState(false);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [procesando, setProcesando] = useState(false);

  const resumenHoy = useMemo(() => {
    const hoy = new Date().toDateString();
    const deHoy = atenciones.filter(
      (a) => a.fechaCierre && new Date(a.fechaCierre).toDateString() === hoy
    );
    return {
      cantidad: deHoy.length,
      total: deHoy.reduce((s, a) => s + totalCuenta(a), 0),
      propinas: deHoy.reduce((s, a) => s + a.propinaMonto, 0),
    };
  }, [atenciones]);

  async function limpiar() {
    if (procesando) return;
    setProcesando(true);
    const n = await acciones.limpiarHistorial(
      desde ? inicioDia(desde) : null,
      hasta ? finDia(hasta) : null
    );
    setProcesando(false);
    setConfirmando(false);
    if (n !== null) {
      setLimpieza(false);
      setVersion((v) => v + 1); // fuerza relectura del historial
    }
  }

  return (
    <div className="mx-auto max-w-xl px-3 pb-10">
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
            <History className="h-5 w-5 text-verde-700 dark:text-amarillo-400" />
            Historial de atenciones
          </h1>
          {esAdmin && (
            <button
              onClick={() => setLimpieza((v) => !v)}
              aria-label="Limpiar historial"
              title="Limpiar historial"
              className="btn btn-borde btn-icono"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <PillConexion />
        </div>

        <div className="mt-3 flex items-baseline justify-between rounded-2xl bg-azul-950 px-4 py-2.5 text-white dark:bg-azul-900">
          <span className="text-xs font-black uppercase tracking-[0.15em]">
            Hoy · {resumenHoy.cantidad}{" "}
            {resumenHoy.cantidad === 1 ? "cuenta" : "cuentas"}
            {resumenHoy.propinas > 0 && (
              <span className="ml-1 normal-case opacity-80">
                · propinas {formatCLP(resumenHoy.propinas)}
              </span>
            )}
          </span>
          <span className="text-xl font-black text-amarillo-400">
            {formatCLP(resumenHoy.total)}
          </span>
        </div>

        {esAdmin && limpieza && (
          <div className="mt-3 rounded-2xl border border-red-300 bg-red-50 p-3 dark:border-red-500/30 dark:bg-red-500/10">
            <p className="text-sm font-bold text-red-800 dark:text-red-300">
              Limpiar historial de cuentas cerradas
            </p>
            <p className="mt-0.5 text-xs text-red-700/80 dark:text-red-300/80">
              Borra atenciones PAGADAS y sus consumos/abonos en el rango. No
              afecta usuarios, productos ni la auditoría. Deja sin fecha para
              limpiar todo el historial.
            </p>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <label className="text-xs font-semibold text-red-800 dark:text-red-300">
                Desde
                <input
                  type="date"
                  value={desde}
                  onChange={(e) => setDesde(e.target.value)}
                  className="mt-1 block min-h-10 rounded-lg border border-red-300 bg-white px-2 text-sm dark:border-red-500/30 dark:bg-white/5"
                />
              </label>
              <label className="text-xs font-semibold text-red-800 dark:text-red-300">
                Hasta
                <input
                  type="date"
                  value={hasta}
                  onChange={(e) => setHasta(e.target.value)}
                  className="mt-1 block min-h-10 rounded-lg border border-red-300 bg-white px-2 text-sm dark:border-red-500/30 dark:bg-white/5"
                />
              </label>
              {confirmando ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => void limpiar()}
                    disabled={procesando}
                    className="btn btn-peligro"
                  >
                    Sí, eliminar
                  </button>
                  <button
                    onClick={() => setConfirmando(false)}
                    disabled={procesando}
                    className="btn btn-borde"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmando(true)}
                  className="btn btn-peligro"
                >
                  <Trash2 className="h-4 w-4" /> Limpiar
                </button>
              )}
            </div>
          </div>
        )}
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
