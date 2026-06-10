import { z } from "zod";
import { MENU_IDS } from "./menu";
import { SALONES } from "./salones";

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
  })
  .refine((data) => data.adultos + data.ninos6a11 + data.ninos3a5 > 0, {
    message: "La reserva debe incluir al menos una persona",
    path: ["adultos"],
  });

export type CrearReservaInput = z.infer<typeof crearReservaSchema>;
