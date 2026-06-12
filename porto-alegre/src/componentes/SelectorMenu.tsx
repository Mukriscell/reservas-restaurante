import { Minus, Plus, UtensilsCrossed } from "lucide-react";
import type { MenuMesa } from "../tipos";
import {
  MENUS,
  PRECIO_NINO_3_5,
  PRECIO_NINO_6_11,
  getMenuBuffet,
  totalMenu,
  type MenuId,
} from "../data/menus";
import { formatCLP } from "../util/dinero";

function Contador({
  etiqueta,
  detalle,
  valor,
  onCambiar,
}: {
  etiqueta: string;
  detalle: string;
  valor: number;
  onCambiar: (valor: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="text-sm font-medium">{etiqueta}</p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{detalle}</p>
      </div>
      <div className="flex items-center rounded-xl border border-zinc-300 dark:border-white/15">
        <button
          onClick={() => onCambiar(Math.max(valor - 1, 0))}
          disabled={valor === 0}
          aria-label={`Quitar ${etiqueta}`}
          className="px-2.5 py-2.5 text-zinc-600 disabled:opacity-30 dark:text-zinc-300"
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="min-w-7 text-center text-sm font-bold">{valor}</span>
        <button
          onClick={() => onCambiar(Math.min(valor + 1, 99))}
          aria-label={`Agregar ${etiqueta}`}
          className="px-2.5 py-2.5 text-zinc-600 dark:text-zinc-300"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/**
 * Menú buffet de la mesa: menú elegido por los adultos y cantidades de
 * personas, con el mismo desglose de precios que la app de reservas.
 */
export function SelectorMenu({
  menu,
  bloqueada,
  onFijar,
}: {
  menu: MenuMesa | null;
  bloqueada: boolean;
  onFijar: (menu: MenuMesa | null) => void;
}) {
  if (bloqueada) {
    return (
      <section className="tarjeta p-4">
        <h2 className="flex items-center gap-2 text-sm font-bold text-verde-700 dark:text-verde-400">
          <UtensilsCrossed className="h-4 w-4" /> Menú buffet
        </h2>
        {menu ? (
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            {getMenuBuffet(menu.menuId).nombre} — {menu.adultos} adultos,{" "}
            {menu.ninos6a11} niños (6-11), {menu.ninos3a5} niños (3-5) ·{" "}
            <span className="font-bold text-verde-700 dark:text-amarillo-400">
              {formatCLP(totalMenu(menu))}
            </span>
          </p>
        ) : (
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Sin menú asignado.
          </p>
        )}
      </section>
    );
  }

  const fijar = (cambios: Partial<MenuMesa>) => {
    if (!menu) return;
    onFijar({ ...menu, ...cambios });
  };

  return (
    <section className="tarjeta p-4">
      <h2 className="flex items-center gap-2 text-sm font-bold text-verde-700 dark:text-verde-400">
        <UtensilsCrossed className="h-4 w-4" /> Menú buffet (por persona)
      </h2>

      <select
        aria-label="Menú elegido por los adultos"
        className="input mt-3"
        value={menu?.menuId ?? ""}
        onChange={(e) => {
          const id = e.target.value as MenuId | "";
          if (id === "") {
            onFijar(null);
          } else {
            onFijar({
              menuId: id,
              adultos: menu?.adultos ?? 0,
              ninos6a11: menu?.ninos6a11 ?? 0,
              ninos3a5: menu?.ninos3a5 ?? 0,
            });
          }
        }}
      >
        <option value="">Sin menú</option>
        {MENUS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.nombre} — {formatCLP(m.precioAdulto)}
          </option>
        ))}
      </select>

      {menu && (
        <div className="mt-4 space-y-3">
          <Contador
            etiqueta="Adultos"
            detalle={`${formatCLP(getMenuBuffet(menu.menuId).precioAdulto)} c/u (desde 12 años)`}
            valor={menu.adultos}
            onCambiar={(v) => fijar({ adultos: v })}
          />
          <Contador
            etiqueta="Niños 6–11 años"
            detalle={`${formatCLP(PRECIO_NINO_6_11)} c/u`}
            valor={menu.ninos6a11}
            onCambiar={(v) => fijar({ ninos6a11: v })}
          />
          <Contador
            etiqueta="Niños 3–5 años"
            detalle={`${formatCLP(PRECIO_NINO_3_5)} c/u (menores de 3 no pagan)`}
            valor={menu.ninos3a5}
            onCambiar={(v) => fijar({ ninos3a5: v })}
          />
          <p className="flex justify-between border-t border-zinc-200 pt-3 text-sm dark:border-white/10">
            <span className="text-zinc-500 dark:text-zinc-400">Subtotal menú</span>
            <span className="font-bold text-verde-700 dark:text-amarillo-400">
              {formatCLP(totalMenu(menu))}
            </span>
          </p>
        </div>
      )}
    </section>
  );
}
