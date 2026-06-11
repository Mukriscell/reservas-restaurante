import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { calcularTotal } from "./menu";
import type { CrearReservaInput } from "./validation";
import type { Reserva } from "./types";

/**
 * Persistencia de reservas tras una interfaz de repositorio.
 *
 *  - Firestore (Firebase): se activa cuando hay credenciales en el
 *    entorno (FIREBASE_SERVICE_ACCOUNT, o FIREBASE_PROJECT_ID +
 *    FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY) o cuando se usa el
 *    emulador (FIRESTORE_EMULATOR_HOST). Es el modo de producción.
 *  - Archivo JSON local (data/reservas.json): respaldo para desarrollo
 *    sin configurar Firebase.
 */

interface RepositorioReservas {
  listar(): Promise<Reserva[]>;
  obtener(id: string): Promise<Reserva | null>;
  guardar(reserva: Reserva): Promise<void>;
  actualizar(reserva: Reserva): Promise<void>;
}

/* ----------------------------- Firestore ------------------------------ */

const COLECCION = "reservas";

function credencialesFirebase() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) as {
      project_id: string;
      client_email: string;
      private_key: string;
    };
  }
  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } =
    process.env;
  if (FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY) {
    return {
      project_id: FIREBASE_PROJECT_ID,
      client_email: FIREBASE_CLIENT_EMAIL,
      // En paneles como Vercel o Render la clave suele pegarse con \n literales.
      private_key: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    };
  }
  return null;
}

function usaFirestore(): boolean {
  return Boolean(
    credencialesFirebase() || process.env.FIRESTORE_EMULATOR_HOST
  );
}

async function repoFirestore(): Promise<RepositorioReservas> {
  const { initializeApp, getApps, cert } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");

  if (getApps().length === 0) {
    const cred = credencialesFirebase();
    if (cred) {
      initializeApp({
        credential: cert({
          projectId: cred.project_id,
          clientEmail: cred.client_email,
          privateKey: cred.private_key,
        }),
        projectId: cred.project_id,
      });
    } else {
      // Emulador: no requiere credenciales.
      initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID ?? "demo-mesalista",
      });
    }
  }

  const db = getFirestore();
  // Firestore no acepta undefined; serializar lo descarta, igual
  // que hacía el archivo JSON con los campos opcionales vacíos.
  const escribir = async (reserva: Reserva) => {
    const limpia = JSON.parse(JSON.stringify(reserva)) as Reserva;
    await db.collection(COLECCION).doc(reserva.id).set(limpia);
  };
  return {
    async listar() {
      const snapshot = await db.collection(COLECCION).get();
      return snapshot.docs.map((doc) => doc.data() as Reserva);
    },
    async obtener(id) {
      const doc = await db.collection(COLECCION).doc(id).get();
      return doc.exists ? (doc.data() as Reserva) : null;
    },
    guardar: escribir,
    actualizar: escribir,
  };
}

/* ------------------------- Archivo JSON local ------------------------- */

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "reservas.json");

// Serializa las escrituras concurrentes dentro del proceso.
let writeLock: Promise<unknown> = Promise.resolve();

async function leerArchivo(): Promise<Reserva[]> {
  try {
    const raw = await fs.readFile(DB_FILE, "utf-8");
    return JSON.parse(raw) as Reserva[];
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

function escribirArchivo(mutar: (reservas: Reserva[]) => void): Promise<void> {
  const operacion = writeLock.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const reservas = await leerArchivo();
    mutar(reservas);
    await fs.writeFile(DB_FILE, JSON.stringify(reservas, null, 2), "utf-8");
  });
  writeLock = operacion.catch(() => undefined);
  return operacion;
}

const repoJson: RepositorioReservas = {
  listar: leerArchivo,
  async obtener(id) {
    const reservas = await leerArchivo();
    return reservas.find((r) => r.id === id) ?? null;
  },
  guardar: (reserva) =>
    escribirArchivo((reservas) => {
      reservas.push(reserva);
    }),
  actualizar: (reserva) =>
    escribirArchivo((reservas) => {
      const i = reservas.findIndex((r) => r.id === reserva.id);
      if (i === -1) throw new Error(`Reserva ${reserva.id} no existe`);
      reservas[i] = reserva;
    }),
};

/* ----------------------------- Selección ------------------------------ */

let repo: Promise<RepositorioReservas> | null = null;
let avisado = false;

function getRepo(): Promise<RepositorioReservas> {
  if (!repo) {
    if (usaFirestore()) {
      repo = repoFirestore();
    } else {
      if (!avisado) {
        avisado = true;
        console.warn(
          "[MESALISTA] Sin credenciales de Firebase: usando data/reservas.json " +
            "(configura FIREBASE_SERVICE_ACCOUNT para usar Firestore)."
        );
      }
      repo = Promise.resolve(repoJson);
    }
  }
  return repo;
}

/* ------------------------------- API ---------------------------------- */

/** Completa campos que no existían en reservas guardadas por versiones previas. */
function normalizar(reserva: Reserva): Reserva {
  return {
    ...reserva,
    estado: reserva.estado ?? "CONFIRMADA",
    email: reserva.email ?? "",
  };
}

export async function listarReservas(): Promise<Reserva[]> {
  const reservas = await (await getRepo()).listar();
  // Más recientes primero por fecha/hora de la reserva.
  return reservas
    .map(normalizar)
    .sort((a, b) => `${b.fecha} ${b.hora}`.localeCompare(`${a.fecha} ${a.hora}`));
}

export async function obtenerReserva(id: string): Promise<Reserva | null> {
  const reserva = await (await getRepo()).obtener(id);
  return reserva ? normalizar(reserva) : null;
}

export async function actualizarReserva(reserva: Reserva): Promise<void> {
  await (await getRepo()).actualizar(reserva);
}

export async function crearReserva(input: CrearReservaInput): Promise<Reserva> {
  const reserva: Reserva = {
    id: randomUUID(),
    creadaEn: new Date().toISOString(),
    estado: "CONFIRMADA",
    nombreEncargado: input.nombreEncargado,
    email: input.email,
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
    abono: input.abono,
    totalEstimado: calcularTotal(input),
  };
  await (await getRepo()).guardar(reserva);
  return reserva;
}
