const fmtMxn = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
});

const fmtMxnEntero = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

export function mxn(v: number): string {
  return fmtMxn.format(v);
}

export function mxnCompacto(v: number): string {
  return v >= 10000 ? fmtMxnEntero.format(v) : fmtMxn.format(v);
}

export function pct(v: number, decimales = 2): string {
  const signo = v > 0 ? "+" : "";
  return `${signo}${v.toFixed(decimales)}%`;
}

export function hora(t: number): string {
  return new Date(t).toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function fechaHora(t: number): string {
  return new Date(t).toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function cripto(v: number): string {
  return v.toFixed(8);
}
