import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { COOKIE_SESION, crearTokenSesion, validarCredenciales } from "@/lib/auth";

const loginSchema = z.object({
  usuario: z.string().trim().min(1, "Ingresa el usuario"),
  clave: z.string().min(1, "Ingresa la contraseña"),
});

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
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
      { status: 400 }
    );
  }

  const error = validarCredenciales(parsed.data.usuario, parsed.data.clave);
  if (error) return NextResponse.json({ error }, { status: 401 });

  const sesion = crearTokenSesion();
  if (!sesion) {
    return NextResponse.json(
      { error: "El acceso de administrador no está configurado" },
      { status: 401 }
    );
  }

  const esHttps =
    (request.headers.get("x-forwarded-proto") ?? "").split(",")[0].trim() ===
    "https";
  const jar = await cookies();
  jar.set(COOKIE_SESION, sesion.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: esHttps,
    maxAge: sesion.maxAge,
    path: "/",
  });
  return NextResponse.json({ ok: true });
}

/** Cierra la sesión del administrador. */
export async function DELETE() {
  const jar = await cookies();
  jar.delete(COOKIE_SESION);
  return NextResponse.json({ ok: true });
}
