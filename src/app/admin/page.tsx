"use client";

import { useEffect, useState } from "react";
import { Accessibility, FileSpreadsheet, RefreshCw } from "lucide-react";
import { getMenu, formatCLP } from "@/lib/menu";
import { SIN_SALON } from "@/lib/salones";
import { servicioParaReserva } from "@/lib/horarios";
import type { Reserva } from "@/lib/types";

export default function AdminPage() {
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/reservas");
      if (!res.ok) throw new Error("No se pudieron cargar las reservas");
      const json = await res.json();
      setReservas(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    void cargar();
  }, []);

  const totalPersonas = reservas.reduce(
    (s, r) => s + r.adultos + r.ninos6a11 + r.ninos3a5,
    0
  );
  const totalCLP = reservas.reduce((s, r) => s + r.totalEstimado, 0);
  const totalAbonado = reservas.reduce((s, r) => s + r.abono, 0);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-brand-900">
            Administración de reservas
          </h1>
          <p className="mt-1 text-stone-600">
            {reservas.length} reservas · {totalPersonas} personas · ingreso
            estimado {formatCLP(totalCLP)} · abonado {formatCLP(totalAbonado)}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void cargar()}
            className="flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50"
          >
            <RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} />
            Actualizar
          </button>
          <a
            href="/api/reservas/export"
            className="flex items-center gap-2 rounded-lg bg-green-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-800"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Exportar a Excel
          </a>
        </div>
      </div>

      <p className="mt-2 text-xs text-stone-500">
        El Excel incluye la tabla completa más hojas divididas por salón, por
        tipo de menú, por servicio (almuerzo/cena), mesas con abono y
        accesibilidad, además de las tarifas y los horarios de ingreso.
      </p>

      {error && (
        <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-6 overflow-x-auto rounded-2xl border border-stone-200 bg-white shadow-sm">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="bg-brand-600 text-white">
            <tr>
              <th className="px-4 py-3 font-semibold">Encargado</th>
              <th className="px-4 py-3 font-semibold">Fecha / Hora</th>
              <th className="px-4 py-3 font-semibold">Personas</th>
              <th className="px-4 py-3 font-semibold">Menú</th>
              <th className="px-4 py-3 font-semibold">Salón</th>
              <th className="px-4 py-3 font-semibold">Acces.</th>
              <th className="px-4 py-3 font-semibold">Detalles</th>
              <th className="px-4 py-3 text-right font-semibold">Total</th>
              <th className="px-4 py-3 text-right font-semibold">Abono</th>
              <th className="px-4 py-3 text-right font-semibold">Saldo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {cargando ? (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-stone-500">
                  Cargando reservas…
                </td>
              </tr>
            ) : reservas.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-stone-500">
                  Aún no hay reservas registradas.
                </td>
              </tr>
            ) : (
              reservas.map((r) => (
                <tr key={r.id} className="hover:bg-brand-50/50">
                  <td className="px-4 py-3 font-medium">
                    {r.nombreEncargado}
                    {r.telefono && (
                      <span className="block text-xs text-stone-500">
                        {r.telefono}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {r.fecha}
                    <span className="block text-xs text-stone-500">
                      {r.hora}
                      {" · "}
                      {servicioParaReserva(r.fecha, r.hora)?.nombre ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {r.adultos + r.ninos6a11 + r.ninos3a5}
                    <span className="block text-xs text-stone-500">
                      {r.adultos}A · {r.ninos6a11}N(6-11) · {r.ninos3a5}N(3-5)
                    </span>
                  </td>
                  <td className="px-4 py-3">{getMenu(r.menuId).nombre}</td>
                  <td className="px-4 py-3">{r.salon ?? SIN_SALON}</td>
                  <td className="px-4 py-3">
                    {r.accesibilidad ? (
                      <Accessibility className="h-5 w-5 text-brand-600" />
                    ) : (
                      <span className="text-stone-400">—</span>
                    )}
                  </td>
                  <td className="max-w-[240px] px-4 py-3 text-xs text-stone-600">
                    {r.detalles || "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-brand-700">
                    {formatCLP(r.totalEstimado)}
                  </td>
                  <td className="px-4 py-3 text-right text-green-700">
                    {r.abono > 0 ? formatCLP(r.abono) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {formatCLP(r.totalEstimado - r.abono)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
