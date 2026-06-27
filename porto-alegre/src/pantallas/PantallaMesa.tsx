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
import { useAcciones, useMesa } from "../estado/contexto";
import { CATEGORIAS, PRODUCTOS } from "../data/catalogo";
import { coincide } from "../util/busqueda";
import { formatCLP } from "../util/dinero";
import { formatFechaHora } from "../util/fechas";
import { Buscador } from "../componentes/Buscador";
import { LineaConsumo } from "../componentes/LineaConsumo";
import { SelectorMenu } from "../componentes/SelectorMenu";
import { PillConexion } from "../componentes/Conexion";

/**
 * Detalle de una mesa, pensado para velocidad de garzón: el buscador y la
 * carta quedan a la vista apenas se abre la mesa; cobrar toma dos toques.
 */
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
  const acciones = useAcciones();
  const [consulta, setConsulta] = useState("");
  const [confirmando, setConfirmando] = useState<"pagar" | "nueva" | null>(null);
  const [procesando, setProcesando] = useState(false);

  const pagada = mesa.estado === "PAGADA";

  const resultados = useMemo(
    () =>
      consulta.trim() === ""
        ? PRODUCTOS
        : PRODUCTOS.filter((p) => coincide(p.nombre, consulta)),
    [consulta]
  );

  // Cantidades ya pedidas, para marcarlas en la carta.
  const enCuenta = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const c of consumos) mapa.set(c.productoId, c.cantidad);
    return mapa;
  }, [consumos]);

  async function cobrar() {
    setProcesando(true);
    await acciones.marcarPagada(mesaId); // si otro garzón ganó, llega el aviso
    setProcesando(false);
    setConfirmando(null);
  }

  async function nuevaCuenta() {
    setProcesando(true);
    await acciones.nuevaCuenta(mesaId);
    setProcesando(false);
    setConfirmando(null);
  }

  return (
    <div className="mx-auto max-w-4xl px-3 pb-10">
      <header className="barra-sup -mx-3 mb-4 px-3 py-3">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onVolver}
            aria-label="Volver a las mesas"
            className="btn btn-borde btn-icono"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-black tracking-tight">
            Mesa {mesa.numeroMesa}
          </h1>
          <span className={`pill ${pagada ? "pill-pagada" : "pill-pendiente"}`}>
            {pagada ? "Pagada" : "Pendiente"}
          </span>
          <span className="flex-1" />
          <PillConexion />
        </div>

        <div className="mt-3 flex items-end justify-between gap-2.5 rounded-2xl bg-azul-950 px-4 py-3 text-white dark:bg-white/[0.04]">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-white/60">
              Total acumulado
            </p>
            <p
              data-testid="total-mesa"
              className="text-3xl font-black leading-tight tabular text-amarillo-400"
            >
              {formatCLP(mesa.total)}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={onVerDesglose}
              className="btn border border-white/15 bg-white/10 text-white hover:bg-white/20"
            >
              <Receipt className="h-4 w-4" /> Desglose
            </button>
            {!pagada && (
              <button onClick={() => setConfirmando("pagar")} className="btn btn-verde">
                <CheckCircle2 className="h-4 w-4" /> Cobrar
              </button>
            )}
          </div>
        </div>

        {confirmando === "pagar" && !pagada && (
          <div className="mt-3 flex animate-subir flex-wrap items-center gap-2 rounded-2xl border border-verde-300 bg-verde-50 p-3 dark:border-verde-500/30 dark:bg-verde-500/10">
            <span className="flex-1 text-sm font-semibold text-verde-900 dark:text-verde-200">
              ¿Cobrar la mesa {mesa.numeroMesa} por {formatCLP(mesa.total)}?
            </span>
            <button onClick={cobrar} disabled={procesando} className="btn btn-verde">
              Confirmar pago
            </button>
            <button
              onClick={() => setConfirmando(null)}
              disabled={procesando}
              className="btn btn-borde"
            >
              Volver
            </button>
          </div>
        )}

        {!pagada && (
          <div className="mt-3">
            <Buscador valor={consulta} onCambiar={setConsulta} />
          </div>
        )}

        {mesa.fechaApertura && (
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Abierta: {formatFechaHora(mesa.fechaApertura)}
            {mesa.fechaCierre && ` · Pagada: ${formatFechaHora(mesa.fechaCierre)}`}
          </p>
        )}
      </header>

      {/* Indicador de cierre y acciones sobre una mesa pagada */}
      {pagada && (
        <div className="tarjeta mb-4 animate-subir border-verde-300 p-4 dark:border-verde-500/30">
          <p className="flex items-center gap-2 text-sm font-bold text-verde-800 dark:text-verde-300">
            <Lock className="h-4 w-4" /> Mesa pagada: la cuenta quedó cerrada y
            no se puede modificar.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => void acciones.reabrirMesa(mesaId)}
              className="btn btn-borde"
            >
              <RotateCcw className="h-4 w-4" /> Reabrir cuenta
            </button>
            {confirmando === "nueva" ? (
              <>
                <button
                  onClick={nuevaCuenta}
                  disabled={procesando}
                  className="btn btn-peligro"
                >
                  Sí, borrar y empezar
                </button>
                <button
                  onClick={() => setConfirmando(null)}
                  disabled={procesando}
                  className="btn btn-borde"
                >
                  Volver
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirmando("nueva")}
                className="btn btn-borde"
              >
                <Sparkles className="h-4 w-4" /> Nueva cuenta
              </button>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        {/* Carta: agregar productos en un toque */}
        {!pagada && (
          <section className="tarjeta p-4">
            <h2 className="mb-2 text-sm font-bold text-verde-700 dark:text-verde-400">
              Carta
            </h2>
            <div className="scroll-fino max-h-[46vh] overflow-y-auto pr-1 lg:max-h-[62vh]">
              {resultados.length === 0 ? (
                <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
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
                      <p className="rotulo-seccion sticky top-0 bg-white py-1.5 dark:bg-[#161e3a]">
                        {categoria}
                      </p>
                      <ul>
                        {delGrupo.map((p) => {
                          const cantidad = enCuenta.get(p.id);
                          return (
                            <li key={p.id}>
                              <button
                                onClick={() =>
                                  acciones.agregarProducto(mesaId, p.id)
                                }
                                className="group flex min-h-12 w-full items-center gap-2 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-zinc-100 active:bg-zinc-200 dark:hover:bg-white/10 dark:active:bg-white/15"
                              >
                                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                                  {p.nombre}
                                  {cantidad && (
                                    <span className="ml-2 rounded-full bg-azul-600 px-2 py-0.5 text-xs font-bold text-white dark:bg-azul-500">
                                      ×{cantidad}
                                    </span>
                                  )}
                                </span>
                                <span className="text-sm font-semibold tabular text-zinc-500 dark:text-zinc-400">
                                  {formatCLP(p.precio)}
                                </span>
                                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-verde-600/10 text-verde-700 transition-colors group-hover:bg-verde-600/20 dark:bg-verde-500/15 dark:text-verde-400">
                                  <Plus className="h-4 w-4" />
                                </span>
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

        <div className="space-y-4">
          {/* Cuenta actual */}
          <section className="tarjeta p-4">
            <h2 className="text-sm font-bold text-verde-700 dark:text-verde-400">
              Consumos ({consumos.length})
            </h2>
            {consumos.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                Aún no hay productos en la cuenta.
              </p>
            ) : (
              <ul className="mt-1 divide-y divide-zinc-100 dark:divide-white/10">
                {consumos.map((c) => (
                  <LineaConsumo
                    key={c.id}
                    consumo={c}
                    bloqueada={pagada}
                    onCantidad={(consumoId, delta) =>
                      acciones.cambiarCantidad(mesaId, consumoId, delta)
                    }
                    onEliminar={(consumoId) =>
                      acciones.eliminarConsumo(mesaId, consumoId)
                    }
                  />
                ))}
              </ul>
            )}
          </section>

          {/* Menú buffet (mismo desglose que la app de reservas) */}
          <SelectorMenu
            menu={mesa.menu}
            bloqueada={pagada}
            onFijar={(menu) => acciones.fijarMenu(mesaId, menu)}
          />
        </div>
      </div>
    </div>
  );
}
