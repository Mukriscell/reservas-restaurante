import { useState, type FormEvent } from "react";
import {
  ArrowLeft,
  KeyRound,
  LogIn,
  MailCheck,
  Martini,
  UserRoundPlus,
} from "lucide-react";
import { useAcciones, useAuth } from "../estado/contexto";
import { BotonTema } from "../componentes/BotonTema";

type Modo = "login" | "registro" | "recuperar" | "nueva";

const CAMPO = "input";

function Campo({
  etiqueta,
  ...props
}: { etiqueta: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        {etiqueta}
      </span>
      <input {...props} className={CAMPO} />
    </label>
  );
}

/**
 * Acceso de meseros (modo compartido): login con correo y contraseña,
 * registro (nombre completo + correo + contraseña, teléfono opcional),
 * recuperación de contraseña y definición de una nueva al volver del
 * enlace. Sin sesión activa no se entra a la aplicación.
 */
export function PantallaAcceso({ modoInicial = "login" }: { modoInicial?: Modo }) {
  const acciones = useAcciones();
  const { terminarRecuperacion } = useAuth();
  const [modo, setModo] = useState<Modo>(modoInicial);
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [telefono, setTelefono] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [avisoOk, setAvisoOk] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  function cambiarModo(nuevo: Modo) {
    setModo(nuevo);
    setError(null);
    setAvisoOk(null);
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (ocupado) return;
    setOcupado(true);
    setError(null);
    setAvisoOk(null);
    try {
      if (modo === "login") {
        const err = await acciones.iniciarSesion(email, contrasena);
        if (err) setError(err);
        // Con sesión, el guardián de App pasa directo al panel.
      } else if (modo === "registro") {
        const r = await acciones.registrarse(nombre, email, contrasena, telefono);
        if (r.error) {
          setError(r.error);
        } else if (r.requiereConfirmacion) {
          cambiarModo("login");
          setAvisoOk(
            "Cuenta creada: revisa tu correo y confirma para poder iniciar sesión."
          );
        }
      } else if (modo === "recuperar") {
        const err = await acciones.recuperarContrasena(email);
        if (err) setError(err);
        else {
          setAvisoOk(
            "Si el correo existe, te enviamos un enlace para crear una contraseña nueva."
          );
        }
      } else {
        const err = await acciones.actualizarContrasena(contrasena);
        if (err) setError(err);
        else terminarRecuperacion();
      }
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-gradient-to-b from-verde-50 via-white to-white px-3 py-8 dark:from-verde-950 dark:via-azul-950 dark:to-azul-950">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/4 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-verde-500/20 blur-3xl dark:bg-verde-500/25"
      />
      <div className="relative w-full max-w-sm">
        <div className="mb-5 flex items-center justify-center gap-3">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-verde-500 to-verde-600 text-white shadow-glow-boton">
            <Martini className="h-7 w-7" />
          </span>
          <div>
            <h1 className="text-2xl font-black leading-none tracking-tight">
              PORTO{" "}
              <span className="text-verde-700 dark:text-amarillo-400">ALEGRE</span>
            </h1>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
              Restobar · Acceso de meseros
            </p>
          </div>
          <BotonTema />
        </div>

        <form onSubmit={(e) => void enviar(e)} className="glass animate-subir space-y-4 p-6">
          <h2 className="flex items-center gap-2 text-lg font-black tracking-tight">
            {modo === "login" && (
              <>
                <LogIn className="h-5 w-5 text-verde-700 dark:text-amarillo-400" />
                Iniciar sesión
              </>
            )}
            {modo === "registro" && (
              <>
                <UserRoundPlus className="h-5 w-5 text-verde-700 dark:text-amarillo-400" />
                Crear cuenta de mesero
              </>
            )}
            {modo === "recuperar" && (
              <>
                <KeyRound className="h-5 w-5 text-verde-700 dark:text-amarillo-400" />
                Recuperar contraseña
              </>
            )}
            {modo === "nueva" && (
              <>
                <KeyRound className="h-5 w-5 text-verde-700 dark:text-amarillo-400" />
                Nueva contraseña
              </>
            )}
          </h2>

          {modo === "registro" && (
            <>
              <Campo
                etiqueta="Nombre completo"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Juan Pérez Soto"
                autoComplete="name"
                required
              />
              <Campo
                etiqueta="Teléfono (opcional)"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="+56 9 1234 5678"
                autoComplete="tel"
                inputMode="tel"
              />
            </>
          )}

          {modo !== "nueva" && (
            <Campo
              etiqueta="Correo electrónico"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="juan.perez@correo.cl"
              autoComplete="email"
              required
            />
          )}

          {modo !== "recuperar" && (
            <Campo
              etiqueta={modo === "nueva" ? "Contraseña nueva" : "Contraseña"}
              type="password"
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
              placeholder="••••••••"
              autoComplete={modo === "login" ? "current-password" : "new-password"}
              minLength={6}
              required
            />
          )}

          {error && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </p>
          )}
          {avisoOk && (
            <p className="flex items-start gap-2 rounded-xl bg-verde-50 px-3 py-2 text-sm font-semibold text-verde-800 dark:bg-verde-500/10 dark:text-verde-300">
              <MailCheck className="mt-0.5 h-4 w-4 shrink-0" /> {avisoOk}
            </p>
          )}

          <button
            type="submit"
            disabled={ocupado}
            className="btn btn-neon w-full text-base disabled:opacity-50"
          >
            {ocupado
              ? "Un momento…"
              : modo === "login"
                ? "Entrar"
                : modo === "registro"
                  ? "Registrarme"
                  : modo === "recuperar"
                    ? "Enviar enlace"
                    : "Guardar contraseña"}
          </button>

          {modo === "login" && (
            <div className="flex flex-col gap-1 pt-1 text-center text-sm">
              <button
                type="button"
                onClick={() => cambiarModo("registro")}
                className="font-bold text-verde-700 hover:underline dark:text-amarillo-400"
              >
                ¿Primera vez? Crea tu cuenta de mesero
              </button>
              <button
                type="button"
                onClick={() => cambiarModo("recuperar")}
                className="text-zinc-500 hover:underline dark:text-zinc-400"
              >
                Olvidé mi contraseña
              </button>
            </div>
          )}
          {(modo === "registro" || modo === "recuperar") && (
            <button
              type="button"
              onClick={() => cambiarModo("login")}
              className="mx-auto flex items-center gap-1 pt-1 text-sm text-zinc-500 hover:underline dark:text-zinc-400"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Volver a iniciar sesión
            </button>
          )}
        </form>

        <p className="mt-4 text-center text-xs text-zinc-400 dark:text-zinc-500">
          Cada mesero trabaja con su propia sesión: las acciones quedan
          registradas a su nombre en la auditoría.
        </p>
      </div>
    </div>
  );
}
