import type { Abono, Atencion, Consumo } from "../tipos";
import {
  PROPINA_SUGERIDA_PCT,
  propinaSugerida,
  saldoPendiente,
  totalCuenta,
} from "../tipos";
import { getProducto } from "../data/catalogo";
import { desgloseMenu, getMenuBuffet } from "../data/menus";
import { formatCLP } from "../util/dinero";

/**
 * Precuenta profesional en PDF (ticket 80 mm) con la identidad de Porto
 * Alegre: encabezado verde Brasil, detalle de consumo, resumen por
 * categorías, resumen financiero (abonos y saldo pendiente) y pie.
 *
 * jsPDF se carga bajo demanda (code-splitting): el bundle principal no
 * crece y la generación sigue siendo instantánea desde móvil/tablet.
 */

export interface DatosPrecuenta {
  mesaNumero: number;
  garzonNombre: string;
  atencion: Atencion;
  consumos: Consumo[];
  abonos: Abono[];
}

const VERDE: [number, number, number] = [0, 151, 57];
const VERDE_OSCURO: [number, number, number] = [3, 84, 63];
const AMARILLO: [number, number, number] = [250, 197, 21];
const AZUL: [number, number, number] = [16, 24, 64];
const TINTA: [number, number, number] = [24, 24, 27];
const GRIS: [number, number, number] = [113, 113, 122];

const ANCHO = 80; // mm (ticket de caja)
const MARGEN = 7;

/** Intl puede meter espacios duros que las fuentes del PDF no traen. */
function plata(monto: number): string {
  return formatCLP(monto).replace(/ /g, " ");
}

function nombreArchivo(datos: DatosPrecuenta): string {
  const fecha = new Date().toISOString().slice(0, 10);
  return `precuenta-mesa-${datos.mesaNumero}-atencion-${datos.atencion.numero}-${fecha}.pdf`;
}

async function logoComoPng(): Promise<string | null> {
  try {
    const respuesta = await fetch("/icons/icon-192.png");
    if (!respuesta.ok) return null;
    const blob = await respuesta.blob();
    return await new Promise((resolver) => {
      const lector = new FileReader();
      lector.onload = () => resolver(lector.result as string);
      lector.onerror = () => resolver(null);
      lector.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function generarPrecuenta(datos: DatosPrecuenta): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const { atencion, consumos, abonos } = datos;

  // Resumen por categorías (orden de la carta).
  const porCategoria = new Map<string, number>();
  for (const c of consumos) {
    const categoria = getProducto(c.productoId).categoria;
    porCategoria.set(categoria, (porCategoria.get(categoria) ?? 0) + c.subtotal);
  }
  const lineasMenu = desgloseMenu(atencion.menu);
  const subtotalConsumos = consumos.reduce((s, c) => s + c.subtotal, 0);

  // Altura estimada antes de crear el documento (formato fijo en jsPDF).
  const alto =
    96 +
    consumos.length * 9 +
    (atencion.menu ? 12 + lineasMenu.length * 4.5 : 0) +
    (porCategoria.size > 0 ? 10 + porCategoria.size * 4.5 : 0) +
    (abonos.length > 0 ? 6 + abonos.length * 4.5 : 0) +
    34;

  const doc = new jsPDF({
    unit: "mm",
    format: [ANCHO, Math.max(alto, 130)],
    compress: true,
  });

  const xDer = ANCHO - MARGEN;
  let y = 0;

  /* ------------------------------ Encabezado --------------------------- */
  doc.setFillColor(...VERDE);
  doc.rect(0, 0, ANCHO, 24, "F");
  doc.setFillColor(...AMARILLO);
  doc.rect(0, 24, ANCHO, 1.4, "F");

  const logo = await logoComoPng();
  if (logo) doc.addImage(logo, "PNG", MARGEN - 1.5, 4.6, 12, 12);

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("PORTO ALEGRE", ANCHO / 2 + (logo ? 5 : 0), 11.5, { align: "center" });
  doc.setFontSize(7.5);
  doc.setTextColor(...AMARILLO);
  doc.text("R E S T O B A R   B R A S I L E Ñ O", ANCHO / 2 + (logo ? 5 : 0), 17.5, {
    align: "center",
  });
  doc.setFontSize(6.5);
  doc.setTextColor(255, 255, 255);
  doc.text(`Mesa ${datos.mesaNumero}`, ANCHO / 2 + (logo ? 5 : 0), 21.6, {
    align: "center",
  });

  /* --------------------------------- Meta ------------------------------ */
  y = 31;
  const ahora = new Date();
  doc.setTextColor(...TINTA);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("PRECUENTA", ANCHO / 2, y, { align: "center" });
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...GRIS);
  doc.text(
    `Fecha: ${ahora.toLocaleDateString("es-CL")}   Hora: ${ahora.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}`,
    ANCHO / 2,
    y,
    { align: "center" }
  );
  y += 4;
  doc.text(
    `Mesa ${datos.mesaNumero} · Atención #${atencion.numero} · Garzón: ${datos.garzonNombre}`,
    ANCHO / 2,
    y,
    { align: "center" }
  );
  y += 5;

  const separador = (punteado = true) => {
    doc.setDrawColor(...GRIS);
    doc.setLineWidth(0.2);
    if (punteado) doc.setLineDashPattern([0.8, 0.8], 0);
    doc.line(MARGEN, y, xDer, y);
    doc.setLineDashPattern([], 0);
    y += 4;
  };
  const titulo = (texto: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...VERDE_OSCURO);
    doc.text(texto.toUpperCase(), MARGEN, y);
    y += 4;
  };

  separador();

  /* --------------------------- Detalle de consumo ---------------------- */
  titulo("Detalle de consumo");
  doc.setFontSize(8);
  if (consumos.length === 0 && !atencion.menu) {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GRIS);
    doc.text("Sin consumos registrados.", MARGEN, y);
    y += 5;
  }
  for (const c of consumos) {
    const producto = getProducto(c.productoId);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...TINTA);
    const texto = doc.splitTextToSize(
      `${c.cantidad} x ${producto.nombre}`,
      ANCHO - MARGEN * 2 - 16
    ) as string[];
    doc.text(texto[0], MARGEN, y);
    doc.text(plata(c.subtotal), xDer, y, { align: "right" });
    y += 3.6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...GRIS);
    doc.text(`${plata(c.precioUnitario)} c/u`, MARGEN, y);
    doc.setFontSize(8);
    y += 4.6;
  }

  /* ------------------------------ Menú buffet -------------------------- */
  if (atencion.menu) {
    y += 1;
    titulo(`Menú · ${getMenuBuffet(atencion.menu.menuId).nombre}`);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...TINTA);
    for (const linea of lineasMenu) {
      doc.text(linea.texto, MARGEN, y);
      doc.text(plata(linea.monto), xDer, y, { align: "right" });
      y += 4.2;
    }
  }

  /* ------------------------- Resumen por categorías -------------------- */
  if (porCategoria.size > 0) {
    y += 1;
    separador();
    titulo("Resumen por categorías");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...TINTA);
    for (const [categoria, total] of porCategoria) {
      doc.text(`${categoria}:`, MARGEN, y);
      doc.text(plata(total), xDer, y, { align: "right" });
      y += 4.2;
    }
  }

  /* --------------------------- Resumen financiero ---------------------- */
  y += 1;
  separador();
  titulo("Resumen financiero");
  doc.setFontSize(7.5);
  doc.setTextColor(...TINTA);
  doc.setFont("helvetica", "normal");
  doc.text("Subtotal consumos:", MARGEN, y);
  doc.text(plata(subtotalConsumos), xDer, y, { align: "right" });
  y += 4.2;
  if (atencion.menu) {
    doc.text("Menú buffet:", MARGEN, y);
    doc.text(plata(atencion.totalMenu), xDer, y, { align: "right" });
    y += 4.2;
  }
  doc.setFont("helvetica", "bold");
  doc.text("Total:", MARGEN, y);
  doc.text(plata(totalCuenta(atencion)), xDer, y, { align: "right" });
  y += 4.2;
  if (abonos.length > 0) {
    doc.setFont("helvetica", "normal");
    for (const abono of abonos) {
      doc.text(
        `Abono${abono.observacion ? ` (${abono.observacion})` : ""}:`,
        MARGEN,
        y
      );
      doc.text(`-${plata(abono.monto)}`, xDer, y, { align: "right" });
      y += 4.2;
    }
  }

  // Propina: la fijada (reimpresión de una cuenta cerrada) o, en una
  // mesa aún abierta, la sugerida del 10% como referencia para el cliente.
  const propina =
    atencion.propinaMonto > 0 ? atencion.propinaMonto : propinaSugerida(atencion);
  const etiquetaPropina =
    atencion.propinaMonto > 0
      ? `Propina (${atencion.propinaPct}%):`
      : `Propina sugerida (${PROPINA_SUGERIDA_PCT}%):`;
  if (propina > 0) {
    doc.setFont("helvetica", "normal");
    doc.text(etiquetaPropina, MARGEN, y);
    doc.text(plata(propina), xDer, y, { align: "right" });
    y += 4.2;
    doc.setFont("helvetica", "bold");
    doc.text("Total con propina:", MARGEN, y);
    doc.text(plata(saldoPendiente(atencion) + propina), xDer, y, {
      align: "right",
    });
    y += 4.2;
  }

  // Saldo pendiente destacado (caja azul marino + amarillo Brasil).
  y += 1.5;
  doc.setFillColor(...AZUL);
  doc.roundedRect(MARGEN - 1.5, y - 3.4, ANCHO - (MARGEN - 1.5) * 2, 9.4, 1.6, 1.6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text("SALDO PENDIENTE", MARGEN + 1.5, y + 2);
  doc.setFontSize(10.5);
  doc.setTextColor(...AMARILLO);
  doc.text(plata(saldoPendiente(atencion)), xDer - 1.5, y + 2.2, { align: "right" });
  y += 11.5;

  /* --------------------------------- Pie ------------------------------- */
  doc.setFont("helvetica", "bolditalic");
  doc.setFontSize(8);
  doc.setTextColor(...VERDE_OSCURO);
  doc.text("Gracias por preferir Porto Alegre", ANCHO / 2, y, { align: "center" });
  y += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.8);
  doc.setTextColor(...GRIS);
  doc.text(
    "Documento informativo — no válido como boleta o factura",
    ANCHO / 2,
    y,
    { align: "center" }
  );

  return doc.output("blob");
}

/* ------------------------- Entrega del documento ----------------------- */

export function descargarPrecuenta(blob: Blob, datos: DatosPrecuenta): void {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombreArchivo(datos);
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** true si el sistema mostró la hoja de compartir. */
export async function compartirPrecuenta(
  blob: Blob,
  datos: DatosPrecuenta
): Promise<boolean> {
  const archivo = new File([blob], nombreArchivo(datos), {
    type: "application/pdf",
  });
  const nav = navigator as Navigator & {
    canShare?: (d: ShareData) => boolean;
  };
  if (!nav.canShare?.({ files: [archivo] })) return false;
  try {
    await navigator.share({
      files: [archivo],
      title: `Precuenta mesa ${datos.mesaNumero} — Porto Alegre`,
    });
    return true;
  } catch {
    // El usuario canceló la hoja de compartir: no es un error.
    return true;
  }
}

/** Abre el PDF en una pestaña para imprimirlo desde el visor. */
export function imprimirPrecuenta(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
