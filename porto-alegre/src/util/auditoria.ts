import type { AccionAuditoria, RegistroAuditoria } from "../tipos";
import { formatCLP } from "./dinero";

/** Etiquetas legibles por acción (para filtros y pills). */
export const ETIQUETAS_ACCION: Record<AccionAuditoria, string> = {
  APERTURA_MESA: "Apertura de mesa",
  AGREGAR_PRODUCTO: "Agregar producto",
  ELIMINAR_PRODUCTO: "Eliminar producto",
  MODIFICAR_CANTIDAD: "Modificar cantidad",
  FIJAR_MENU: "Fijar menú",
  REGISTRAR_ABONO: "Registrar abono",
  ELIMINAR_ABONO: "Eliminar abono",
  TRANSFERENCIA_MESA: "Transferencia de mesa",
  CIERRE_MESA: "Cierre de mesa",
  REAPERTURA_MESA: "Reapertura de mesa",
  GENERAR_PRECUENTA: "Generar precuenta",
  LOGIN: "Login",
  LOGOUT: "Logout",
  CREACION_USUARIO: "Creación de usuario",
  MODIFICACION_USUARIO: "Modificación de usuario",
  DESACTIVACION_USUARIO: "Desactivación de usuario",
  REGISTRO_USUARIO: "Registro de usuario",
  INICIO_SESION: "Inicio de sesión",
  CIERRE_SESION: "Cierre de sesión",
};

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function texto(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/**
 * Descripción humana del registro, al estilo de los ejemplos del
 * requerimiento: "2 x Heineken", "$20.000", "Total $64.000 …".
 */
export function descripcionAuditoria(r: RegistroAuditoria): string {
  const va = r.valorAnterior ?? {};
  const vn = r.valorNuevo ?? {};
  switch (r.accion) {
    case "APERTURA_MESA": {
      const n = num(vn["atencion"]);
      return n ? `Atención #${n} abierta` : "Atención abierta";
    }
    case "AGREGAR_PRODUCTO":
      return `${num(vn["cantidad"]) ?? 1} x ${texto(vn["producto"])}`;
    case "ELIMINAR_PRODUCTO":
      return `${num(va["cantidad"]) ?? 1} x ${texto(va["producto"])} eliminado`;
    case "MODIFICAR_CANTIDAD": {
      const producto = texto(vn["producto"]) || r.observacion;
      return `${producto}: ${num(va["cantidad"]) ?? "?"} → ${num(vn["cantidad"]) ?? "?"}`;
    }
    case "FIJAR_MENU": {
      const menu = texto(vn["menu"]);
      const total = num(vn["totalMenu"]);
      return menu
        ? `Menú ${menu}${total !== null ? ` (${formatCLP(total)})` : ""}`
        : "Menú quitado";
    }
    case "REGISTRAR_ABONO": {
      const monto = num(vn["monto"]);
      const obs = texto(vn["observacion"]);
      return `${monto !== null ? formatCLP(monto) : ""}${obs ? ` · ${obs}` : ""}`;
    }
    case "ELIMINAR_ABONO": {
      const monto = num(va["monto"]);
      return `${monto !== null ? formatCLP(monto) : "Abono"} eliminado`;
    }
    case "TRANSFERENCIA_MESA":
      return `${texto(va["garzon"])} → ${texto(vn["garzon"])}`;
    case "CIERRE_MESA": {
      const total = num(vn["total"]);
      const abonos = num(vn["abonos"]);
      const saldo = num(vn["saldo"]);
      const partes = [];
      if (total !== null) partes.push(`Total ${formatCLP(total)}`);
      if (abonos) partes.push(`Abonos ${formatCLP(abonos)}`);
      if (saldo !== null) partes.push(`Saldo ${formatCLP(saldo)}`);
      return partes.join(" · ");
    }
    case "REAPERTURA_MESA":
      return "Cuenta reabierta";
    case "GENERAR_PRECUENTA": {
      const saldo = num(vn["saldo"]);
      return saldo !== null ? `Saldo ${formatCLP(saldo)}` : "Precuenta emitida";
    }
    case "LOGIN":
    case "INICIO_SESION":
      return "Inicio de sesión en el dispositivo";
    case "LOGOUT":
    case "CIERRE_SESION":
      return "Cierre de sesión en el dispositivo";
    case "REGISTRO_USUARIO": {
      const correo = texto(vn["email"]);
      return `${texto(vn["nombre"])}${correo ? ` (${correo})` : ""} se registró`;
    }
    case "CREACION_USUARIO":
      return texto(vn["nombre"]);
    case "MODIFICACION_USUARIO": {
      const antes = texto(va["nombre"]);
      const despues = texto(vn["nombre"]);
      const rolAntes = texto(va["rol"]);
      const rolDespues = texto(vn["rol"]);
      const partes = [];
      if (antes && despues && antes !== despues) partes.push(`${antes} → ${despues}`);
      else if (despues) partes.push(despues);
      if (rolAntes && rolDespues && rolAntes !== rolDespues) {
        partes.push(`rol ${rolAntes} → ${rolDespues}`);
      }
      return partes.join(" · ") || r.observacion;
    }
    case "DESACTIVACION_USUARIO":
      return `${texto(vn["nombre"])} desactivado`;
  }
}
