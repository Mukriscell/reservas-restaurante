import { notFound } from "next/navigation";
import {
  Accessibility,
  CalendarDays,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { obtenerReserva } from "@/lib/db";
import { getMenu, formatCLP } from "@/lib/menu";
import { SIN_SALON } from "@/lib/salones";
import {
  nombreDia,
  reservaVigente,
  servicioParaReserva,
} from "@/lib/horarios";
import AccionesReserva from "./acciones";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "MESALISTA — Tu reserva",
};

export default async function GestionReservaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const reserva = await obtenerReserva(id);
  if (!reserva) notFound();

  const personas = reserva.adultos + reserva.ninos6a11 + reserva.ninos3a5;
  const servicio = servicioParaReserva(reserva.fecha, reserva.hora);
  const cancelada = reserva.estado === "CANCELADA";
  const vigente = reservaVigente(reserva.fecha, reserva.hora);

  const filas: [string, React.ReactNode][] = [
    ["Encargado de la mesa", reserva.nombreEncargado],
    ["Correo", reserva.email || "—"],
    ["Fecha", `${nombreDia(reserva.fecha)} ${reserva.fecha}`],
    [
      "Hora de ingreso",
      `${reserva.hora} h${servicio ? ` (${servicio.nombre.toLowerCase()})` : ""}`,
    ],
    [
      "Personas",
      `${personas} (${reserva.adultos} adultos · ${reserva.ninos6a11} de 6–11 · ${reserva.ninos3a5} de 3–5)`,
    ],
    ["Menú", getMenu(reserva.menuId).nombre],
    ["Salón", reserva.salon ?? SIN_SALON],
    ["Total estimado", formatCLP(reserva.totalEstimado)],
  ];
  if (reserva.abono > 0) {
    filas.push(
      ["Abono dejado", formatCLP(reserva.abono)],
      ["Saldo en el restaurante", formatCLP(reserva.totalEstimado - reserva.abono)]
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-brand-900">
              <CalendarDays className="h-6 w-6 text-brand-600" /> Tu reserva
            </h1>
            <p className="mt-1 text-sm text-stone-600">
              Código: <span className="font-mono text-xs">{reserva.id}</span>
            </p>
          </div>
          {cancelada ? (
            <span className="flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-sm font-semibold text-red-700">
              <XCircle className="h-4 w-4" /> Cancelada
            </span>
          ) : (
            <span className="flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-700">
              <CheckCircle2 className="h-4 w-4" /> Confirmada
            </span>
          )}
        </div>

        <dl className="mt-6 space-y-2 text-sm">
          {filas.map(([nombre, valor]) => (
            <div
              key={nombre}
              className="flex justify-between gap-4 border-b border-stone-100 pb-2"
            >
              <dt className="text-stone-500">{nombre}</dt>
              <dd className="text-right font-medium">{valor}</dd>
            </div>
          ))}
        </dl>

        {reserva.accesibilidad && (
          <p className="mt-4 flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">
            <Accessibility className="h-4 w-4 shrink-0" />
            Prepararemos un espacio accesible para tu mesa.
          </p>
        )}
        {reserva.detalles && (
          <p className="mt-4 rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-600">
            <span className="font-semibold">Detalles:</span> {reserva.detalles}
          </p>
        )}

        {cancelada ? (
          <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Esta reserva fue cancelada. Si cambias de opinión, haz una nueva
            reserva desde la página principal.
          </p>
        ) : !vigente ? (
          <p className="mt-6 rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600">
            Esta reserva ya ocurrió, por lo que no se puede modificar.
            ¡Esperamos que lo hayas pasado muy bien!
          </p>
        ) : (
          <AccionesReserva
            id={reserva.id}
            fecha={reserva.fecha}
            horaActual={reserva.hora}
          />
        )}
      </div>
    </div>
  );
}
