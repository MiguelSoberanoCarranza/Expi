"use client";

import type { Operacion } from "@/lib/useBot";
import { cripto, fechaHora, mxn, pct } from "@/lib/formato";

export default function Historial({ operaciones }: { operaciones: Operacion[] }) {
  if (operaciones.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-10 text-center text-sm text-tinta-suave">
        Aún no hay operaciones. El robot comprará cuando detecte una señal de
        tendencia al alza.
      </div>
    );
  }

  return (
    <ul className="scroll-fino flex-1 divide-y divide-borde/60 overflow-y-auto">
      {operaciones.map((op) => {
        const esCompra = op.tipo === "compra";
        return (
          <li key={op.id} className="flex items-start gap-3 px-4 py-3">
            <span
              className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                esCompra ? "bg-verde/15 text-verde" : "bg-rojo/15 text-rojo"
              }`}
              aria-hidden
            >
              {esCompra ? "↑" : "↓"}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold">
                  {esCompra ? "Compra" : "Venta"}
                  <span className="ml-2 font-mono text-xs font-normal text-tinta-suave">
                    {fechaHora(op.fecha)}
                  </span>
                </p>
                {op.gananciaPct !== undefined && (
                  <span
                    className={`font-mono text-xs font-semibold ${
                      op.gananciaPct >= 0 ? "text-verde" : "text-rojo"
                    }`}
                  >
                    {pct(op.gananciaPct)}
                  </span>
                )}
              </div>
              <p className="truncate text-xs text-tinta-suave">{op.motivo}</p>
              <p className="mt-1 font-mono text-xs text-tinta-suave">
                {cripto(op.cripto)} BTC · {mxn(op.precio)}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
