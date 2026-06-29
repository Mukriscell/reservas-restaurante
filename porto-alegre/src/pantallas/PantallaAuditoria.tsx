import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, RotateCcw, ScrollText, Search } from "lucide-react";
import type { AccionAuditoria, RegistroAuditoria } from "../tipos";
import { useEstadoApp, useGarzonActual } from "../estado/contexto";
import {
  MODO_COMPARTIDO,
  atencionesDeGarzon,
  consultarAuditoria,
} from "../sync/supabase";
import { ETIQUETAS_ACCION, descripcionAuditoria } from "../util/auditoria";
import { formatFechaHora } from "../util/fechas";
import { PillConexion } from "../componentes/Conexion";

/** Día local "YYYY-MM-DD" de un timestamp ISO. */
function diaLocal(iso: string): string {
  return new Date(iso).toLocaleDateString("sv");
}

function clasePill(accion: AccionAuditoria): string {
  switch (accion) {
    case "APERTURA_MESA":
    case "CIERRE_MESA":
    case "REAPERTURA_MESA":
      return "bg-verde-100 text-verde-800 dark:bg-verde-500/15 dark:text-verde-300";
    case "ELIMINAR_PRODUCTO":
    case "ELIMINAR_ABONO":
    case "DESACTIVACION_USUARIO":
    case "LIMPIAR_HISTORIAL":
      return "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300";
    case "REGISTRAR_ABONO":
    case "GENERAR_PRECUENTA":
      return "bg-amarillo-100 text-amarillo-900 dark:bg-amarillo-400/15 dark:text-amarillo-300";
    case "LOGIN":
    case "LOGOUT":
    case "INICIO_SESION":
    case "CIERRE_SESION":
    case "REGISTRO_USUARIO":
    case "CREACION_USUARIO":
    case "MODIFICACION_USUARIO":
    case "TRANSFERENCIA_MESA":
      return "bg-azul-100 text-azul-800 dark:bg-azul-500/20 dark:text-azul-300";
    default:
      return "bg-zinc-100 text-zinc-700 dark:bg-white/10 dark:text-zinc-300";
  }
}

const CAMPO =
  "min-h-11 rounded-xl border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-verde-600 dark:border-white/15 dark:bg-white/5";

/**
 * Auditoría del sistema (registros inalterables, solo lectura).
 * ADMIN ve todo y filtra por usuario; un garzón ve únicamente sus
 * acciones y las de sus propias mesas.
 */
export function PantallaAuditoria({ onVolver }: { onVolver: () => void }) {
  const { garzonId, garzon } = useGarzonActual();
  const esAdmin = garzon?.rol === "ADMIN";
  const { garzones, atenciones, auditoria: auditoriaLocal } = useEstadoApp();

  const [fecha, setFecha] = useState("");
  const [usuarioId, setUsuarioId] = useState("");
  const [mesa, setMesa] = useState("");
  const [accion, setAccion] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [version, setVersion] = useState(0); // botón actualizar

  const [remotos, setRemotos] = useState<RegistroAuditoria[]>([]);
  const [cargando, setCargando] = useState(MODO_COMPARTIDO);

  useEffect(() => {
    if (!MODO_COMPARTIDO) return;
    let activo = true;
    setCargando(true);
    (async () => {
      try {
        const soloDe =
          !esAdmin && garzonId
            ? { garzonId, atencionIds: await atencionesDeGarzon(garzonId) }
            : undefined;
        const filas = await consultarAuditoria({
          fecha: fecha || undefined,
          usuarioId: esAdmin && usuarioId ? usuarioId : undefined,
          mesaNumero: mesa.trim() ? Number(mesa) : undefined,
          accion: (accion || undefined) as AccionAuditoria | undefined,
          soloDe,
          limite: 300,
        });
        if (activo) setRemotos(filas);
      } catch {
        // Sin conexión: se muestra lo último consultado.
      } finally {
        if (activo) setCargando(false);
      }
    })();
    return () => {
      activo = false;
    };
  }, [fecha, usuarioId, mesa, accion, esAdmin, garzonId, version]);

  const registros = useMemo(() => {
    let lista: RegistroAuditoria[];
    if (MODO_COMPARTIDO) {
      lista = remotos;
    } else {
      lista = [...auditoriaLocal].reverse();
      if (!esAdmin && garzonId) {
        const mias = new Set(
          Object.values(atenciones)
            .filter((a) => a.garzonId === garzonId)
            .map((a) => a.id)
        );
        lista = lista.filter(
          (r) =>
            r.usuarioId === garzonId || (r.atencionId !== null && mias.has(r.atencionId))
        );
      }
      if (fecha) lista = lista.filter((r) => diaLocal(r.creadoEn) === fecha);
      if (esAdmin && usuarioId) lista = lista.filter((r) => r.usuarioId === usuarioId);
      if (mesa.trim()) lista = lista.filter((r) => r.mesaNumero === Number(mesa));
      if (accion) lista = lista.filter((r) => r.accion === accion);
      lista = lista.slice(0, 300);
    }
    const q = busqueda.trim().toLowerCase();
    if (q) {
      lista = lista.filter(
        (r) =>
          r.nombreUsuario.toLowerCase().includes(q) ||
          String(r.mesaNumero ?? "") === q
      );
    }
    return lista;
  }, [remotos, auditoriaLocal, atenciones, esAdmin, garzonId, fecha, usuarioId, mesa, accion, busqueda]);

  return (
    <div className="mx-auto max-w-2xl px-3 pb-10">
      <header className="barra-sup -mx-3 mb-4 px-3 py-3">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onVolver}
            aria-label="Volver a las mesas"
            className="btn btn-borde btn-icono"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="flex flex-1 items-center gap-2 text-lg font-black tracking-tight">
            <ScrollText className="h-5 w-5 text-verde-700 dark:text-amarillo-400" />
            Auditoría
          </h1>
          <button
            onClick={() => setVersion((v) => v + 1)}
            aria-label="Actualizar"
            className="btn btn-borde btn-icono"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <PillConexion />
        </div>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          {esAdmin
            ? "Registro completo e inalterable de todas las acciones del sistema."
            : "Tus acciones y las de tus propias mesas. El registro completo es exclusivo del ADMIN."}
        </p>

        {/* Filtros */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            aria-label="Filtrar por fecha"
            className={CAMPO}
          />
          {esAdmin ? (
            <select
              value={usuarioId}
              onChange={(e) => setUsuarioId(e.target.value)}
              aria-label="Filtrar por usuario"
              className={CAMPO}
            >
              <option value="">Todos los usuarios</option>
              {[...garzones]
                .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nombre}
                    {g.activo ? "" : " (inactivo)"}
                  </option>
                ))}
            </select>
          ) : (
            <input value={garzon?.nombre ?? ""} disabled className={CAMPO} />
          )}
          <input
            value={mesa}
            onChange={(e) => setMesa(e.target.value.replace(/[^\d]/g, ""))}
            inputMode="numeric"
            placeholder="Mesa Nº"
            aria-label="Filtrar por número de mesa"
            className={CAMPO}
          />
          <select
            value={accion}
            onChange={(e) => setAccion(e.target.value)}
            aria-label="Filtrar por tipo de acción"
            className={CAMPO}
          >
            <option value="">Todas las acciones</option>
            {(Object.keys(ETIQUETAS_ACCION) as AccionAuditoria[]).map((a) => (
              <option key={a} value={a}>
                {ETIQUETAS_ACCION[a]}
              </option>
            ))}
          </select>
          <div className="relative col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre de usuario o número de mesa…"
              aria-label="Buscar en la auditoría"
              className={`${CAMPO} w-full !pl-9`}
            />
          </div>
        </div>
      </header>

      <section className="tarjeta p-4">
        {cargando && registros.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Cargando auditoría…
          </p>
        ) : registros.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No hay registros que coincidan con los filtros.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-white/10">
            {registros.map((r) => (
              <li key={r.id} className="py-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-xs font-semibold tabular-nums text-zinc-500 dark:text-zinc-400">
                    {formatFechaHora(r.creadoEn)}
                  </span>
                  <span className="text-sm font-bold">{r.nombreUsuario}</span>
                  {r.rolUsuario === "ADMIN" && (
                    <span className="rounded-full bg-azul-950 px-1.5 py-0.5 text-[9px] font-black uppercase text-amarillo-400 dark:bg-azul-900">
                      Admin
                    </span>
                  )}
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${clasePill(r.accion)}`}
                  >
                    {r.accion}
                  </span>
                  {r.mesaNumero !== null && (
                    <span className="text-xs font-bold text-zinc-600 dark:text-zinc-300">
                      Mesa {r.mesaNumero}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                  {descripcionAuditoria(r)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
