import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { calcularTotal } from "./menu";
import type { CrearReservaInput } from "./validation";
import type { Reserva } from "./types";

/**
 * Persistencia simple en archivo JSON (data/reservas.json).
 *
 * Suficiente para un MVP de un solo proceso; la interfaz del repositorio
 * permite cambiar a Prisma/PostgreSQL sin tocar el resto de la app.
 */

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "reservas.json");

// Serializa las escrituras concurrentes dentro del proceso.
let writeLock: Promise<unknown> = Promise.resolve();

async function leerTodas(): Promise<Reserva[]> {
  try {
    const raw = await fs.readFile(DB_FILE, "utf-8");
    return JSON.parse(raw) as Reserva[];
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

export async function listarReservas(): Promise<Reserva[]> {
  const reservas = await leerTodas();
  // Más recientes primero por fecha/hora de la reserva.
  return reservas.sort((a, b) =>
    `${b.fecha} ${b.hora}`.localeCompare(`${a.fecha} ${a.hora}`)
  );
}

export async function crearReserva(input: CrearReservaInput): Promise<Reserva> {
  const reserva: Reserva = {
    id: randomUUID(),
    creadaEn: new Date().toISOString(),
    nombreEncargado: input.nombreEncargado,
    telefono: input.telefono || undefined,
    fecha: input.fecha,
    hora: input.hora,
    adultos: input.adultos,
    ninos6a11: input.ninos6a11,
    ninos3a5: input.ninos3a5,
    menuId: input.menuId,
    salon: input.salon,
    accesibilidad: input.accesibilidad,
    detalles: input.detalles,
    totalEstimado: calcularTotal(input),
  };

  const operacion = writeLock.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const reservas = await leerTodas();
    reservas.push(reserva);
    await fs.writeFile(DB_FILE, JSON.stringify(reservas, null, 2), "utf-8");
    return reserva;
  });
  writeLock = operacion.catch(() => undefined);
  return operacion;
}
