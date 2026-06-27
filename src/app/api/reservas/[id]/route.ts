import { NextResponse } from "next/server";
import { accionReservaSchema } from "@/lib/validation";
import { actualizarReserva, obtenerReserva } from "@/lib/db";
import {
  descripcionIngreso,
  nombreDia,
  reservaVigente,
  servicioParaReserva,
} from "@/lib/horarios";
import { correoCambioHora, correoCancelacion, enviarCorreo } from "@/lib/mail";
import { urlBase } from "@/lib/url";

/**
 * Gestión de una reserva por su dueño (el id UUID actúa de clave):
 * cancelarla o cambiar la hora de llegada, solo mientras no haya ocurrido.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const reserva = await obtenerReserva(id);
  if (!reserva) {
    return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "El cuerpo de la solicitud debe ser JSON válido" },
      { status: 400 }
    );
  }
  const parsed = accionReservaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Acción inválida" },
      { status: 400 }
    );
  }

  if (reserva.estado === "CANCELADA") {
    return NextResponse.json(
      { error: "La reserva ya está cancelada" },
      { status: 409 }
    );
  }
  if (!reservaVigente(reserva.fecha, reserva.hora)) {
    return NextResponse.json(
      { error: "La reserva ya ocurrió: no se puede modificar" },
      { status: 409 }
    );
  }

  if (parsed.data.accion === "cancelar") {
    const actualizada = { ...reserva, estado: "CANCELADA" as const };
    await actualizarReserva(actualizada);
    const correoEnviado = await enviarCorreo(
      actualizada.email,
      correoCancelacion(actualizada)
    );
    return NextResponse.json({ data: actualizada, correoEnviado });
  }

  // Cambio de hora de llegada, siempre dentro del horario de atención.
  const { hora } = parsed.data;
  if (hora === reserva.hora) {
    return NextResponse.json(
      { error: "Elige una hora distinta a la actual" },
      { status: 400 }
    );
  }
  if (!servicioParaReserva(reserva.fecha, hora)) {
    return NextResponse.json(
      {
        error: `Esa hora está fuera del horario de atención: el ${nombreDia(
          reserva.fecha
        )} el ingreso es ${descripcionIngreso(reserva.fecha)}`,
      },
      { status: 400 }
    );
  }

  const actualizada = { ...reserva, hora };
  await actualizarReserva(actualizada);
  const correoEnviado = await enviarCorreo(
    actualizada.email,
    correoCambioHora(actualizada, `${urlBase(request)}/reserva/${actualizada.id}`)
  );
  return NextResponse.json({ data: actualizada, correoEnviado });
}
