// Estrategia de trading: cruce de medias móviles (SMA) con filtro RSI,
// histéresis anti-latigazo y gestión de riesgo por stop-loss / take-profit.
// Es el mismo algoritmo que corre el bot de Python del repositorio.

export interface Config {
  book: string;
  capitalInicial: number;
  velaSegundos: number;
  pollSegundos: number;
  smaRapida: number;
  smaLenta: number;
  rsiPeriodo: number;
  rsiSobrecompra: number;
  margenCrucePct: number;
  stopLossPct: number;
  takeProfitPct: number;
  comisionPct: number;
}

export const CONFIG_DEFAULT: Config = {
  book: "btc_mxn",
  capitalInicial: 500,
  velaSegundos: 60,
  pollSegundos: 5,
  smaRapida: 9,
  smaLenta: 21,
  rsiPeriodo: 14,
  rsiSobrecompra: 70,
  margenCrucePct: 0.3,
  stopLossPct: 3,
  takeProfitPct: 5,
  comisionPct: 0.65,
};

export interface Decision {
  accion: "comprar" | "vender" | "esperar";
  motivo: string;
  smaRapida: number | null;
  smaLenta: number | null;
  rsi: number | null;
}

export function sma(valores: number[], periodo: number): number | null {
  if (valores.length < periodo) return null;
  const ultimos = valores.slice(-periodo);
  return ultimos.reduce((a, b) => a + b, 0) / periodo;
}

export function rsi(valores: number[], periodo = 14): number | null {
  if (valores.length < periodo + 1) return null;
  let ganancias = 0;
  let perdidas = 0;
  const ultimos = valores.slice(-(periodo + 1));
  for (let i = 1; i < ultimos.length; i++) {
    const cambio = ultimos[i] - ultimos[i - 1];
    if (cambio > 0) ganancias += cambio;
    else perdidas -= cambio;
  }
  const perdidaMedia = perdidas / periodo;
  if (perdidaMedia === 0) return 100;
  const rs = ganancias / periodo / perdidaMedia;
  return 100 - 100 / (1 + rs);
}

export type Tendencia = "alza" | "baja" | null;

export function minimoDeVelas(cfg: Config): number {
  return Math.max(cfg.smaLenta, cfg.rsiPeriodo + 1);
}

/** Evalúa la estrategia sobre los cierres. Regresa la decisión y la nueva
 *  tendencia (estado de histéresis que el llamador debe conservar). */
export function decidir(
  cfg: Config,
  cierres: number[],
  tendenciaPrevia: Tendencia,
  tienePosicion: boolean,
  precioEntrada: number | null,
): { decision: Decision; tendencia: Tendencia } {
  const rapida = sma(cierres, cfg.smaRapida);
  const lenta = sma(cierres, cfg.smaLenta);
  const indiceRsi = rsi(cierres, cfg.rsiPeriodo);
  const precio = cierres[cierres.length - 1];

  const base = { smaRapida: rapida, smaLenta: lenta, rsi: indiceRsi };

  if (rapida === null || lenta === null || indiceRsi === null) {
    return {
      decision: { accion: "esperar", motivo: "Recolectando datos para los indicadores…", ...base },
      tendencia: tendenciaPrevia,
    };
  }

  // Gestión de riesgo: tiene prioridad sobre las señales.
  if (tienePosicion && precioEntrada) {
    const cambioPct = (precio / precioEntrada - 1) * 100;
    if (cambioPct <= -cfg.stopLossPct) {
      return {
        decision: { accion: "vender", motivo: `Stop-loss (${cambioPct.toFixed(2)}%)`, ...base },
        tendencia: tendenciaPrevia,
      };
    }
    if (cambioPct >= cfg.takeProfitPct) {
      return {
        decision: { accion: "vender", motivo: `Take-profit (+${cambioPct.toFixed(2)}%)`, ...base },
        tendencia: tendenciaPrevia,
      };
    }
  }

  const separacionPct = (rapida / lenta - 1) * 100;
  let tendencia = tendenciaPrevia;
  if (separacionPct >= cfg.margenCrucePct) tendencia = "alza";
  else if (separacionPct <= -cfg.margenCrucePct) tendencia = "baja";

  const cruceAlAlza = tendenciaPrevia === "baja" && tendencia === "alza";
  const cruceALaBaja = tendenciaPrevia === "alza" && tendencia === "baja";

  if (!tienePosicion && cruceAlAlza) {
    if (indiceRsi >= cfg.rsiSobrecompra) {
      return {
        decision: {
          accion: "esperar",
          motivo: `Cruce al alza pero RSI alto (${indiceRsi.toFixed(0)})`,
          ...base,
        },
        tendencia,
      };
    }
    return {
      decision: {
        accion: "comprar",
        motivo: `Cruce al alza de SMA (RSI ${indiceRsi.toFixed(0)})`,
        ...base,
      },
      tendencia,
    };
  }

  if (tienePosicion && cruceALaBaja) {
    return {
      decision: { accion: "vender", motivo: "Cruce a la baja de SMA", ...base },
      tendencia,
    };
  }

  const estado = tienePosicion ? "En posición" : "Fuera del mercado";
  return {
    decision: {
      accion: "esperar",
      motivo: `${estado} · RSI ${indiceRsi.toFixed(0)}`,
      ...base,
    },
    tendencia,
  };
}
