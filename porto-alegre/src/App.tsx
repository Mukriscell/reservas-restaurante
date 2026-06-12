import { useState } from "react";
import { ProveedorApp } from "./estado/contexto";
import { PantallaMesas } from "./pantallas/PantallaMesas";
import { PantallaMesa } from "./pantallas/PantallaMesa";
import { PantallaDesglose } from "./pantallas/PantallaDesglose";
import { PantallaHistorial } from "./pantallas/PantallaHistorial";
import { SelectorGarzon } from "./componentes/SelectorGarzon";
import { Aviso } from "./componentes/Aviso";

type Vista =
  | { tipo: "mesas" }
  | { tipo: "mesa"; mesaId: string }
  | { tipo: "historial" }
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
          onCambiarGarzon={() => setSelectorAbierto(true)}
        />
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

export default function App() {
  return (
    <ProveedorApp>
      <Navegacion />
      <Aviso />
    </ProveedorApp>
  );
}
