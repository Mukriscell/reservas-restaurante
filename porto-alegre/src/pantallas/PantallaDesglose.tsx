import { ArrowLeft, Receipt } from "lucide-react";
import { useMesa } from "../estado/contexto";
import { getProducto } from "../data/catalogo";
import { desgloseMenu, getMenuBuffet, totalMenu } from "../data/menus";
import { formatCLP } from "../util/dinero";
import { formatFechaHora } from "../util/fechas";

/**
 * Desglose completo de la mesa seleccionada: menú según personas/niños y
 * menú elegido por los adultos, más los consumos y el TOTAL.
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
  const pagada = mesa.estado === "PAGADA";

  return (
    <div className="mx-auto max-w-xl px-3 pb-10">
      <header className="sticky top-0 z-20 -mx-3 mb-4 border-b border-zinc-200/80 bg-zinc-100/95 px-3 py-3 backdrop-blur dark:border-white/10 dark:bg-azul-950/95">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onVolver}
            aria-label="Volver a la mesa"
            className="btn btn-borde h-12 w-12 !px-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="flex flex-1 items-center gap-2 text-lg font-black tracking-tight">
            <Receipt className="h-5 w-5 text-verde-700 dark:text-amarillo-400" />
            Desglose · Mesa {mesa.numeroMesa}
          </h1>
          <span className={`pill ${pagada ? "pill-pagada" : "pill-pendiente"}`}>
            {mesa.estado}
          </span>
        </div>
      </header>

      <div className="tarjeta p-5">
        {mesa.fechaApertura && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Abierta: {formatFechaHora(mesa.fechaApertura)}
            {mesa.fechaCierre && ` · Pagada: ${formatFechaHora(mesa.fechaCierre)}`}
          </p>
        )}

        {/* Menú buffet */}
        {mesa.menu && (
          <section className="mt-4">
            <h2 className="text-[11px] font-black uppercase tracking-[0.15em] text-zinc-400 dark:text-zinc-500">
              Menú · {getMenuBuffet(mesa.menu.menuId).nombre} · {personas}{" "}
              {personas === 1 ? "persona" : "personas"}
            </h2>
            <ul className="mt-2 space-y-1.5">
              {lineasMenu.map((l) => (
                <li key={l.texto} className="flex justify-between gap-3 text-sm">
                  <span className="text-zinc-600 dark:text-zinc-300">{l.texto}</span>
                  <span className="font-semibold">{formatCLP(l.monto)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 flex justify-between border-t border-zinc-200 pt-2 text-sm dark:border-white/10">
              <span className="text-zinc-500 dark:text-zinc-400">Subtotal menú</span>
              <span className="font-bold">{formatCLP(subtotalMenu)}</span>
            </p>
          </section>
        )}

        {/* Consumos */}
        <section className="mt-4">
          <h2 className="text-[11px] font-black uppercase tracking-[0.15em] text-zinc-400 dark:text-zinc-500">
            Consumos
          </h2>
          {consumos.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              Sin consumos.
            </p>
          ) : (
            <>
              <ul className="mt-2 space-y-1.5">
                {consumos.map((c) => (
                  <li key={c.id} className="flex justify-between gap-3 text-sm">
                    <span className="text-zinc-600 dark:text-zinc-300">
                      {c.cantidad} x {getProducto(c.productoId).nombre}{" "}
                      <span className="text-zinc-400 dark:text-zinc-500">
                        ({formatCLP(c.precioUnitario)} c/u)
                      </span>
                    </span>
                    <span className="font-semibold">{formatCLP(c.subtotal)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 flex justify-between border-t border-zinc-200 pt-2 text-sm dark:border-white/10">
                <span className="text-zinc-500 dark:text-zinc-400">
                  Subtotal consumos
                </span>
                <span className="font-bold">{formatCLP(subtotalConsumos)}</span>
              </p>
            </>
          )}
        </section>

        <p className="mt-5 flex items-baseline justify-between rounded-xl bg-azul-950 px-4 py-3 text-white dark:bg-azul-900">
          <span className="text-sm font-black uppercase tracking-[0.15em]">
            Total
          </span>
          <span className="text-2xl font-black text-amarillo-400">
            {formatCLP(mesa.total)}
          </span>
        </p>
      </div>
    </div>
  );
}
