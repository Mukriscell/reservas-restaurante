import { useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Lock,
  Plus,
  Receipt,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { useDispatchApp, useMesa } from "../estado/contexto";
import { CATEGORIAS, PRODUCTOS } from "../data/catalogo";
import { coincide } from "../util/busqueda";
import { formatCLP } from "../util/dinero";
import { formatFechaHora } from "../util/fechas";
import { Buscador } from "../componentes/Buscador";
import { LineaConsumo } from "../componentes/LineaConsumo";
import { SelectorMenu } from "../componentes/SelectorMenu";

/** Detalle de una mesa: estado, menú buffet, cuenta y agregado de productos. */
export function PantallaMesa({
  mesaId,
  onVolver,
  onVerDesglose,
}: {
  mesaId: string;
  onVolver: () => void;
  onVerDesglose: () => void;
}) {
  const { mesa, consumos } = useMesa(mesaId);
  const dispatch = useDispatchApp();
  const [consulta, setConsulta] = useState("");
  const [confirmando, setConfirmando] = useState<"pagar" | "nueva" | null>(null);

  const pagada = mesa.estado === "PAGADA";

  const resultados = useMemo(
    () =>
      consulta.trim() === ""
        ? PRODUCTOS
        : PRODUCTOS.filter((p) => coincide(p.nombre, consulta)),
    [consulta]
  );

  // Cantidades ya en la cuenta, para marcarlas en la lista de productos.
  const enCuenta = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const c of consumos) mapa.set(c.productoId, c.cantidad);
    return mapa;
  }, [consumos]);

  return (
    <div className="mx-auto max-w-xl px-3 pb-10">
      <header className="sticky top-0 z-10 -mx-3 mb-4 border-b border-stone-800 bg-stone-950/95 px-3 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <button
            onClick={onVolver}
            aria-label="Volver a las mesas"
            className="rounded-lg border border-stone-700 p-2 text-stone-300 hover:bg-stone-800"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="flex-1 text-lg font-bold">Mesa {mesa.numeroMesa}</h1>
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
              pagada
                ? "bg-emerald-500/20 text-emerald-300"
                : "bg-yellow-500/20 text-yellow-300"
            }`}
          >
            {mesa.estado}
          </span>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-stone-400">Total acumulado</p>
            <p className="text-2xl font-bold text-amber-400">
              {formatCLP(mesa.total)}
            </p>
          </div>
          <button
            onClick={onVerDesglose}
            className="flex items-center gap-2 rounded-xl border border-amber-600/60 bg-amber-600/10 px-4 py-2.5 text-sm font-semibold text-amber-400 hover:bg-amber-600/20"
          >
            <Receipt className="h-4 w-4" /> Ver desglose
          </button>
        </div>
        {mesa.fechaApertura && (
          <p className="mt-2 text-xs text-stone-500">
            Abierta: {formatFechaHora(mesa.fechaApertura)}
            {mesa.fechaCierre &&
              ` · Cerrada: ${formatFechaHora(mesa.fechaCierre)}`}
          </p>
        )}
      </header>

      {/* Indicador de cierre y acciones de estado */}
      {pagada ? (
        <div className="mb-4 rounded-2xl border border-emerald-600/50 bg-emerald-500/10 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
            <Lock className="h-4 w-4" /> Mesa pagada: la cuenta quedó cerrada y
            no se puede modificar.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => dispatch({ tipo: "REABRIR", mesaId })}
              className="flex items-center gap-2 rounded-lg border border-stone-600 px-3 py-2 text-sm font-semibold text-stone-200 hover:bg-stone-800"
            >
              <RotateCcw className="h-4 w-4" /> Reabrir cuenta
            </button>
            {confirmando === "nueva" ? (
              <>
                <button
                  onClick={() => {
                    dispatch({ tipo: "NUEVA_CUENTA", mesaId });
                    setConfirmando(null);
                  }}
                  className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700"
                >
                  Sí, borrar y empezar
                </button>
                <button
                  onClick={() => setConfirmando(null)}
                  className="rounded-lg border border-stone-600 px-3 py-2 text-sm font-semibold text-stone-300"
                >
                  Volver
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirmando("nueva")}
                className="flex items-center gap-2 rounded-lg border border-stone-600 px-3 py-2 text-sm font-semibold text-stone-200 hover:bg-stone-800"
              >
                <Sparkles className="h-4 w-4" /> Nueva cuenta
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="mb-4">
          {confirmando === "pagar" ? (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-emerald-600/50 bg-emerald-500/10 p-3">
              <span className="text-sm font-medium text-emerald-200">
                ¿Marcar la mesa {mesa.numeroMesa} como pagada (
                {formatCLP(mesa.total)})?
              </span>
              <button
                onClick={() => {
                  dispatch({ tipo: "MARCAR_PAGADA", mesaId });
                  setConfirmando(null);
                }}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Sí, pagada
              </button>
              <button
                onClick={() => setConfirmando(null)}
                className="rounded-lg border border-stone-600 px-3 py-2 text-sm font-semibold text-stone-300"
              >
                Volver
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmando("pagar")}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700"
            >
              <CheckCircle2 className="h-4 w-4" /> Marcar como pagada
            </button>
          )}
        </div>
      )}

      {/* Menú buffet (mismo desglose que la app de reservas) */}
      <SelectorMenu
        menu={mesa.menu}
        bloqueada={pagada}
        onFijar={(menu) => dispatch({ tipo: "FIJAR_MENU", mesaId, menu })}
      />

      {/* Cuenta actual */}
      <section className="mt-4 rounded-2xl border border-stone-800 bg-stone-900/60 p-4">
        <h2 className="text-sm font-semibold text-amber-400">
          Consumos ({consumos.length})
        </h2>
        {consumos.length === 0 ? (
          <p className="mt-2 text-sm text-stone-500">
            Aún no hay productos en la cuenta.
          </p>
        ) : (
          <ul className="mt-1 divide-y divide-stone-800">
            {consumos.map((c) => (
              <LineaConsumo
                key={c.id}
                consumo={c}
                bloqueada={pagada}
                onCantidad={(consumoId, delta) =>
                  dispatch({ tipo: "CAMBIAR_CANTIDAD", mesaId, consumoId, delta })
                }
                onEliminar={(consumoId) =>
                  dispatch({ tipo: "ELIMINAR_CONSUMO", mesaId, consumoId })
                }
              />
            ))}
          </ul>
        )}
      </section>

      {/* Agregar productos (oculto si la mesa está pagada) */}
      {!pagada && (
        <section className="mt-4 rounded-2xl border border-stone-800 bg-stone-900/60 p-4">
          <h2 className="mb-3 text-sm font-semibold text-amber-400">
            Agregar productos
          </h2>
          <Buscador valor={consulta} onCambiar={setConsulta} />

          <div className="mt-3 max-h-96 overflow-y-auto pr-1">
            {resultados.length === 0 ? (
              <p className="py-6 text-center text-sm text-stone-500">
                Sin resultados para “{consulta}”.
              </p>
            ) : (
              CATEGORIAS.map((categoria) => {
                const delGrupo = resultados.filter(
                  (p) => p.categoria === categoria
                );
                if (delGrupo.length === 0) return null;
                return (
                  <div key={categoria}>
                    <p className="sticky top-0 bg-stone-900 py-1.5 text-xs font-bold uppercase tracking-wide text-stone-500">
                      {categoria}
                    </p>
                    <ul>
                      {delGrupo.map((p) => {
                        const cantidad = enCuenta.get(p.id);
                        return (
                          <li key={p.id}>
                            <button
                              onClick={() =>
                                dispatch({
                                  tipo: "AGREGAR_PRODUCTO",
                                  mesaId,
                                  productoId: p.id,
                                })
                              }
                              className="flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left hover:bg-stone-800 active:bg-stone-700"
                            >
                              <span className="flex-1 truncate text-sm text-stone-100">
                                {p.nombre}
                                {cantidad && (
                                  <span className="ml-2 rounded-full bg-amber-600/20 px-2 py-0.5 text-xs font-bold text-amber-400">
                                    ×{cantidad}
                                  </span>
                                )}
                              </span>
                              <span className="text-sm font-medium text-stone-400">
                                {formatCLP(p.precio)}
                              </span>
                              <Plus className="h-4 w-4 text-amber-500" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })
            )}
          </div>
        </section>
      )}
    </div>
  );
}
