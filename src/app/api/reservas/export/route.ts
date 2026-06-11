import { NextResponse } from "next/server";
import { listarReservas } from "@/lib/db";
import { generarExcelReservas } from "@/lib/excel";
import { sesionAdminValida } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await sesionAdminValida())) {
    return NextResponse.json(
      { error: "Requiere sesión de administrador" },
      { status: 401 }
    );
  }
  const reservas = await listarReservas();
  const buffer = await generarExcelReservas(reservas);
  const fecha = new Date().toISOString().slice(0, 10);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="reservas-${fecha}.xlsx"`,
    },
  });
}
