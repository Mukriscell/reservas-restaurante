import { useEffect } from "react";
import { CheckCircle2, TriangleAlert, X } from "lucide-react";
import { useAviso } from "../estado/contexto";

/** Notificación flotante (p. ej. "La mesa ya fue cerrada por otro garzón"). */
export function Aviso() {
  const { aviso, cerrarAviso } = useAviso();

  useEffect(() => {
    if (!aviso) return;
    const timer = setTimeout(cerrarAviso, 5000);
    return () => clearTimeout(timer);
  }, [aviso, cerrarAviso]);

  if (!aviso) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <div
        role="status"
        className="pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl bg-azul-900 px-4 py-3 text-sm font-medium text-white shadow-lg dark:bg-azul-800"
      >
        {aviso.tono === "error" ? (
          <TriangleAlert className="h-5 w-5 shrink-0 text-amarillo-400" />
        ) : (
          <CheckCircle2 className="h-5 w-5 shrink-0 text-verde-400" />
        )}
        <span>{aviso.texto}</span>
        <button
          onClick={cerrarAviso}
          aria-label="Cerrar aviso"
          className="rounded-full p-1 text-white/70 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
