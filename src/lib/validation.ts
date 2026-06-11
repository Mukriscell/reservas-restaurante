import { z } from "zod";
import { MENU_IDS, PERSONAS_ABONO_OBLIGATORIO, calcularTotal } from "./menu";
import { SALONES } from "./salones";
import { nombreDia, serviciosParaFecha, servicioParaReserva } from "./horarios";

/** Contrato de creación de reserva (formulario público → API). */
export const crearReservaSchema = z
  .object({
    nombreEncargado: z
      .string()
      .trim()
      .min(2, "El nombre del encargado debe tener al menos 2 caracteres")
      .max(120, "El nombre es demasiado largo"),
    telefono: z
      .string()
      .trim()
      .max(20, "El teléfono es demasiado largo")
      .optional()
      .or(z.literal("")),
    fecha: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (formato AAAA-MM-DD)"),
    hora: z.string().regex(/^\d{2}:\d{2}$/, "Hora inválida (formato HH:MM)"),
    adultos: z.coerce
      .number()
      .int("La cantidad de adultos debe ser un número entero")
      .min(0)
      .max(200),
    ninos6a11: z.coerce.number().int().min(0).max(200),
    ninos3a5: z.coerce.number().int().min(0).max(200),
    menuId: z.enum(MENU_IDS, {
      errorMap: () => ({ message: "Debes seleccionar un menú válido" }),
    }),
    salon: z.enum(SALONES).optional(),
    accesibilidad: z.boolean().default(false),
    detalles: z.string().trim().max(1000, "Máximo 1000 caracteres").default(""),
    abono: z.coerce
      .number()
      .int("El abono debe ser un monto entero en pesos")
      .min(0, "El abono no puede ser negativo")
      .default(0),
  })
  .refine((data) => data.adultos + data.ninos6a11 + data.ninos3a5 > 0, {
    message: "La reserva debe incluir al menos una persona",
    path: ["adultos"],
  })
  .superRefine((data, ctx) => {
    // Día y horario de ingreso del restaurante.
    const servicios = serviciosParaFecha(data.fecha);
    if (servicios.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fecha"],
        message: `Recibimos reservas solo viernes, sábado y domingo (el ${data.fecha} es ${nombreDia(data.fecha)})`,
      });
    } else if (!servicioParaReserva(data.fecha, data.hora)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["hora"],
        message: `El ${nombreDia(data.fecha)} el ingreso es: ${servicios
          .map((s) => `${s.nombre.toLowerCase()} de ${s.desde} a ${s.hasta}`)
          .join(" y ")}`,
      });
    }

    // Abono: obligatorio desde 10 personas; nunca mayor al total estimado.
    const personas = data.adultos + data.ninos6a11 + data.ninos3a5;
    if (personas >= PERSONAS_ABONO_OBLIGATORIO && data.abono <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["abono"],
        message: `Las mesas de ${PERSONAS_ABONO_OBLIGATORIO} o más personas deben dejar un abono al reservar`,
      });
    }
    if (data.abono > calcularTotal(data)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["abono"],
        message: "El abono no puede superar el total estimado de la cuenta",
      });
    }
  });

export type CrearReservaInput = z.infer<typeof crearReservaSchema>;
