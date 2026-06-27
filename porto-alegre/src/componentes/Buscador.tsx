import { Search, X } from "lucide-react";

/** Barra de búsqueda de productos, siempre visible, con filtrado en vivo. */
export function Buscador({
  valor,
  onCambiar,
}: {
  valor: string;
  onCambiar: (valor: string) => void;
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
      <input
        type="search"
        inputMode="search"
        placeholder="Buscar en la carta… (ej: moji)"
        aria-label="Buscar producto"
        className="input !pl-11 pr-10"
        value={valor}
        onChange={(e) => onCambiar(e.target.value)}
      />
      {valor !== "" && (
        <button
          onClick={() => onCambiar("")}
          aria-label="Limpiar búsqueda"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
