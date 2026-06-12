import { memo } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import type { ConsumoMesa } from "../tipos";
import { getProducto } from "../data/catalogo";
import { formatCLP } from "../util/dinero";

/** Línea de la cuenta: producto, stepper de cantidad, subtotal y eliminar. */
export const LineaConsumo = memo(function LineaConsumo({
  consumo,
  bloqueada,
  onCantidad,
  onEliminar,
}: {
  consumo: ConsumoMesa;
  bloqueada: boolean;
  onCantidad: (consumoId: string, delta: 1 | -1) => void;
  onEliminar: (consumoId: string) => void;
}) {
  const producto = getProducto(consumo.productoId);
  return (
    <li className="flex items-center gap-2 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{producto.nombre}</p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {formatCLP(consumo.precioUnitario)} c/u
        </p>
      </div>

      {!bloqueada ? (
        <div className="flex items-center rounded-xl border border-zinc-300 dark:border-white/15">
          <button
            onClick={() => onCantidad(consumo.id, -1)}
            disabled={consumo.cantidad <= 1}
            aria-label={`Quitar un ${producto.nombre}`}
            className="px-2.5 py-2.5 text-zinc-600 disabled:opacity-30 dark:text-zinc-300"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="min-w-7 text-center text-sm font-bold">
            {consumo.cantidad}
          </span>
          <button
            onClick={() => onCantidad(consumo.id, 1)}
            aria-label={`Agregar un ${producto.nombre}`}
            className="px-2.5 py-2.5 text-zinc-600 dark:text-zinc-300"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <span className="text-sm font-bold">×{consumo.cantidad}</span>
      )}

      <span className="min-w-[4.5rem] text-right text-sm font-bold text-verde-700 dark:text-amarillo-400">
        {formatCLP(consumo.subtotal)}
      </span>

      {!bloqueada && (
        <button
          onClick={() => onEliminar(consumo.id)}
          aria-label={`Eliminar ${producto.nombre}`}
          className="rounded-lg p-2 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </li>
  );
});
