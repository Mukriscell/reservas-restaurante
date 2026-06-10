import ExcelJS from "exceljs";
import { getMenu, formatCLP, PRECIO_NINO_6_11, PRECIO_NINO_3_5 } from "./menu";
import { MENUS } from "./menu";
import { SALONES, SIN_SALON } from "./salones";
import type { Reserva } from "./types";

/**
 * Genera un libro Excel con las reservas divididas en tablas (hojas)
 * según lo solicitado en el formulario:
 *
 *  - "Todas las Reservas": tabla completa.
 *  - Una hoja por salón (incluye "Sin preferencia").
 *  - Una hoja por tipo de menú.
 *  - "Accesibilidad": reservas que indicaron asistente con discapacidad.
 */

const COLUMNS: Partial<ExcelJS.Column>[] = [
  { header: "Encargado de la mesa", key: "nombreEncargado", width: 28 },
  { header: "Teléfono", key: "telefono", width: 16 },
  { header: "Fecha", key: "fecha", width: 12 },
  { header: "Hora", key: "hora", width: 8 },
  { header: "Adultos", key: "adultos", width: 9 },
  { header: "Niños 6-11", key: "ninos6a11", width: 11 },
  { header: "Niños 3-5", key: "ninos3a5", width: 10 },
  { header: "Total personas", key: "totalPersonas", width: 14 },
  { header: "Menú", key: "menu", width: 42 },
  { header: "Salón", key: "salon", width: 16 },
  { header: "Accesibilidad", key: "accesibilidad", width: 13 },
  { header: "Detalles adicionales", key: "detalles", width: 45 },
  { header: "Total estimado (CLP)", key: "totalEstimado", width: 20 },
  { header: "Creada en", key: "creadaEn", width: 20 },
];

function agregarHoja(
  workbook: ExcelJS.Workbook,
  nombre: string,
  reservas: Reserva[]
) {
  // Excel no permite estos caracteres en nombres de hoja.
  const sheet = workbook.addWorksheet(nombre.replace(/[\\/*?:[\]]/g, "-"));
  sheet.columns = COLUMNS;

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFC25A15" },
  };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: COLUMNS.length },
  };

  for (const r of reservas) {
    sheet.addRow({
      nombreEncargado: r.nombreEncargado,
      telefono: r.telefono ?? "",
      fecha: r.fecha,
      hora: r.hora,
      adultos: r.adultos,
      ninos6a11: r.ninos6a11,
      ninos3a5: r.ninos3a5,
      totalPersonas: r.adultos + r.ninos6a11 + r.ninos3a5,
      menu: getMenu(r.menuId).nombre,
      salon: r.salon ?? SIN_SALON,
      accesibilidad: r.accesibilidad ? "Sí" : "No",
      detalles: r.detalles,
      totalEstimado: r.totalEstimado,
      creadaEn: new Date(r.creadaEn).toLocaleString("es-CL"),
    });
  }

  sheet.getColumn("totalEstimado").numFmt = '"$"#,##0';

  if (reservas.length > 0) {
    const totalRow = sheet.addRow({
      nombreEncargado: `TOTAL (${reservas.length} reservas)`,
      adultos: reservas.reduce((s, r) => s + r.adultos, 0),
      ninos6a11: reservas.reduce((s, r) => s + r.ninos6a11, 0),
      ninos3a5: reservas.reduce((s, r) => s + r.ninos3a5, 0),
      totalPersonas: reservas.reduce(
        (s, r) => s + r.adultos + r.ninos6a11 + r.ninos3a5,
        0
      ),
      totalEstimado: reservas.reduce((s, r) => s + r.totalEstimado, 0),
    });
    totalRow.font = { bold: true };
  }
}

export async function generarExcelReservas(
  reservas: Reserva[]
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MESALISTA";
  workbook.created = new Date();

  // 1. Tabla completa
  agregarHoja(workbook, "Todas las Reservas", reservas);

  // 2. Dividido por salón
  for (const salon of SALONES) {
    agregarHoja(
      workbook,
      salon,
      reservas.filter((r) => r.salon === salon)
    );
  }
  agregarHoja(
    workbook,
    SIN_SALON,
    reservas.filter((r) => !r.salon)
  );

  // 3. Dividido por tipo de menú
  for (const menu of MENUS) {
    agregarHoja(
      workbook,
      // nombre corto: Excel limita los nombres de hoja a 31 caracteres
      `Menú ${menu.nombreCorto}`,
      reservas.filter((r) => r.menuId === menu.id)
    );
  }

  // 4. Reservas con accesibilidad
  agregarHoja(
    workbook,
    "Accesibilidad",
    reservas.filter((r) => r.accesibilidad)
  );

  // Hoja de referencia de precios
  const precios = workbook.addWorksheet("Tarifas");
  precios.columns = [
    { header: "Concepto", key: "concepto", width: 48 },
    { header: "Precio por persona", key: "precio", width: 20 },
  ];
  precios.getRow(1).font = { bold: true };
  for (const m of MENUS) {
    precios.addRow({ concepto: `${m.nombre} (adulto)`, precio: formatCLP(m.precioAdulto) });
  }
  precios.addRow({ concepto: "Niños 6 a 11 años (buffet)", precio: formatCLP(PRECIO_NINO_6_11) });
  precios.addRow({ concepto: "Niños 3 a 5 años (buffet)", precio: formatCLP(PRECIO_NINO_3_5) });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
