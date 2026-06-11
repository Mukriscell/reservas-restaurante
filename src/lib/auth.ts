import { createHash, createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

/**
 * Sesión de administrador con cookie firmada (HMAC-SHA256).
 *
 * Credenciales por variables de entorno: ADMIN_USER y ADMIN_PASSWORD.
 * Sin ADMIN_PASSWORD, en desarrollo se usa admin / mesalista (con aviso);
 * en producción el acceso queda deshabilitado hasta configurarla.
 */

export const COOKIE_SESION = "mesalista_admin";
const DURACION_SESION_MS = 8 * 60 * 60 * 1000; // 8 horas

const USUARIO_DEV = "admin";
const CLAVE_DEV = "mesalista";

let avisado = false;

function credenciales(): { usuario: string; clave: string } | null {
  const usuario = process.env.ADMIN_USER || USUARIO_DEV;
  if (process.env.ADMIN_PASSWORD) {
    return { usuario, clave: process.env.ADMIN_PASSWORD };
  }
  if (process.env.NODE_ENV === "production") return null;
  if (!avisado) {
    avisado = true;
    console.warn(
      `[MESALISTA] ADMIN_PASSWORD no configurada: en desarrollo el acceso de ` +
        `administrador es ${USUARIO_DEV} / ${CLAVE_DEV}.`
    );
  }
  return { usuario: USUARIO_DEV, clave: CLAVE_DEV };
}

/** Comparación en tiempo constante de strings de largo arbitrario. */
function iguales(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

// Derivada de la clave del admin: cambiarla invalida las sesiones abiertas.
function claveDeFirma(clave: string): Buffer {
  return createHash("sha256").update(`mesalista-sesion:${clave}`).digest();
}

function firmar(expira: number, clave: string): string {
  return createHmac("sha256", claveDeFirma(clave))
    .update(String(expira))
    .digest("hex");
}

/** null si usuario y clave son correctos; mensaje de error si no. */
export function validarCredenciales(usuario: string, clave: string): string | null {
  const cred = credenciales();
  if (!cred) {
    return "El acceso de administrador no está configurado: define ADMIN_USER y ADMIN_PASSWORD en el servidor";
  }
  return iguales(usuario, cred.usuario) && iguales(clave, cred.clave)
    ? null
    : "Usuario o contraseña incorrectos";
}

/** Token firmado para la cookie de sesión y su vigencia en segundos. */
export function crearTokenSesion(): { token: string; maxAge: number } | null {
  const cred = credenciales();
  if (!cred) return null;
  const expira = Date.now() + DURACION_SESION_MS;
  return {
    token: `${expira}.${firmar(expira, cred.clave)}`,
    maxAge: DURACION_SESION_MS / 1000,
  };
}

function tokenValido(token: string | undefined): boolean {
  const cred = credenciales();
  if (!cred || !token) return false;
  const [expiraStr, firma] = token.split(".");
  const expira = Number(expiraStr);
  if (!Number.isFinite(expira) || Date.now() > expira || !firma) return false;
  return iguales(firma, firmar(expira, cred.clave));
}

/** true si la petición actual trae una sesión de administrador vigente. */
export async function sesionAdminValida(): Promise<boolean> {
  const jar = await cookies();
  return tokenValido(jar.get(COOKIE_SESION)?.value);
}
