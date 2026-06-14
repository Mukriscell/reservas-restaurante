import { useState } from "react";
import { HandCoins, Trash2 } from "lucide-react";
import type { Abono } from "../tipos";
import { useAcciones, useGarzon } from "../estado/contexto";
import { formatCLP } from "../util/dinero";
import { formatFechaHora } from "../util/fechas";

function LineaAbono({
  abono,
  bloqueada,
  onEliminar,
}: {
  abono: Abono;
  bloqueada: boolean;
  onEliminar: (abonoId: string) => void;
}) {
  const garzon = useGarzon(abono.garzonId);
  return (
    <li className="flex items-center gap-2 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">
          {abono.observacion || "Abono"}
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {formatFechaHora(abono.creadoEn)}
          {garzon ? ` · ${garzon.nombre}` : ""}
        </p>
      </div>
      <span className="text-sm font-bold text-verde-700 dark:text-verde-400">
        −{formatCLP(abono.monto)}
      </span>
      {!bloqueada && (
        <button
          onClick={() => onEliminar(abono.id)}
          aria-label="Eliminar abono"
          className="rounded-lg p-2 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </li>
  );
}

/**
 * Pagos parciales de la atención: lista + formulario. El saldo pendiente
 * (total − abonos) se muestra en el header de la mesa.
 */
export function SeccionAbonos({
  atencionId,
  abonos,
  bloqueada,
}: {
  atencionId: string;
  abonos: Abono[];
  bloqueada: boolean;
}) {
  const acciones = useAcciones();
  const [monto, setMonto] = useState("");
  const [observacion, setObservacion] = useState("");
  const [guardando, setGuardando] = useState(false);

  const montoNumero = Number(monto);
  const valido = Number.isFinite(montoNumero) && montoNumero > 0;

  async function abonar() {
    if (!valido || guardando) return;
    setGuardando(true);
    const ok = await acciones.agregarAbono(atencionId, montoNumero, observacion);
    setGuardando(false);
    if (ok) {
      setMonto("");
      setObservacion("");
    }
  }

  return (
    <section className="tarjeta p-4">
      <h2 className="flex items-center gap-1.5 text-sm font-bold text-verde-700 dark:text-verde-400">
        <HandCoins className="h-4 w-4" /> Abonos ({abonos.length})
      </h2>

      {abonos.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Sin pagos parciales.
        </p>
      ) : (
        <ul className="mt-1 divide-y divide-zinc-100 dark:divide-white/10">
          {abonos.map((a) => (
            <LineaAbono
              key={a.id}
              abono={a}
              bloqueada={bloqueada}
              onEliminar={(id) => void acciones.eliminarAbono(id)}
            />
          ))}
        </ul>
      )}

      {!bloqueada && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-zinc-100 pt-3 dark:border-white/10">
          <input
            value={monto}
            onChange={(e) => setMonto(e.target.value.replace(/[^\d]/g, ""))}
            inputMode="numeric"
            placeholder="Monto $"
            aria-label="Monto del abono en pesos"
            className="min-h-12 w-28 rounded-xl border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-verde-600 dark:border-white/15 dark:bg-white/5"
          />
          <input
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void abonar();
            }}
            placeholder="Observación (efectivo, tarjeta…)"
            aria-label="Observación del abono"
            className="min-h-12 min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-verde-600 dark:border-white/15 dark:bg-white/5"
          />
          <button
            onClick={() => void abonar()}
            disabled={!valido || guardando}
            className="btn btn-verde disabled:opacity-40"
          >
            Abonar
          </button>
        </div>
      )}
    </section>
  );
}
