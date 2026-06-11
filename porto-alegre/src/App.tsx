import { useState } from "react";
import { ProveedorApp } from "./estado/contexto";
import { PantallaMesas } from "./pantallas/PantallaMesas";
import { PantallaMesa } from "./pantallas/PantallaMesa";
import { PantallaDesglose } from "./pantallas/PantallaDesglose";

type Vista =
  | { tipo: "mesas" }
  | { tipo: "mesa"; mesaId: string }
  | { tipo: "desglose"; mesaId: string };

function Navegacion() {
  const [vista, setVista] = useState<Vista>({ tipo: "mesas" });

  switch (vista.tipo) {
    case "mesas":
      return (
        <PantallaMesas
          onAbrirMesa={(mesaId) => setVista({ tipo: "mesa", mesaId })}
        />
      );
    case "mesa":
      return (
        <PantallaMesa
          mesaId={vista.mesaId}
          onVolver={() => setVista({ tipo: "mesas" })}
          onVerDesglose={() =>
            setVista({ tipo: "desglose", mesaId: vista.mesaId })
          }
        />
      );
    case "desglose":
      return (
        <PantallaDesglose
          mesaId={vista.mesaId}
          onVolver={() => setVista({ tipo: "mesa", mesaId: vista.mesaId })}
        />
      );
  }
}

export default function App() {
  return (
    <ProveedorApp>
      <Navegacion />
    </ProveedorApp>
  );
}
