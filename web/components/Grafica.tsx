"use client";

import {
  Area,
  ComposedChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PuntoGrafica } from "@/lib/useBot";
import { hora, mxnCompacto } from "@/lib/formato";

function PuntoOperacion(props: {
  cx?: number;
  cy?: number;
  value?: number | null;
  color: string;
}) {
  const { cx, cy, value, color } = props;
  if (value == null || cx == null || cy == null) return <g />;
  return (
    <g>
      <circle cx={cx} cy={cy} r={9} fill={color} opacity={0.25} />
      <circle cx={cx} cy={cy} r={4.5} fill={color} stroke="#05080f" strokeWidth={1.5} />
    </g>
  );
}

interface TooltipPayload {
  dataKey?: string | number;
  value?: number | string | Array<number | string>;
}

function TooltipPersonalizado({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: number | string;
}) {
  if (!active || !payload?.length) return null;
  const porClave = new Map(payload.map((p) => [p.dataKey, p.value]));
  const precio = porClave.get("precio");
  const smaR = porClave.get("smaRapida");
  const smaL = porClave.get("smaLenta");
  return (
    <div className="tarjeta px-3 py-2 text-xs shadow-xl">
      <p className="text-tinta-suave mb-1">{typeof label === "number" ? hora(label) : label}</p>
      {typeof precio === "number" && (
        <p className="font-mono text-tinta font-medium">{mxnCompacto(precio)}</p>
      )}
      {typeof smaR === "number" && (
        <p className="font-mono text-cian">SMA rápida · {mxnCompacto(smaR)}</p>
      )}
      {typeof smaL === "number" && (
        <p className="font-mono text-ambar">SMA lenta · {mxnCompacto(smaL)}</p>
      )}
    </div>
  );
}

export default function Grafica({ puntos }: { puntos: PuntoGrafica[] }) {
  if (puntos.length < 2) {
    return (
      <div className="flex h-full min-h-[280px] items-center justify-center text-sm text-tinta-suave">
        La gráfica aparecerá en cuanto el robot empiece a leer el mercado…
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%" minHeight={280}>
      <ComposedChart data={puntos} margin={{ top: 10, right: 8, bottom: 0, left: 8 }}>
        <defs>
          <linearGradient id="gradPrecio" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4cc3ff" stopOpacity={0.28} />
            <stop offset="100%" stopColor="#4cc3ff" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#1c2740" strokeDasharray="3 6" vertical={false} />
        <XAxis
          dataKey="t"
          tickFormatter={(t: number) => hora(t)}
          tick={{ fill: "#8b98b4", fontSize: 11 }}
          axisLine={{ stroke: "#1c2740" }}
          tickLine={false}
          minTickGap={64}
        />
        <YAxis
          domain={["auto", "auto"]}
          tickFormatter={(v: number) => mxnCompacto(v)}
          tick={{ fill: "#8b98b4", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={92}
        />
        <Tooltip content={<TooltipPersonalizado />} />
        <Area
          type="monotone"
          dataKey="precio"
          stroke="#4cc3ff"
          strokeWidth={2}
          fill="url(#gradPrecio)"
          isAnimationActive={false}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="smaRapida"
          stroke="#2ee6a8"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          dot={false}
          isAnimationActive={false}
          connectNulls
        />
        <Line
          type="monotone"
          dataKey="smaLenta"
          stroke="#ffc457"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          dot={false}
          isAnimationActive={false}
          connectNulls
        />
        <Line
          type="monotone"
          dataKey="compra"
          stroke="none"
          isAnimationActive={false}
          dot={(p) => (
            <PuntoOperacion key={`c-${p.index}`} cx={p.cx} cy={p.cy} value={p.value} color="#2ee6a8" />
          )}
        />
        <Line
          type="monotone"
          dataKey="venta"
          stroke="none"
          isAnimationActive={false}
          dot={(p) => (
            <PuntoOperacion key={`v-${p.index}`} cx={p.cx} cy={p.cy} value={p.value} color="#ff5c7a" />
          )}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
