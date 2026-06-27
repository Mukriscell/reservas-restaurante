import { Moon, Sun } from "lucide-react";
import { useTema } from "../util/tema";

/** Alterna entre Light Mode y Dark Mode. */
export function BotonTema() {
  const [tema, alternar] = useTema();
  return (
    <button
      onClick={alternar}
      aria-label={tema === "claro" ? "Cambiar a modo oscuro" : "Cambiar a modo claro"}
      className="btn btn-borde btn-icono"
    >
      {tema === "claro" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
    </button>
  );
}
