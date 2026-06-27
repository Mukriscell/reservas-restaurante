import nodemailer from "nodemailer";
import { getMenu, formatCLP } from "./menu";
import { nombreDia, servicioParaReserva } from "./horarios";
import { SIN_SALON } from "./salones";
import type { Reserva } from "./types";

/**
 * Correos al cliente vía SMTP (nodemailer).
 *
 * Se configura con SMTP_HOST, SMTP_USER y SMTP_PASS (y opcionalmente
 * SMTP_PORT y MAIL_FROM). Sin configuración la app sigue funcionando:
 * simplemente no se envían correos y se avisa por consola.
 */

let avisado = false;

function transporte() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  const port = Number(SMTP_PORT ?? 587);
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

export interface Correo {
  asunto: string;
  html: string;
}

/** true si el correo salió; false si SMTP no está configurado o falló. */
export async function enviarCorreo(para: string, correo: Correo): Promise<boolean> {
  const smtp = transporte();
  if (!smtp) {
    if (!avisado) {
      avisado = true;
      console.warn(
        "[MESALISTA] SMTP sin configurar: no se envían correos " +
          "(define SMTP_HOST, SMTP_USER y SMTP_PASS)."
      );
    }
    return false;
  }
  try {
    await smtp.sendMail({
      from: process.env.MAIL_FROM ?? `"MESALISTA" <${process.env.SMTP_USER}>`,
      to: para,
      subject: correo.asunto,
      html: correo.html,
    });
    return true;
  } catch (err) {
    console.error("[MESALISTA] Error enviando correo:", err);
    return false;
  }
}

/* ----------------------------- Plantillas ------------------------------ */

const MARCA = "#c25a15";

function escapar(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fila(nombre: string, valor: string): string {
  return `<tr>
    <td style="padding:6px 12px 6px 0;color:#78716c;white-space:nowrap;vertical-align:top;">${nombre}</td>
    <td style="padding:6px 0;color:#1c1917;font-weight:600;">${valor}</td>
  </tr>`;
}

function tablaReserva(r: Reserva): string {
  const personas = r.adultos + r.ninos6a11 + r.ninos3a5;
  const servicio = servicioParaReserva(r.fecha, r.hora);
  const filas = [
    fila("Encargado de la mesa", escapar(r.nombreEncargado)),
    fila("Fecha", `${nombreDia(r.fecha)} ${r.fecha}`),
    fila("Hora de ingreso", `${r.hora} h${servicio ? ` (${servicio.nombre.toLowerCase()})` : ""}`),
    fila(
      "Personas",
      `${personas} (${r.adultos} adultos · ${r.ninos6a11} de 6–11 · ${r.ninos3a5} de 3–5)`
    ),
    fila("Menú", escapar(getMenu(r.menuId).nombre)),
    fila("Salón", escapar(r.salon ?? SIN_SALON)),
    r.accesibilidad
      ? fila("Accesibilidad", "Sí, prepararemos un espacio accesible")
      : "",
    r.detalles ? fila("Detalles", escapar(r.detalles)) : "",
    fila("Total estimado", formatCLP(r.totalEstimado)),
    r.abono > 0 ? fila("Abono dejado", formatCLP(r.abono)) : "",
    r.abono > 0
      ? fila("Saldo en el restaurante", formatCLP(r.totalEstimado - r.abono))
      : "",
  ];
  return `<table cellpadding="0" cellspacing="0" style="font-size:14px;line-height:1.4;border-collapse:collapse;">${filas.join("")}</table>`;
}

function plantilla(titulo: string, contenido: string): string {
  return `<!doctype html>
<html lang="es"><body style="margin:0;padding:0;background:#fdf6ee;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px;">
    <div style="background:${MARCA};border-radius:12px 12px 0 0;padding:18px 24px;">
      <span style="color:#ffffff;font-size:20px;font-weight:bold;letter-spacing:0.5px;">MESALISTA</span>
    </div>
    <div style="background:#ffffff;border:1px solid #e7e5e4;border-top:0;border-radius:0 0 12px 12px;padding:24px;">
      <h1 style="margin:0 0 12px;font-size:20px;color:#7c2d12;">${titulo}</h1>
      ${contenido}
    </div>
    <p style="text-align:center;color:#a8a29e;font-size:12px;margin-top:16px;">
      MESALISTA — Sistema de reservas para restaurantes
    </p>
  </div>
</body></html>`;
}

function botonGestion(urlGestion: string): string {
  return `<p style="margin:20px 0;">
    <a href="${urlGestion}" style="background:${MARCA};color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold;display:inline-block;">
      Gestionar mi reserva
    </a>
  </p>
  <p style="font-size:12px;color:#78716c;">
    Desde ese enlace puedes <strong>cancelar la reserva</strong> o
    <strong>cambiar tu hora de llegada</strong> (dentro del horario de
    atención). Si el botón no funciona, copia esta dirección:<br>
    <a href="${urlGestion}" style="color:${MARCA};">${urlGestion}</a>
  </p>`;
}

export function correoConfirmacion(r: Reserva, urlGestion: string): Correo {
  return {
    asunto: `Tu mesa está confirmada — ${r.fecha} a las ${r.hora} · MESALISTA`,
    html: plantilla(
      "¡Tu mesa está confirmada! 🎉",
      `<p style="font-size:14px;color:#44403c;">Hola ${escapar(r.nombreEncargado)},
        registramos tu reserva con estos datos:</p>
       ${tablaReserva(r)}
       ${botonGestion(urlGestion)}`
    ),
  };
}

export function correoCambioHora(r: Reserva, urlGestion: string): Correo {
  return {
    asunto: `Nueva hora de llegada: ${r.hora} — ${r.fecha} · MESALISTA`,
    html: plantilla(
      "Cambiamos tu hora de llegada",
      `<p style="font-size:14px;color:#44403c;">Hola ${escapar(r.nombreEncargado)},
        tu reserva quedó actualizada. Te esperamos el
        <strong>${nombreDia(r.fecha)} ${r.fecha}</strong> a las
        <strong>${r.hora} h</strong>.</p>
       ${tablaReserva(r)}
       ${botonGestion(urlGestion)}`
    ),
  };
}

export function correoCancelacion(r: Reserva): Correo {
  return {
    asunto: `Reserva cancelada — ${r.fecha} · MESALISTA`,
    html: plantilla(
      "Tu reserva quedó cancelada",
      `<p style="font-size:14px;color:#44403c;">Hola ${escapar(r.nombreEncargado)},
        cancelamos tu reserva del <strong>${nombreDia(r.fecha)} ${r.fecha}</strong>
        a las <strong>${r.hora} h</strong> a nombre de
        <strong>${escapar(r.nombreEncargado)}</strong>.</p>
       ${
         r.abono > 0
           ? `<p style="font-size:14px;color:#44403c;">Sobre la devolución del
              abono de <strong>${formatCLP(r.abono)}</strong>, el restaurante se
              pondrá en contacto contigo.</p>`
           : ""
       }
       <p style="font-size:14px;color:#44403c;">Esperamos verte pronto.
        Puedes hacer una nueva reserva cuando quieras.</p>`
    ),
  };
}
