const formato = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
});

/** Pesos chilenos: 7600 → "$7.600". */
export function formatCLP(monto: number): string {
  return formato.format(monto);
}
