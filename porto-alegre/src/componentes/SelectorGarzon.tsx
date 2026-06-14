import { useState } from "react";
import {
  Check,
  Pencil,
  ShieldCheck,
  UserRound,
  UserRoundPlus,
  UserRoundX,
  X,
} from "lucide-react";
import type { Garzon, RolGarzon } from "../tipos";
import { useAcciones, useEstadoApp, useGarzonActual } from "../estado/contexto";
import { MODO_COMPARTIDO } from "../sync/supabase";

/**
 * MODO LOCAL: overlay para elegir qué garzón opera este dispositivo
 * (INICIO/CIERRE_SESION quedan en la auditoría).
 * MODO COMPARTIDO: la identidad sale de la cuenta autenticada, así que
 * la lista no selecciona; queda como panel de equipo.
 * En ambos, un ADMIN gestiona usuarios: renombrar, cambiar rol y
 * desactivar (CREACION/MODIFICACION/DESACTIVACION_USUARIO auditadas).
 */
export function SelectorGarzon({
  abierto,
  onCerrar,
}: {
  abierto: boolean;
  onCerrar: () => void;
}) {
  const { garzones } = useEstadoApp();
  const { garzonId, garzon: garzonActual } = useGarzonActual();
  const acciones = useAcciones();
  const [nombre, setNombre] = useState("");
  const [ocupado, setOcupado] = useState(false);
  // Edición en línea (solo ADMIN)
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nombreEdit, setNombreEdit] = useState("");
  const [rolEdit, setRolEdit] = useState<RolGarzon>("GARZON");
  const [bajaId, setBajaId] = useState<string | null>(null);

  // En compartido nunca se fuerza: sin perfil aún no hay nada que elegir.
  const forzado = garzonId === null && !MODO_COMPARTIDO;
  const seleccionable = !MODO_COMPARTIDO;
  const esAdmin = garzonActual?.rol === "ADMIN";
  if (!abierto && !forzado) return null;

  const activos = [...garzones]
    .filter((g) => g.activo)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  async function crear() {
    const limpio = nombre.trim();
    if (limpio.length < 2 || ocupado) return;
    setOcupado(true);
    const garzon = await acciones.crearGarzon(limpio);
    setOcupado(false);
    if (garzon) {
      acciones.seleccionarGarzon(garzon.id);
      setNombre("");
      onCerrar();
    }
  }

  function empezarEdicion(g: Garzon) {
    setEditandoId(g.id);
    setNombreEdit(g.nombre);
    setRolEdit(g.rol);
    setBajaId(null);
  }

  async function guardarEdicion() {
    if (!editandoId || ocupado) return;
    setOcupado(true);
    const ok = await acciones.modificarGarzon(editandoId, nombreEdit, rolEdit);
    setOcupado(false);
    if (ok) setEditandoId(null);
  }

  async function desactivar(garzonId2: string) {
    if (ocupado) return;
    setOcupado(true);
    await acciones.desactivarGarzon(garzonId2);
    setOcupado(false);
    setBajaId(null);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-azul-950/60 p-3 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Elegir garzón"
    >
      <div className="tarjeta w-full max-w-md p-5 dark:bg-[#1b2342]">
        <div className="flex items-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-verde-600 text-white">
            <UserRound className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <h2 className="text-lg font-black tracking-tight">
              {seleccionable ? "¿Quién atiende?" : "Equipo"}
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {seleccionable
                ? "Cada acción queda registrada en la auditoría a nombre del garzón."
                : "Tu identidad viene de tu cuenta: cada acción queda auditada a tu nombre."}
            </p>
          </div>
          {!forzado && (
            <button
              onClick={onCerrar}
              aria-label="Cerrar"
              className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        <ul className="mt-4 max-h-[45vh] space-y-2 overflow-y-auto pr-1">
          {activos.map((g) =>
            editandoId === g.id ? (
              <li
                key={g.id}
                className="rounded-xl border border-azul-300 p-2 dark:border-azul-500/40"
              >
                <input
                  value={nombreEdit}
                  onChange={(e) => setNombreEdit(e.target.value)}
                  aria-label="Nuevo nombre"
                  className="min-h-11 w-full rounded-lg border border-zinc-300 bg-white px-2.5 text-sm outline-none focus:border-verde-600 dark:border-white/15 dark:bg-white/5"
                />
                <div className="mt-2 flex items-center gap-2">
                  <select
                    value={rolEdit}
                    onChange={(e) => setRolEdit(e.target.value as RolGarzon)}
                    aria-label="Rol"
                    className="min-h-11 flex-1 rounded-lg border border-zinc-300 bg-white px-2 text-sm dark:border-white/15 dark:bg-white/5"
                  >
                    <option value="GARZON">GARZÓN</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>
                  <button
                    onClick={() => void guardarEdicion()}
                    disabled={ocupado || nombreEdit.trim().length < 2}
                    aria-label="Guardar cambios"
                    className="btn btn-verde !min-h-11 disabled:opacity-40"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setEditandoId(null)}
                    aria-label="Cancelar edición"
                    className="btn btn-borde !min-h-11"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ) : (
              <li key={g.id} className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    if (!seleccionable) return;
                    acciones.seleccionarGarzon(g.id);
                    onCerrar();
                  }}
                  disabled={!seleccionable}
                  className={`flex min-h-12 flex-1 items-center gap-2 rounded-xl border px-3 text-left text-sm font-semibold transition ${
                    seleccionable ? "active:scale-[0.98]" : "cursor-default"
                  } ${
                    g.id === garzonId
                      ? "border-verde-600 bg-verde-50 text-verde-800 dark:border-verde-500/40 dark:bg-verde-500/10 dark:text-verde-300"
                      : "border-zinc-200 dark:border-white/10" +
                        (seleccionable
                          ? " hover:bg-zinc-50 dark:hover:bg-white/5"
                          : "")
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {g.nombre}
                    {g.email && (
                      <span className="ml-1.5 text-xs font-normal text-zinc-400 dark:text-zinc-500">
                        {g.email}
                      </span>
                    )}
                  </span>
                  {g.rol === "ADMIN" && (
                    <ShieldCheck className="h-4 w-4 shrink-0 text-azul-600 dark:text-azul-400" />
                  )}
                </button>
                {esAdmin &&
                  (bajaId === g.id ? (
                    <button
                      onClick={() => void desactivar(g.id)}
                      disabled={ocupado}
                      className="btn btn-peligro !min-h-11 !px-2.5 text-xs"
                    >
                      ¿Seguro?
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => empezarEdicion(g)}
                        aria-label={`Editar a ${g.nombre}`}
                        className="rounded-lg p-2.5 text-zinc-400 hover:bg-zinc-100 hover:text-azul-700 dark:hover:bg-white/10 dark:hover:text-azul-300"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setBajaId(g.id)}
                        aria-label={`Desactivar a ${g.nombre}`}
                        className="rounded-lg p-2.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                      >
                        <UserRoundX className="h-4 w-4" />
                      </button>
                    </>
                  ))}
              </li>
            )
          )}
        </ul>

        {(seleccionable || esAdmin) && (
          <div className="mt-4 flex gap-2 border-t border-zinc-200 pt-4 dark:border-white/10">
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void crear();
              }}
              placeholder="Nuevo garzón…"
              aria-label="Nombre del nuevo garzón"
              className="min-h-12 flex-1 rounded-xl border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-verde-600 dark:border-white/15 dark:bg-white/5"
            />
            <button
              onClick={() => void crear()}
              disabled={nombre.trim().length < 2 || ocupado}
              className="btn btn-verde disabled:opacity-40"
            >
              <UserRoundPlus className="h-4 w-4" /> Agregar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
