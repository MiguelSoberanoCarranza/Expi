"use client";

import type { Config } from "@/lib/strategy";

interface CampoProps {
  etiqueta: string;
  sufijo?: string;
  valor: number;
  min?: number;
  paso?: number;
  deshabilitado: boolean;
  onCambio: (v: number) => void;
}

function Campo({ etiqueta, sufijo, valor, min = 0, paso = 1, deshabilitado, onCambio }: CampoProps) {
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline justify-between text-[11px] uppercase tracking-wide text-tinta-suave">
        {etiqueta}
        {sufijo && <span className="normal-case">{sufijo}</span>}
      </span>
      <input
        type="number"
        className="campo font-mono"
        value={valor}
        min={min}
        step={paso}
        disabled={deshabilitado}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!Number.isNaN(v)) onCambio(v);
        }}
      />
    </label>
  );
}

export default function Panel({
  config,
  corriendo,
  onCambio,
  onReiniciar,
}: {
  config: Config;
  corriendo: boolean;
  onCambio: (cambios: Partial<Config>) => void;
  onReiniciar: () => void;
}) {
  return (
    <div className="space-y-4 p-4">
      <label className="block">
        <span className="mb-1 flex items-baseline justify-between text-[11px] uppercase tracking-wide text-tinta-suave">
          Estrategia
        </span>
        <select
          className="campo font-mono"
          value={config.estrategia}
          disabled={corriendo}
          onChange={(e) =>
            onCambio({
              estrategia: e.target.value as Config["estrategia"],
            })
          }
        >
          <option value="ensemble">Ensemble (recomendado)</option>
          <option value="macd">MACD</option>
          <option value="sma">SMA + RSI</option>
          <option value="momentum">Momentum</option>
          <option value="bollinger">Bollinger</option>
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <Campo
          etiqueta="Capital"
          sufijo="MXN"
          valor={config.capitalInicial}
          min={50}
          paso={50}
          deshabilitado={corriendo}
          onCambio={(v) => onCambio({ capitalInicial: v })}
        />
        <Campo
          etiqueta="Vela"
          sufijo="seg"
          valor={config.velaSegundos}
          min={5}
          paso={5}
          deshabilitado={corriendo}
          onCambio={(v) => onCambio({ velaSegundos: v })}
        />
        <Campo
          etiqueta="Stop-loss"
          sufijo="%"
          valor={config.stopLossPct}
          min={0.5}
          paso={0.5}
          deshabilitado={corriendo}
          onCambio={(v) => onCambio({ stopLossPct: v })}
        />
        <Campo
          etiqueta="Take-profit"
          sufijo="%"
          valor={config.takeProfitPct}
          min={0.5}
          paso={0.5}
          deshabilitado={corriendo}
          onCambio={(v) => onCambio({ takeProfitPct: v })}
        />
        <Campo
          etiqueta="Votos mínimos"
          valor={config.votosMinimos}
          min={1}
          deshabilitado={corriendo}
          onCambio={(v) => onCambio({ votosMinimos: Math.round(v) })}
        />
        <Campo
          etiqueta="Comisión"
          sufijo="%"
          valor={config.comisionPct}
          min={0}
          paso={0.05}
          deshabilitado={corriendo}
          onCambio={(v) => onCambio({ comisionPct: v })}
        />
      </div>
      <button
        onClick={onReiniciar}
        disabled={corriendo}
        className="w-full rounded-lg border border-borde bg-panel px-3 py-2 text-xs font-semibold text-tinta-suave transition hover:border-rojo/60 hover:text-rojo disabled:cursor-not-allowed disabled:opacity-40"
      >
        Reiniciar portafolio
      </button>
      <p className="text-[11px] leading-relaxed text-tinta-suave">
        El ensemble combina MACD, SMA, momentum y Bollinger con voto
        ponderado. Los cambios aplican en pausa; reiniciar borra el historial.
      </p>
    </div>
  );
}
