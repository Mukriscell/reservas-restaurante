"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, Loader2, XCircle } from "lucide-react";
import { horasDeIngreso, serviciosParaFecha } from "@/lib/horarios";

/**
 * Acciones del cliente sobre su reserva vigente: cambiar la hora de
 * llegada (dentro del horario de atención) o cancelarla.
 */
export default function AccionesReserva({
  id,
  fecha,
  horaActual,
}: {
  id: string;
  fecha: string;
  horaActual: string;
}) {
  const router = useRouter();
  const [hora, setHora] = useState("");
  const [confirmandoCancelar, setConfirmandoCancelar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const serviciosDia = serviciosParaFecha(fecha);

  async function ejecutar(body: object, exito: (correo: boolean) => string) {
    setEnviando(true);
    setError(null);
    setMensaje(null);
    try {
      const res = await fetch(`/api/reservas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "No se pudo actualizar");
      setMensaje(exito(Boolean(json.correoEnviado)));
      setHora("");
      setConfirmandoCancelar(false);
      router.refresh(); // re-renderiza los datos del servidor
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mt-6 space-y-4">
      {/* Cambiar hora de llegada */}
      <div className="rounded-xl border border-stone-200 p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-brand-800">
          <Clock className="h-4 w-4" /> Cambiar tu hora de llegada
        </h2>
        <p className="mt-1 text-xs text-stone-500">
          Solo horas dentro del horario de atención de ese día.
        </p>
        <div className="mt-3 flex gap-2">
          <select
            className="input"
            value={hora}
            onChange={(e) => setHora(e.target.value)}
            disabled={enviando}
          >
            <option value="">Elige la nueva hora</option>
            {serviciosDia.map((s) => (
              <optgroup key={s.id} label={`${s.nombre} (${s.desde} a ${s.hasta})`}>
                {horasDeIngreso(s)
                  .filter((h) => h !== horaActual)
                  .map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          <button
            onClick={() =>
              void ejecutar(
                { accion: "cambiarHora", hora },
                (correo) =>
                  `Listo: tu nueva hora de llegada es a las ${hora}.` +
                  (correo ? " Te enviamos un correo con el cambio." : "")
              )
            }
            disabled={enviando || !hora}
            className="shrink-0 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cambiar
          </button>
        </div>
      </div>

      {/* Cancelar reserva */}
      <div className="rounded-xl border border-red-200 p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-red-700">
          <XCircle className="h-4 w-4" /> Cancelar la reserva
        </h2>
        <p className="mt-1 text-xs text-stone-500">
          Si tuviste una eventualidad, puedes liberar tu mesa: la cancelación
          no se puede deshacer.
        </p>
        {confirmandoCancelar ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-red-700">
              ¿Seguro que quieres cancelar?
            </span>
            <button
              onClick={() =>
                void ejecutar(
                  { accion: "cancelar" },
                  (correo) =>
                    "Tu reserva quedó cancelada." +
                    (correo ? " Te enviamos un correo de confirmación." : "")
                )
              }
              disabled={enviando}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            >
              Sí, cancelar
            </button>
            <button
              onClick={() => setConfirmandoCancelar(false)}
              disabled={enviando}
              className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50"
            >
              Volver
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmandoCancelar(true)}
            disabled={enviando}
            className="mt-3 rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
          >
            Cancelar mi reserva
          </button>
        )}
      </div>

      {enviando && (
        <p className="flex items-center gap-2 text-sm text-stone-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Aplicando el cambio…
        </p>
      )}
      {mensaje && (
        <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {mensaje}
        </p>
      )}
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
