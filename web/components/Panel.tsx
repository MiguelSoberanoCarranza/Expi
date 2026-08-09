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
          etiqueta="SMA rápida"
          valor={config.smaRapida}
          min={2}
          deshabilitado={corriendo}
          onCambio={(v) => onCambio({ smaRapida: Math.round(v) })}
        />
        <Campo
          etiqueta="SMA lenta"
          valor={config.smaLenta}
          min={3}
          deshabilitado={corriendo}
          onCambio={(v) => onCambio({ smaLenta: Math.round(v) })}
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
          etiqueta="Margen cruce"
          sufijo="%"
          valor={config.margenCrucePct}
          min={0}
          paso={0.05}
          deshabilitado={corriendo}
          onCambio={(v) => onCambio({ margenCrucePct: v })}
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
        Los cambios aplican con el robot en pausa. Reiniciar borra las
        operaciones y regresa el capital al monto configurado.
      </p>
    </div>
  );
}
