import { useMemo } from "react";
import type { Mesa } from "../tipos";
import { formatCLP } from "../util/dinero";

/**
 * Resumen del turno calculado en vivo desde las mesas: cuántas están
 * abiertas, cuántas se pagaron y cuánto se lleva cobrado. Es información
 * que el garzón necesita de un vistazo y que antes no existía.
 */
export function ResumenTurno({ mesas }: { mesas: Mesa[] }) {
  const { abiertas, pagadas, cobrado } = useMemo(() => {
    let abiertas = 0;
    let pagadas = 0;
    let cobrado = 0;
    for (const m of mesas) {
      if (m.estado === "PAGADA") {
        pagadas += 1;
        cobrado += m.total;
      } else if (m.fechaApertura || m.total > 0) {
        abiertas += 1;
      }
    }
    return { abiertas, pagadas, cobrado };
  }, [mesas]);

  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="stat">
        <p className="stat-rotulo">Abiertas</p>
        <p className="stat-valor text-amarillo-600 dark:text-amarillo-400">
          {abiertas}
        </p>
      </div>
      <div className="stat">
        <p className="stat-rotulo">Pagadas</p>
        <p className="stat-valor text-verde-700 dark:text-verde-400">
          {pagadas}
        </p>
      </div>
      <div className="stat border-amarillo-200/70 bg-amarillo-50 dark:border-amarillo-400/15 dark:bg-amarillo-400/[0.08]">
        <p className="stat-rotulo text-amarillo-700 dark:text-amarillo-400/80">
          Cobrado
        </p>
        <p className="stat-valor text-amarillo-700 dark:text-amarillo-300">
          {formatCLP(cobrado)}
        </p>
      </div>
    </div>
  );
}
