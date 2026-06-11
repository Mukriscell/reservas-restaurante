import { Search, X } from "lucide-react";

/** Barra de búsqueda de productos con filtrado en tiempo real. */
export function Buscador({
  valor,
  onCambiar,
}: {
  valor: string;
  onCambiar: (valor: string) => void;
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500" />
      <input
        type="search"
        inputMode="search"
        placeholder="Buscar producto… (ej: moji)"
        aria-label="Buscar producto"
        className="w-full rounded-xl border border-stone-700 bg-stone-900 py-2.5 pl-9 pr-9 text-sm text-stone-100 placeholder:text-stone-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
        value={valor}
        onChange={(e) => onCambiar(e.target.value)}
      />
      {valor !== "" && (
        <button
          onClick={() => onCambiar("")}
          aria-label="Limpiar búsqueda"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-stone-400 hover:text-stone-200"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
