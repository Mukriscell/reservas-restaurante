import { NextResponse } from "next/server";
import { crearReservaSchema } from "@/lib/validation";
import { crearReserva, listarReservas } from "@/lib/db";

export async function GET() {
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
  return NextResponse.json({ data: reserva }, { status: 201 });
}
