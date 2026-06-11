import { ArrowLeft, Receipt } from "lucide-react";
import { useMesa } from "../estado/contexto";
import { getProducto } from "../data/catalogo";
import { desgloseMenu, getMenuBuffet, totalMenu } from "../data/menus";
import { formatCLP } from "../util/dinero";
import { formatFechaHora } from "../util/fechas";

/**
 * Interfaz adicional de desglose: la cuenta completa de la mesa con el
 * menú (personas, niños y menú elegido por los adultos) más los consumos.
 */
export function PantallaDesglose({
  mesaId,
  onVolver,
}: {
  mesaId: string;
  onVolver: () => void;
}) {
  const { mesa, consumos } = useMesa(mesaId);
  const lineasMenu = desgloseMenu(mesa.menu);
  const subtotalMenu = totalMenu(mesa.menu);
  const subtotalConsumos = consumos.reduce((s, c) => s + c.subtotal, 0);
  const personas = mesa.menu
    ? mesa.menu.adultos + mesa.menu.ninos6a11 + mesa.menu.ninos3a5
    : 0;

  return (
    <div className="mx-auto max-w-xl px-3 pb-10">
      <header className="sticky top-0 z-10 -mx-3 mb-4 border-b border-stone-800 bg-stone-950/95 px-3 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <button
            onClick={onVolver}
            aria-label="Volver a la mesa"
            className="rounded-lg border border-stone-700 p-2 text-stone-300 hover:bg-stone-800"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="flex flex-1 items-center gap-2 text-lg font-bold">
            <Receipt className="h-5 w-5 text-amber-400" />
            Desglose · Mesa {mesa.numeroMesa}
          </h1>
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
              mesa.estado === "PAGADA"
                ? "bg-emerald-500/20 text-emerald-300"
                : "bg-yellow-500/20 text-yellow-300"
            }`}
          >
            {mesa.estado}
          </span>
        </div>
      </header>

      <div className="rounded-2xl border border-stone-800 bg-stone-900/60 p-5">
        {mesa.fechaApertura && (
          <p className="text-xs text-stone-500">
            Abierta: {formatFechaHora(mesa.fechaApertura)}
            {mesa.fechaCierre &&
              ` · Pagada: ${formatFechaHora(mesa.fechaCierre)}`}
          </p>
        )}

        {/* Menú buffet */}
        {mesa.menu && (
          <section className="mt-4">
            <h2 className="text-xs font-bold uppercase tracking-wide text-stone-500">
              Menú · {getMenuBuffet(mesa.menu.menuId).nombre} · {personas}{" "}
              {personas === 1 ? "persona" : "personas"}
            </h2>
            <ul className="mt-2 space-y-1.5">
              {lineasMenu.map((l) => (
                <li
                  key={l.texto}
                  className="flex justify-between gap-3 text-sm"
                >
                  <span className="text-stone-300">{l.texto}</span>
                  <span className="font-medium">{formatCLP(l.monto)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 flex justify-between border-t border-stone-800 pt-2 text-sm">
              <span className="text-stone-400">Subtotal menú</span>
              <span className="font-semibold">{formatCLP(subtotalMenu)}</span>
            </p>
          </section>
        )}

        {/* Consumos */}
        <section className="mt-4">
          <h2 className="text-xs font-bold uppercase tracking-wide text-stone-500">
            Consumos
          </h2>
          {consumos.length === 0 ? (
            <p className="mt-2 text-sm text-stone-500">Sin consumos.</p>
          ) : (
            <>
              <ul className="mt-2 space-y-1.5">
                {consumos.map((c) => (
                  <li key={c.id} className="flex justify-between gap-3 text-sm">
                    <span className="text-stone-300">
                      {c.cantidad} x {getProducto(c.productoId).nombre}{" "}
                      <span className="text-stone-500">
                        ({formatCLP(c.precioUnitario)} c/u)
                      </span>
                    </span>
                    <span className="font-medium">{formatCLP(c.subtotal)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 flex justify-between border-t border-stone-800 pt-2 text-sm">
                <span className="text-stone-400">Subtotal consumos</span>
                <span className="font-semibold">
                  {formatCLP(subtotalConsumos)}
                </span>
              </p>
            </>
          )}
        </section>

        <p className="mt-5 flex items-baseline justify-between border-t-2 border-amber-600/40 pt-3">
          <span className="text-sm font-bold uppercase tracking-wide text-stone-300">
            Total
          </span>
          <span className="text-2xl font-bold text-amber-400">
            {formatCLP(mesa.total)}
          </span>
        </p>
      </div>
    </div>
  );
}
