import { useEffect, useState } from "react";

export type Tema = "claro" | "oscuro";

const CLAVE = "porto-alegre-tema";

export function temaInicial(): Tema {
  try {
    const guardado = localStorage.getItem(CLAVE);
    if (guardado === "claro" || guardado === "oscuro") return guardado;
  } catch {
    /* storage bloqueado */
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "oscuro"
    : "claro";
}

function aplicarTema(tema: Tema): void {
  document.documentElement.classList.toggle("dark", tema === "oscuro");
}

export function useTema(): [Tema, () => void] {
  const [tema, setTema] = useState<Tema>(temaInicial);

  useEffect(() => {
    aplicarTema(tema);
    try {
      localStorage.setItem(CLAVE, tema);
    } catch {
      /* storage bloqueado */
    }
  }, [tema]);

  return [tema, () => setTema((t) => (t === "claro" ? "oscuro" : "claro"))];
}
