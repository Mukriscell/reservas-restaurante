import { Martini } from "lucide-react";
import { useEstadoApp } from "../estado/contexto";
import { TarjetaMesa } from "../componentes/TarjetaMesa";

/** Pantalla principal: las 100 mesas con número, estado y total. */
export function PantallaMesas({
  onAbrirMesa,
}: {
  onAbrirMesa: (mesaId: string) => void;
}) {
  const { mesas } = useEstadoApp();

  return (
    <div className="mx-auto max-w-3xl px-3 pb-8">
      <header className="sticky top-0 z-10 -mx-3 mb-3 border-b border-stone-800 bg-stone-950/95 px-3 py-3 backdrop-blur">
        <h1 className="flex items-center gap-2 text-lg font-bold tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-600 text-white">
            <Martini className="h-4 w-4" />
          </span>
          Porto Alegre · Mesas
        </h1>
        <p className="mt-1.5 flex gap-4 text-xs text-stone-400">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
            Pendiente
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            Pagada
          </span>
        </p>
      </header>

      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
        {mesas.map((mesa) => (
          <TarjetaMesa key={mesa.id} mesa={mesa} onAbrir={onAbrirMesa} />
        ))}
      </div>
    </div>
  );
}
