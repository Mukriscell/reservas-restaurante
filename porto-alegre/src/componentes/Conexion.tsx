import { useConexion } from "../estado/contexto";

const ESTILOS = {
  local: {
    texto: "Modo local",
    clase: "bg-zinc-200 text-zinc-600 dark:bg-white/10 dark:text-zinc-300",
    punto: "bg-zinc-500",
  },
  conectando: {
    texto: "Conectando…",
    clase: "bg-amarillo-100 text-amarillo-800 dark:bg-amarillo-400/15 dark:text-amarillo-300",
    punto: "bg-amarillo-500 animate-pulse",
  },
  online: {
    texto: "Sincronizado",
    clase: "bg-verde-100 text-verde-800 dark:bg-verde-500/15 dark:text-verde-300",
    punto: "bg-verde-600 dark:bg-verde-400",
  },
  offline: {
    texto: "Sin conexión",
    clase: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
    punto: "bg-red-500",
  },
} as const;

/** Estado de sincronización entre los dispositivos de los garzones. */
export function PillConexion() {
  const conexion = useConexion();
  const estilo = ESTILOS[conexion];
  return (
    <span className={`pill ${estilo.clase}`} title="Estado de sincronización">
      <span className={`h-2 w-2 rounded-full ${estilo.punto}`} />
      {estilo.texto}
    </span>
  );
}
