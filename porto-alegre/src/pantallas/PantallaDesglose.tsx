import { ArrowLeft, Receipt } from "lucide-react";
import { totalCuenta } from "../tipos";
import {
  useDetalleAtencion,
  useEstadoApp,
  useGarzon,
} from "../estado/contexto";
import { getProducto } from "../data/catalogo";
import { desgloseMenu, getMenuBuffet } from "../data/menus";
import { formatCLP } from "../util/dinero";
import { formatFechaHora } from "../util/fechas";

/**
 * Desglose completo de UNA atención (abierta o histórica): menú según
 * personas, consumos, abonos y totales. Los datos históricos salen de
 * atenciones/consumos/abonos, nunca del estado actual de la mesa.
 */
export function PantallaDesglose({
  atencionId,
  onVolver,
}: {
  atencionId: string;
  onVolver: () => void;
}) {
  const { atencion, consumos, abonos, cargando } = useDetalleAtencion(atencionId);
  const { mesas } = useEstadoApp();
  const garzon = useGarzon(atencion?.garzonId ?? null);

  if (!atencion) {
    return (
      <div className="mx-auto max-w-xl px-3 pb-10">
        <header className="barra-sup -mx-3 mb-4 px-3 py-3">
          <div className="flex items-center gap-2.5">
            <button
              onClick={onVolver}
              aria-label="Volver"
              className="btn btn-borde btn-icono"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="text-lg font-black tracking-tight">Desglose</h1>
          </div>
        </header>
        <p className="tarjeta p-5 text-sm text-zinc-500 dark:text-zinc-400">
          {cargando ? "Cargando la atención…" : "La atención ya no está disponible."}
        </p>
      </div>
    );
  }

  const mesa = mesas.find((m) => m.id === atencion.mesaId);
  const lineasMenu = desgloseMenu(atencion.menu);
  const subtotalConsumos = consumos.reduce((s, c) => s + c.subtotal, 0);
  const personas = atencion.menu
    ? atencion.menu.adultos + atencion.menu.ninos6a11 + atencion.menu.ninos3a5
    : 0;
  const pagada = atencion.estado === "PAGADA";

  return (
    <div className="mx-auto max-w-xl px-3 pb-10">
      <header className="barra-sup -mx-3 mb-4 px-3 py-3">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onVolver}
            aria-label="Volver"
            className="btn btn-borde btn-icono"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="flex flex-1 items-center gap-2 text-lg font-black tracking-tight">
            <Receipt className="h-5 w-5 text-verde-700 dark:text-amarillo-400" />
            Atención #{atencion.numero}
            {mesa ? ` · Mesa ${mesa.numero}` : ""}
          </h1>
          <span className={`pill ${pagada ? "pill-pagada" : "pill-pendiente"}`}>
            {atencion.estado}
          </span>
        </div>
      </header>

      <div className="tarjeta p-5">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Abierta: {formatFechaHora(atencion.fechaApertura)}
          {atencion.fechaCierre &&
            ` · Pagada: ${formatFechaHora(atencion.fechaCierre)}`}
          {garzon && ` · Garzón: ${garzon.nombre}`}
        </p>

        {/* Menú buffet */}
        {atencion.menu && (
          <section className="mt-4">
            <h2 className="text-[11px] font-black uppercase tracking-[0.15em] text-zinc-400 dark:text-zinc-500">
              Menú · {getMenuBuffet(atencion.menu.menuId).nombre} · {personas}{" "}
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
              <span className="font-bold">{formatCLP(atencion.totalMenu)}</span>
            </p>
          </section>
        )}

        {/* Consumos */}
        <section className="mt-4">
          <h2 className="text-[11px] font-black uppercase tracking-[0.15em] text-zinc-400 dark:text-zinc-500">
            Consumos
          </h2>
          {cargando && consumos.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              Cargando consumos…
            </p>
          ) : consumos.length === 0 ? (
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

        {/* Abonos */}
        {(abonos.length > 0 || atencion.totalAbonos > 0) && (
          <section className="mt-4">
            <h2 className="text-[11px] font-black uppercase tracking-[0.15em] text-zinc-400 dark:text-zinc-500">
              Abonos
            </h2>
            <ul className="mt-2 space-y-1.5">
              {abonos.map((a) => (
                <li key={a.id} className="flex justify-between gap-3 text-sm">
                  <span className="text-zinc-600 dark:text-zinc-300">
                    {a.observacion || "Abono"}{" "}
                    <span className="text-zinc-400 dark:text-zinc-500">
                      ({formatFechaHora(a.creadoEn)})
                    </span>
                  </span>
                  <span className="font-semibold">−{formatCLP(a.monto)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 flex justify-between border-t border-zinc-200 pt-2 text-sm dark:border-white/10">
              <span className="text-zinc-500 dark:text-zinc-400">Total abonado</span>
              <span className="font-bold">−{formatCLP(atencion.totalAbonos)}</span>
            </p>
          </section>
        )}

        <div className="mt-5 space-y-1 rounded-xl bg-azul-950 px-4 py-3 text-white dark:bg-azul-900">
          <p className="flex items-baseline justify-between">
            <span className="text-sm font-black uppercase tracking-[0.15em]">
              Total
            </span>
            <span className="text-2xl font-black text-amarillo-400">
              {formatCLP(totalCuenta(atencion))}
            </span>
          </p>
          {atencion.propinaMonto > 0 && (
            <>
              <p className="flex items-baseline justify-between text-sm">
                <span className="font-semibold text-white/70">
                  Propina ({atencion.propinaPct}%)
                </span>
                <span className="font-bold text-white">
                  +{formatCLP(atencion.propinaMonto)}
                </span>
              </p>
              <p className="flex items-baseline justify-between text-sm">
                <span className="font-semibold text-white/70">
                  Total con propina
                </span>
                <span className="font-black text-amarillo-400">
                  {formatCLP(atencion.totalFinal)}
                </span>
              </p>
            </>
          )}
          {atencion.totalAbonos > 0 && (
            <p className="flex items-baseline justify-between text-sm">
              <span className="font-semibold text-white/70">
                {pagada ? "Cobrado al cierre" : "Saldo pendiente"}
              </span>
              <span className="font-black text-amarillo-400">
                {formatCLP(
                  pagada
                    ? atencion.saldoFinal
                    : totalCuenta(atencion) - atencion.totalAbonos
                )}
              </span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
