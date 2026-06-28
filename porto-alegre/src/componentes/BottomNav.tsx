import { History, LayoutGrid, ScrollText, TrendingUp, type LucideIcon } from "lucide-react";

type Clave = "mesas" | "historial" | "auditoria" | "dashboard";

/** Barra de navegación inferior del panel (estilo POS). */
export function BottomNav({
  activo,
  esAdmin,
  onIr,
}: {
  activo: string;
  esAdmin: boolean;
  onIr: (clave: Clave) => void;
}) {
  const items: { clave: Clave; etiqueta: string; Icono: LucideIcon }[] = [
    { clave: "mesas", etiqueta: "Mesas", Icono: LayoutGrid },
    { clave: "historial", etiqueta: "Historial", Icono: History },
    { clave: "auditoria", etiqueta: "Auditoría", Icono: ScrollText },
    ...(esAdmin
      ? [{ clave: "dashboard" as const, etiqueta: "Propinas", Icono: TrendingUp }]
      : []),
  ];
  return (
    <nav className="nav-inferior">
      {items.map(({ clave, etiqueta, Icono }) => {
        const on = activo === clave;
        return (
          <button
            key={clave}
            onClick={() => onIr(clave)}
            aria-current={on ? "page" : undefined}
            className={`nav-item ${on ? "nav-item-activo" : "nav-item-inactivo"}`}
          >
            <Icono className="h-5 w-5" />
            {etiqueta}
          </button>
        );
      })}
    </nav>
  );
}
