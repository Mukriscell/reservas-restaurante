import { useState } from "react";
import { UserRound, UserRoundPlus, X } from "lucide-react";
import { useAcciones, useEstadoApp, useGarzonActual } from "../estado/contexto";

/**
 * Overlay para elegir qué garzón opera este dispositivo. Se fuerza al
 * primer uso (sin garzón no se pueden abrir atenciones) y luego queda
 * disponible desde el header para cambiar de turno.
 */
export function SelectorGarzon({
  abierto,
  onCerrar,
}: {
  abierto: boolean;
  onCerrar: () => void;
}) {
  const { garzones } = useEstadoApp();
  const { garzonId } = useGarzonActual();
  const acciones = useAcciones();
  const [nombre, setNombre] = useState("");
  const [creando, setCreando] = useState(false);

  const forzado = garzonId === null;
  if (!abierto && !forzado) return null;

  const activos = [...garzones]
    .filter((g) => g.activo)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  async function crear() {
    const limpio = nombre.trim();
    if (limpio.length < 2 || creando) return;
    setCreando(true);
    const garzon = await acciones.crearGarzon(limpio);
    setCreando(false);
    if (garzon) {
      acciones.seleccionarGarzon(garzon.id);
      setNombre("");
      onCerrar();
    }
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
            <h2 className="text-lg font-black tracking-tight">¿Quién atiende?</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Cada atención y abono queda registrado a nombre del garzón.
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

        <ul className="mt-4 grid max-h-[45vh] grid-cols-2 gap-2 overflow-y-auto pr-1">
          {activos.map((g) => (
            <li key={g.id}>
              <button
                onClick={() => {
                  acciones.seleccionarGarzon(g.id);
                  onCerrar();
                }}
                className={`w-full rounded-xl border px-3 py-3 text-left text-sm font-semibold transition active:scale-[0.98] ${
                  g.id === garzonId
                    ? "border-verde-600 bg-verde-50 text-verde-800 dark:border-verde-500/40 dark:bg-verde-500/10 dark:text-verde-300"
                    : "border-zinc-200 hover:bg-zinc-50 dark:border-white/10 dark:hover:bg-white/5"
                }`}
              >
                {g.nombre}
              </button>
            </li>
          ))}
        </ul>

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
            disabled={nombre.trim().length < 2 || creando}
            className="btn btn-verde disabled:opacity-40"
          >
            <UserRoundPlus className="h-4 w-4" /> Agregar
          </button>
        </div>
      </div>
    </div>
  );
}
