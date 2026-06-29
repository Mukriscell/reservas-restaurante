import { useMemo } from "react";
import { Coins, HandCoins, Wallet } from "lucide-react";
import type { Atencion } from "../tipos";
import { totalCuenta, saldoPendiente } from "../tipos";
import { formatCLP } from "../util/dinero";

/**
 * Resumen del turno en dinero, derivado de las atenciones ABIERTAS (las que
 * ya están cargadas en el estado). Complementa los chips de conteo: cuántas
 * cuentas hay abiertas, cuánto suman en el salón y cuánto queda por cobrar.
 */
export function ResumenTurno({
  atenciones,
}: {
  atenciones: Record<string, Atencion>;
}) {
  const { abiertas, enSalon, porCobrar } = useMemo(() => {
    let abiertas = 0;
    let enSalon = 0;
    let porCobrar = 0;
    for (const a of Object.values(atenciones)) {
      if (a.estado !== "PENDIENTE") continue;
      abiertas += 1;
      enSalon += totalCuenta(a);
      porCobrar += saldoPendiente(a);
    }
    return { abiertas, enSalon, porCobrar };
  }, [atenciones]);

  return (
    <div className="mt-3 grid grid-cols-3 gap-2">
      <div className="stat">
        <p className="stat-rotulo flex items-center gap-1">
          <Wallet className="h-3 w-3" /> Cuentas abiertas
        </p>
        <p className="stat-valor text-azul-700 dark:text-azul-300">{abiertas}</p>
      </div>
      <div className="stat">
        <p className="stat-rotulo flex items-center gap-1">
          <Coins className="h-3 w-3" /> En el salón
        </p>
        <p className="stat-valor text-verde-700 dark:text-verde-400">
          {formatCLP(enSalon)}
        </p>
      </div>
      <div className="stat border-amarillo-200/70 bg-amarillo-50 dark:border-amarillo-400/15 dark:bg-amarillo-400/[0.08]">
        <p className="stat-rotulo flex items-center gap-1 text-amarillo-700 dark:text-amarillo-400/80">
          <HandCoins className="h-3 w-3" /> Por cobrar
        </p>
        <p className="stat-valor text-amarillo-700 dark:text-amarillo-300">
          {formatCLP(porCobrar)}
        </p>
      </div>
    </div>
  );
}
