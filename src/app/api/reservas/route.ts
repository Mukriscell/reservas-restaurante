import { NextResponse } from "next/server";
import { crearReservaSchema } from "@/lib/validation";
import { crearReserva, listarReservas } from "@/lib/db";
import { sesionAdminValida } from "@/lib/auth";
import { correoConfirmacion, enviarCorreo } from "@/lib/mail";
import { urlBase } from "@/lib/url";

export async function GET() {
  if (!(await sesionAdminValida())) {
    return NextResponse.json(
      { error: "Requiere sesión de administrador" },
      { status: 401 }
    );
  }
  const reservas = await listarReservas();
  return NextResponse.json({ data: reservas });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "El cuerpo de la solicitud debe ser JSON válido" },
      { status: 400 }
    );
  }

  const parsed = crearReservaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Datos de reserva inválidos",
        detalles: parsed.error.issues.map((i) => ({
          campo: i.path.join("."),
          mensaje: i.message,
        })),
      },
      { status: 400 }
    );
  }

  const reserva = await crearReserva(parsed.data);
  const urlGestion = `${urlBase(request)}/reserva/${reserva.id}`;
  const correoEnviado = await enviarCorreo(
    reserva.email,
    correoConfirmacion(reserva, urlGestion)
  );
  return NextResponse.json(
    { data: reserva, urlGestion, correoEnviado },
    { status: 201 }
  );
}
