import { useState, type ReactNode } from "react";
import { Martini, ShieldOff } from "lucide-react";
import {
  ProveedorApp,
  useAcciones,
  useAuth,
  useGarzonActual,
} from "./estado/contexto";
import { MODO_COMPARTIDO } from "./sync/supabase";
import { PantallaMesas } from "./pantallas/PantallaMesas";
import { PantallaMesa } from "./pantallas/PantallaMesa";
import { PantallaDesglose } from "./pantallas/PantallaDesglose";
import { PantallaHistorial } from "./pantallas/PantallaHistorial";
import { PantallaAuditoria } from "./pantallas/PantallaAuditoria";
import { PantallaAcceso } from "./pantallas/PantallaAcceso";
import { SelectorGarzon } from "./componentes/SelectorGarzon";
import { Aviso } from "./componentes/Aviso";

type Vista =
  | { tipo: "mesas" }
  | { tipo: "mesa"; mesaId: string }
  | { tipo: "historial" }
  | { tipo: "auditoria" }
  | {
      tipo: "desglose";
      atencionId: string;
      // A dónde vuelve la flecha: a la mesa o al historial.
      desde: { tipo: "mesa"; mesaId: string } | { tipo: "historial" };
    };

function Navegacion() {
  const [vista, setVista] = useState<Vista>({ tipo: "mesas" });
  // Última mesa abierta: se destaca en azul en la grilla.
  const [seleccionadaId, setSeleccionadaId] = useState<string | null>(null);
  const [selectorAbierto, setSelectorAbierto] = useState(false);

  return (
    <>
      {vista.tipo === "mesas" && (
        <PantallaMesas
          seleccionadaId={seleccionadaId}
          onAbrirMesa={(mesaId) => {
            setSeleccionadaId(mesaId);
            setVista({ tipo: "mesa", mesaId });
          }}
          onVerHistorial={() => setVista({ tipo: "historial" })}
          onVerAuditoria={() => setVista({ tipo: "auditoria" })}
          onCambiarGarzon={() => setSelectorAbierto(true)}
        />
      )}

      {vista.tipo === "auditoria" && (
        <PantallaAuditoria onVolver={() => setVista({ tipo: "mesas" })} />
      )}

      {vista.tipo === "mesa" && (
        <PantallaMesa
          mesaId={vista.mesaId}
          onVolver={() => setVista({ tipo: "mesas" })}
          onVerDesglose={(atencionId) =>
            setVista({
              tipo: "desglose",
              atencionId,
              desde: { tipo: "mesa", mesaId: vista.mesaId },
            })
          }
        />
      )}

      {vista.tipo === "historial" && (
        <PantallaHistorial
          onVolver={() => setVista({ tipo: "mesas" })}
          onVerDesglose={(atencionId) =>
            setVista({ tipo: "desglose", atencionId, desde: { tipo: "historial" } })
          }
        />
      )}

      {vista.tipo === "desglose" && (
        <PantallaDesglose
          atencionId={vista.atencionId}
          onVolver={() => setVista(vista.desde)}
        />
      )}

      <SelectorGarzon
        abierto={selectorAbierto}
        onCerrar={() => setSelectorAbierto(false)}
      />
    </>
  );
}

function PantallaCargandoSesion() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3">
      <span className="flex h-14 w-14 animate-pulse items-center justify-center rounded-2xl bg-verde-600 text-white shadow-suave">
        <Martini className="h-7 w-7" />
      </span>
      <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">
        Restaurando tu sesión…
      </p>
    </div>
  );
}

function PantallaDesactivado() {
  const acciones = useAcciones();
  return (
    <div className="flex min-h-dvh items-center justify-center px-3">
      <div className="tarjeta max-w-sm p-6 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400">
          <ShieldOff className="h-7 w-7" />
        </span>
        <h1 className="mt-3 text-lg font-black tracking-tight">
          Cuenta desactivada
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Tu cuenta fue desactivada por el administrador: no puedes operar
          mesas ni ver información del restobar.
        </p>
        <button
          onClick={() => void acciones.cerrarSesion()}
          className="btn btn-borde mt-4 w-full"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}

/**
 * Protección de rutas (modo compartido): sin sesión activa solo se ve
 * el acceso; con sesión, el panel. El enlace de recuperación lleva a
 * definir la contraseña nueva, y una cuenta desactivada queda fuera.
 */
function Compuerta({ children }: { children: ReactNode }) {
  const { cargando, userId, recuperando } = useAuth();
  const { garzon } = useGarzonActual();

  if (!MODO_COMPARTIDO) return <>{children}</>;
  if (recuperando) return <PantallaAcceso modoInicial="nueva" />;
  if (cargando) return <PantallaCargandoSesion />;
  if (!userId) return <PantallaAcceso />;
  if (garzon && !garzon.activo) return <PantallaDesactivado />;
  return <>{children}</>;
}

export default function App() {
  return (
    <ProveedorApp>
      <Compuerta>
        <Navegacion />
      </Compuerta>
      <Aviso />
    </ProveedorApp>
  );
}
