import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRightLeft,
  CheckCircle2,
  DoorOpen,
  Download,
  FileText,
  Lock,
  Plus,
  Printer,
  Receipt,
  RotateCcw,
  Share2,
  Sparkles,
} from "lucide-react";
import { Coins, Eye } from "lucide-react";
import type { Abono, Atencion, Consumo, Garzon, Mesa } from "../tipos";
import { propinaSugerida, saldoPendiente, totalCuenta } from "../tipos";
import {
  compartirPrecuenta,
  descargarPrecuenta,
  generarPrecuenta,
  imprimirPrecuenta,
  type DatosPrecuenta,
} from "../util/precuenta";
import {
  useAcciones,
  useEstadoApp,
  useGarzon,
  useGarzonActual,
  useHistorial,
  useMesa,
} from "../estado/contexto";
import { CATEGORIAS, PRODUCTOS } from "../data/catalogo";
import { coincide } from "../util/busqueda";
import { formatCLP } from "../util/dinero";
import { formatFechaHora } from "../util/fechas";
import { Buscador } from "../componentes/Buscador";
import { LineaConsumo } from "../componentes/LineaConsumo";
import { SelectorMenu } from "../componentes/SelectorMenu";
import { SeccionAbonos } from "../componentes/SeccionAbonos";
import { ItemAtencion } from "../componentes/ItemAtencion";
import { PillConexion } from "../componentes/Conexion";

/**
 * Detalle de una mesa permanente. Tres vistas según su estado:
 *  - OCUPADA: la cuenta de la atención en curso (carta, consumos, abonos).
 *  - Recién cobrada en este equipo: el recibo de la atención cerrada.
 *  - LIBRE: abrir una atención nueva + cuentas anteriores de la mesa.
 */
export function PantallaMesa({
  mesaId,
  onVolver,
  onVerDesglose,
}: {
  mesaId: string;
  onVolver: () => void;
  onVerDesglose: (atencionId: string) => void;
}) {
  const { mesa, atencion, consumos, abonos } = useMesa(mesaId);
  const [reciboId, setReciboId] = useState<string | null>(null);

  if (atencion) {
    return (
      <VistaCuenta
        mesa={mesa}
        atencion={atencion}
        consumos={consumos}
        abonos={abonos}
        onVolver={onVolver}
        onVerDesglose={onVerDesglose}
        onCobrada={setReciboId}
      />
    );
  }
  return (
    <VistaLibre
      mesa={mesa}
      reciboId={reciboId}
      onVolver={onVolver}
      onVerDesglose={onVerDesglose}
    />
  );
}

function Encabezado({
  mesa,
  pill,
  onVolver,
  children,
}: {
  mesa: Mesa;
  pill: { texto: string; clase: string };
  onVolver: () => void;
  children?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 -mx-3 mb-4 border-b border-zinc-200/80 bg-zinc-100/95 px-3 py-3 backdrop-blur dark:border-white/10 dark:bg-azul-950/95">
      <div className="flex items-center gap-2.5">
        <button
          onClick={onVolver}
          aria-label="Volver a las mesas"
          className="btn btn-borde h-12 w-12 !px-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-black tracking-tight">Mesa {mesa.numero}</h1>
        <span className={`pill ${pill.clase}`}>{pill.texto}</span>
        <span className="flex-1" />
        <PillConexion />
      </div>
      {children}
    </header>
  );
}

/* ----------------------- Mesa OCUPADA: la cuenta ----------------------- */

function VistaCuenta({
  mesa,
  atencion,
  consumos,
  abonos,
  onVolver,
  onVerDesglose,
  onCobrada,
}: {
  mesa: Mesa;
  atencion: Atencion;
  consumos: Consumo[];
  abonos: Abono[];
  onVolver: () => void;
  onVerDesglose: (atencionId: string) => void;
  onCobrada: (atencionId: string) => void;
}) {
  const acciones = useAcciones();
  const garzon = useGarzon(atencion.garzonId);
  const { garzon: garzonActual } = useGarzonActual();
  const { garzones } = useEstadoApp();
  const [consulta, setConsulta] = useState("");
  const [panel, setPanel] = useState<
    "cobrar" | "precuenta" | "transferir" | null
  >(null);
  const [procesando, setProcesando] = useState(false);
  // Propina elegida al cobrar: sin / 10% sugerido / personalizada.
  const [propinaTipo, setPropinaTipo] = useState<"no" | "sugerida" | "custom">(
    "sugerida"
  );
  const [propinaCustom, setPropinaCustom] = useState("");

  const total = totalCuenta(atencion);
  const saldo = saldoPendiente(atencion);

  // La mesa de otro garzón es de solo lectura (salvo ADMIN): sin edición,
  // abonos ni cierre. Todos pueden verla.
  const puedeEditar =
    garzonActual?.rol === "ADMIN" ||
    (garzonActual != null && atencion.garzonId === garzonActual.id);

  const propinaMonto =
    propinaTipo === "no"
      ? 0
      : propinaTipo === "sugerida"
        ? propinaSugerida(atencion)
        : Math.max(0, Math.round(Number(propinaCustom) || 0));
  const propinaPct = total > 0 ? Math.round((propinaMonto / total) * 100) : 0;

  const candidatosTransferencia = useMemo(
    () =>
      garzones
        .filter((g) => g.activo && g.id !== atencion.garzonId)
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    [garzones, atencion.garzonId]
  );

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
    const ok = await acciones.cerrarAtencion(atencion.id, propinaPct, propinaMonto);
    setProcesando(false);
    setPanel(null);
    if (ok) onCobrada(atencion.id); // si otro garzón ganó, llega el aviso
  }

  /** Genera la precuenta PDF y la entrega (descarga/compartir/imprimir). */
  async function emitirPrecuenta(entrega: "descargar" | "compartir" | "imprimir") {
    if (procesando) return;
    setProcesando(true);
    try {
      const datos: DatosPrecuenta = {
        mesaNumero: mesa.numero,
        garzonNombre: garzon?.nombre ?? garzonActual?.nombre ?? "—",
        atencion,
        consumos,
        abonos,
      };
      const blob = await generarPrecuenta(datos);
      if (entrega === "descargar") {
        descargarPrecuenta(blob, datos);
      } else if (entrega === "imprimir") {
        imprimirPrecuenta(blob);
      } else if (!(await compartirPrecuenta(blob, datos))) {
        descargarPrecuenta(blob, datos); // sin Web Share: cae a descarga
      }
      acciones.registrarPrecuenta(atencion.id); // GENERAR_PRECUENTA
    } finally {
      setProcesando(false);
    }
  }

  async function transferir(garzonNuevo: Garzon) {
    setProcesando(true);
    const ok = await acciones.transferirAtencion(atencion.id, garzonNuevo.id);
    setProcesando(false);
    if (ok) setPanel(null);
  }

  return (
    <div className="mx-auto max-w-4xl px-3 pb-10">
      <Encabezado
        mesa={mesa}
        pill={{ texto: "Ocupada", clase: "pill-pendiente" }}
        onVolver={onVolver}
      >
        <div className="mt-3 flex items-center justify-between gap-2.5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              {atencion.totalAbonos > 0 ? "Saldo pendiente" : "Total acumulado"}
            </p>
            <p
              data-testid="total-mesa"
              className="text-3xl font-black leading-tight text-verde-700 dark:text-amarillo-400"
            >
              {formatCLP(atencion.totalAbonos > 0 ? saldo : total)}
            </p>
            {atencion.totalAbonos > 0 && (
              <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                Total {formatCLP(total)} · abonado −{formatCLP(atencion.totalAbonos)}
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={() => onVerDesglose(atencion.id)}
              className="btn btn-borde"
            >
              <Receipt className="h-4 w-4" /> Desglose
            </button>
            {puedeEditar && (
              <button
                onClick={() => setPanel(panel === "cobrar" ? null : "cobrar")}
                className="btn btn-verde"
              >
                <CheckCircle2 className="h-4 w-4" /> Cobrar mesa
              </button>
            )}
          </div>
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          <button
            onClick={() => setPanel(panel === "precuenta" ? null : "precuenta")}
            disabled={!garzonActual}
            className="btn btn-borde disabled:opacity-40"
          >
            <FileText className="h-4 w-4" /> Generar precuenta
          </button>
          {puedeEditar && (
            <button
              onClick={() => setPanel(panel === "transferir" ? null : "transferir")}
              className="btn btn-borde"
            >
              <ArrowRightLeft className="h-4 w-4" /> Transferir
            </button>
          )}
        </div>

        {!puedeEditar && (
          <p className="mt-2 flex items-center gap-2 rounded-xl bg-azul-50 px-3 py-2 text-sm font-semibold text-azul-800 dark:bg-azul-500/10 dark:text-azul-300">
            <Eye className="h-4 w-4 shrink-0" /> Mesa de
            {garzon ? ` ${garzon.nombre}` : " otro garzón"}: solo lectura. No
            puedes editar, abonar ni cobrar.
          </p>
        )}

        {panel === "cobrar" && puedeEditar && (
          <div className="mt-3 rounded-2xl border border-verde-300 bg-verde-50 p-3 dark:border-verde-500/30 dark:bg-verde-500/10">
            {/* Propina: sin / 10% sugerido / personalizada */}
            <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-verde-800 dark:text-verde-300">
              <Coins className="h-4 w-4" /> Propina
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(
                [
                  ["no", "Sin propina"],
                  ["sugerida", `10% (${formatCLP(propinaSugerida(atencion))})`],
                  ["custom", "Personalizada"],
                ] as const
              ).map(([valor, etiqueta]) => (
                <button
                  key={valor}
                  onClick={() => setPropinaTipo(valor)}
                  className={`rounded-xl border px-3 py-2 text-sm font-bold transition ${
                    propinaTipo === valor
                      ? "border-verde-600 bg-verde-600 text-white"
                      : "border-zinc-300 bg-white text-zinc-700 dark:border-white/15 dark:bg-white/5 dark:text-zinc-200"
                  }`}
                >
                  {etiqueta}
                </button>
              ))}
              {propinaTipo === "custom" && (
                <input
                  value={propinaCustom}
                  onChange={(e) =>
                    setPropinaCustom(e.target.value.replace(/[^\d]/g, ""))
                  }
                  inputMode="numeric"
                  placeholder="Monto $"
                  aria-label="Propina personalizada en pesos"
                  autoFocus
                  className="min-h-10 w-28 rounded-xl border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-verde-600 dark:border-white/15 dark:bg-white/5"
                />
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-verde-300/60 pt-3 dark:border-verde-500/20">
              <span className="flex-1 text-sm font-semibold text-verde-900 dark:text-verde-200">
                Mesa {mesa.numero}: {formatCLP(saldo)}
                {propinaMonto > 0
                  ? ` + propina ${formatCLP(propinaMonto)} = `
                  : " a cobrar = "}
                <span className="font-black">{formatCLP(saldo + propinaMonto)}</span>
              </span>
              <button
                onClick={() => void cobrar()}
                disabled={procesando}
                className="btn btn-verde"
              >
                Confirmar pago
              </button>
              <button
                onClick={() => setPanel(null)}
                disabled={procesando}
                className="btn btn-borde"
              >
                Volver
              </button>
            </div>
          </div>
        )}

        {panel === "precuenta" && (
          <div className="mt-3 rounded-2xl border border-amarillo-300 bg-amarillo-50 p-3 dark:border-amarillo-400/30 dark:bg-amarillo-400/10">
            <p className="text-sm font-semibold text-amarillo-900 dark:text-amarillo-200">
              Precuenta de la mesa {mesa.numero} · saldo {formatCLP(saldo)} —
              PDF listo para entregar al cliente.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                onClick={() => void emitirPrecuenta("descargar")}
                disabled={procesando}
                className="btn btn-verde"
              >
                <Download className="h-4 w-4" /> Descargar
              </button>
              <button
                onClick={() => void emitirPrecuenta("compartir")}
                disabled={procesando}
                className="btn btn-borde"
              >
                <Share2 className="h-4 w-4" /> Compartir
              </button>
              <button
                onClick={() => void emitirPrecuenta("imprimir")}
                disabled={procesando}
                className="btn btn-borde"
              >
                <Printer className="h-4 w-4" /> Imprimir
              </button>
              <button
                onClick={() => setPanel(null)}
                disabled={procesando}
                className="btn btn-borde"
              >
                Volver
              </button>
            </div>
          </div>
        )}

        {panel === "transferir" && (
          <div className="mt-3 rounded-2xl border border-azul-300 bg-azul-50 p-3 dark:border-azul-500/30 dark:bg-azul-500/10">
            <p className="text-sm font-semibold text-azul-900 dark:text-azul-200">
              ¿A qué garzón se transfiere la mesa {mesa.numero}?
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {candidatosTransferencia.map((g) => (
                <button
                  key={g.id}
                  onClick={() => void transferir(g)}
                  disabled={procesando}
                  className="btn btn-borde justify-start"
                >
                  <span className="truncate">{g.nombre}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setPanel(null)}
              disabled={procesando}
              className="btn btn-borde mt-2"
            >
              Volver
            </button>
          </div>
        )}

        <div className="mt-3">
          <Buscador valor={consulta} onCambiar={setConsulta} />
        </div>

        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Atención #{atencion.numero}
          {garzon ? ` · ${garzon.nombre}` : ""} · Abierta:{" "}
          {formatFechaHora(atencion.fechaApertura)}
        </p>
      </Encabezado>

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        {/* Carta: agregar productos en un toque (oculta en solo lectura) */}
        {puedeEditar && (
        <section className="tarjeta p-4">
          <h2 className="mb-2 text-sm font-bold text-verde-700 dark:text-verde-400">
            Carta
          </h2>
          <div className="max-h-[46vh] overflow-y-auto pr-1 lg:max-h-[62vh]">
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
                    <p className="sticky top-0 bg-white py-1.5 text-[11px] font-black uppercase tracking-[0.15em] text-zinc-400 dark:bg-[#1b2342] dark:text-zinc-500">
                      {categoria}
                    </p>
                    <ul>
                      {delGrupo.map((p) => {
                        const cantidad = enCuenta.get(p.id);
                        return (
                          <li key={p.id}>
                            <button
                              onClick={() =>
                                acciones.agregarProducto(atencion.id, p.id)
                              }
                              className="flex min-h-12 w-full items-center gap-2 rounded-xl px-2 py-2.5 text-left transition hover:bg-zinc-100 active:bg-zinc-200 dark:hover:bg-white/10 dark:active:bg-white/15"
                            >
                              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                                {p.nombre}
                                {cantidad && (
                                  <span className="ml-2 rounded-full bg-azul-700 px-2 py-0.5 text-xs font-bold text-white dark:bg-azul-500">
                                    ×{cantidad}
                                  </span>
                                )}
                              </span>
                              <span className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">
                                {formatCLP(p.precio)}
                              </span>
                              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-verde-600/10 text-verde-700 dark:bg-verde-500/15 dark:text-verde-400">
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
                    bloqueada={!puedeEditar}
                    onCantidad={(consumoId, delta) =>
                      acciones.cambiarCantidad(atencion.id, consumoId, delta)
                    }
                    onEliminar={(consumoId) =>
                      acciones.eliminarConsumo(atencion.id, consumoId)
                    }
                  />
                ))}
              </ul>
            )}
          </section>

          {/* Pagos parciales */}
          <SeccionAbonos
            atencionId={atencion.id}
            abonos={abonos}
            bloqueada={!puedeEditar}
          />

          {/* Menú buffet (mismo desglose que la app de reservas) */}
          <SelectorMenu
            menu={atencion.menu}
            bloqueada={!puedeEditar}
            onFijar={(menu) => acciones.fijarMenu(atencion.id, menu)}
          />
        </div>
      </div>
    </div>
  );
}

/* ------------- Mesa LIBRE: abrir atención + recibo + historial --------- */

function VistaLibre({
  mesa,
  reciboId,
  onVolver,
  onVerDesglose,
}: {
  mesa: Mesa;
  reciboId: string | null;
  onVolver: () => void;
  onVerDesglose: (atencionId: string) => void;
}) {
  const { atenciones } = useEstadoApp();
  const acciones = useAcciones();
  const { garzon } = useGarzonActual();
  const esAdmin = garzon?.rol === "ADMIN";
  const { atenciones: anteriores, cargando } = useHistorial(mesa.id, 10);
  const [procesando, setProcesando] = useState(false);

  const recibo =
    reciboId && atenciones[reciboId]?.estado === "PAGADA"
      ? atenciones[reciboId]
      : null;
  // La última cuenta de la mesa es la única que se puede reabrir.
  const ultima = anteriores[0] ?? null;

  async function abrir() {
    setProcesando(true);
    await acciones.abrirAtencion(mesa.id);
    setProcesando(false);
    // Si se abrió, la mesa pasa a OCUPADA y esta vista cambia sola.
  }

  async function reabrir(atencionId: string) {
    setProcesando(true);
    await acciones.reabrirAtencion(atencionId);
    setProcesando(false);
  }

  return (
    <div className="mx-auto max-w-xl px-3 pb-10">
      <Encabezado
        mesa={mesa}
        pill={{ texto: "Libre", clase: "pill-pagada" }}
        onVolver={onVolver}
      />

      {recibo && (
        <div className="tarjeta mb-4 border-verde-300 p-4 dark:border-verde-500/30">
          <p className="flex items-center gap-2 text-sm font-bold text-verde-800 dark:text-verde-300">
            <Lock className="h-4 w-4" /> Atención #{recibo.numero} cobrada: la
            cuenta pasó al historial y la mesa quedó libre.
          </p>
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-zinc-500 dark:text-zinc-400">Total cuenta</dt>
              <dd className="font-bold">{formatCLP(totalCuenta(recibo))}</dd>
            </div>
            {recibo.totalAbonos > 0 && (
              <div className="flex justify-between">
                <dt className="text-zinc-500 dark:text-zinc-400">Abonos</dt>
                <dd className="font-bold">−{formatCLP(recibo.totalAbonos)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-zinc-500 dark:text-zinc-400">
                Cobrado al cierre
              </dt>
              <dd className="font-black text-verde-700 dark:text-verde-300">
                {formatCLP(recibo.saldoFinal)}
              </dd>
            </div>
          </dl>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => onVerDesglose(recibo.id)}
              className="btn btn-borde"
            >
              <Receipt className="h-4 w-4" /> Ver desglose
            </button>
            {esAdmin && (
              <button
                onClick={() => void reabrir(recibo.id)}
                disabled={procesando}
                className="btn btn-borde"
              >
                <RotateCcw className="h-4 w-4" /> Reabrir cuenta
              </button>
            )}
          </div>
        </div>
      )}

      <div className="tarjeta p-5 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-verde-600/10 text-verde-700 dark:bg-verde-500/15 dark:text-verde-400">
          <DoorOpen className="h-7 w-7" />
        </span>
        <h2 className="mt-3 text-lg font-black tracking-tight">
          Mesa {mesa.numero} disponible
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {garzon
            ? `Al llegar clientes, abre una atención a nombre de ${garzon.nombre}.`
            : "Elige primero qué garzón atiende (botón en la pantalla de mesas)."}
        </p>
        <button
          onClick={() => void abrir()}
          disabled={procesando || !garzon}
          className="btn btn-verde mt-4 w-full text-base disabled:opacity-40"
        >
          <Sparkles className="h-5 w-5" /> Abrir atención
        </button>
      </div>

      <section className="tarjeta mt-4 p-4">
        <h2 className="text-sm font-bold text-verde-700 dark:text-verde-400">
          Cuentas anteriores de esta mesa
        </h2>
        {cargando ? (
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Cargando historial…
          </p>
        ) : anteriores.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Esta mesa aún no registra atenciones cerradas.
          </p>
        ) : (
          <>
            <ul className="mt-1 divide-y divide-zinc-100 dark:divide-white/10">
              {anteriores.map((a) => (
                <ItemAtencion
                  key={a.id}
                  atencion={a}
                  conMesa={false}
                  onVer={onVerDesglose}
                />
              ))}
            </ul>
            {esAdmin && ultima && !recibo && (
              <button
                onClick={() => void reabrir(ultima.id)}
                disabled={procesando}
                className="btn btn-borde mt-2 w-full"
              >
                <RotateCcw className="h-4 w-4" /> Reabrir última cuenta (#
                {ultima.numero})
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}
