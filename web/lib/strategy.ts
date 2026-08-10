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
  velasCompraPendiente: number;
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
  // Con velas de 1 minuto las SMAs se separan poco; 0.3% (lo usado en el
  // backtest con velas de 1 hora) casi nunca se alcanza y el robot no opera.
  margenCrucePct: 0.05,
  // Si el RSI bloquea un cruce al alza, la compra queda pendiente estas
  // velas; si el RSI no se enfría a tiempo, se descarta (entrar muy tarde
  // tras el cruce suele ser mala entrada).
  velasCompraPendiente: 3,
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
  if (perdidaMedia === 0) {
    // Mercado totalmente plano: RSI neutro, no "sobrecomprado". Con velas
    // cortas los cierres se repiten mucho y el RSI clásico se pegaba en 100,
    // bloqueando compras sin razón.
    return ganancias === 0 ? 50 : 100;
  }
  const rs = ganancias / periodo / perdidaMedia;
  return 100 - 100 / (1 + rs);
}

export type Tendencia = "alza" | "baja" | null;

export function minimoDeVelas(cfg: Config): number {
  return Math.max(cfg.smaLenta, cfg.rsiPeriodo + 1);
}

export interface ResultadoDecision {
  decision: Decision;
  tendencia: Tendencia;
  /** Velas restantes de una compra pendiente (cruce bloqueado por RSI alto). */
  velasPendiente: number;
}

/** Evalúa la estrategia sobre los cierres. Regresa la decisión y el estado
 *  (tendencia + compra pendiente) que el llamador debe conservar. */
export function decidir(
  cfg: Config,
  cierres: number[],
  tendenciaPrevia: Tendencia,
  velasPendientePrevia: number,
  tienePosicion: boolean,
  precioEntrada: number | null,
): ResultadoDecision {
  const rapida = sma(cierres, cfg.smaRapida);
  const lenta = sma(cierres, cfg.smaLenta);
  const indiceRsi = rsi(cierres, cfg.rsiPeriodo);
  const precio = cierres[cierres.length - 1];

  const base = { smaRapida: rapida, smaLenta: lenta, rsi: indiceRsi };

  if (rapida === null || lenta === null || indiceRsi === null) {
    return {
      decision: { accion: "esperar", motivo: "Recolectando datos para los indicadores…", ...base },
      tendencia: tendenciaPrevia,
      velasPendiente: velasPendientePrevia,
    };
  }

  // Gestión de riesgo: tiene prioridad sobre las señales.
  if (tienePosicion && precioEntrada) {
    const cambioPct = (precio / precioEntrada - 1) * 100;
    if (cambioPct <= -cfg.stopLossPct) {
      return {
        decision: { accion: "vender", motivo: `Stop-loss (${cambioPct.toFixed(2)}%)`, ...base },
        tendencia: tendenciaPrevia,
        velasPendiente: 0,
      };
    }
    if (cambioPct >= cfg.takeProfitPct) {
      return {
        decision: { accion: "vender", motivo: `Take-profit (+${cambioPct.toFixed(2)}%)`, ...base },
        tendencia: tendenciaPrevia,
        velasPendiente: 0,
      };
    }
  }

  const separacionPct = (rapida / lenta - 1) * 100;
  let tendencia = tendenciaPrevia;
  if (separacionPct >= cfg.margenCrucePct) tendencia = "alza";
  else if (separacionPct <= -cfg.margenCrucePct) tendencia = "baja";
  else if (tendenciaPrevia === null) {
    // Arranque: fijar la tendencia según el signo actual para que el primer
    // cruce real ya pueda generar una señal (si no, con mercado lateral el
    // robot se quedaba "sin tendencia" indefinidamente y nunca operaba).
    tendencia = separacionPct >= 0 ? "alza" : "baja";
  }

  const cruceAlAlza = tendenciaPrevia === "baja" && tendencia === "alza";
  const cruceALaBaja = tendenciaPrevia === "alza" && tendencia === "baja";

  // La compra pendiente caduca al pasar las velas o si la tendencia dejó
  // de ser alcista.
  let velasPendiente = tendencia === "alza" ? Math.max(0, velasPendientePrevia - 1) : 0;

  if (!tienePosicion && (cruceAlAlza || velasPendiente > 0)) {
    if (indiceRsi >= cfg.rsiSobrecompra) {
      // No perder la señal de inmediato: queda pendiente unas velas por si
      // el RSI se enfría rápido.
      if (cruceAlAlza) velasPendiente = cfg.velasCompraPendiente;
      return {
        decision: {
          accion: "esperar",
          motivo: `Cruce al alza pero RSI alto (${indiceRsi.toFixed(0)}) · compra pendiente`,
          ...base,
        },
        tendencia,
        velasPendiente,
      };
    }
    return {
      decision: {
        accion: "comprar",
        motivo: cruceAlAlza
          ? `Cruce al alza de SMA (RSI ${indiceRsi.toFixed(0)})`
          : `Entrada tras enfriarse el RSI (${indiceRsi.toFixed(0)})`,
        ...base,
      },
      tendencia,
      velasPendiente: 0,
    };
  }

  if (tienePosicion && cruceALaBaja) {
    return {
      decision: { accion: "vender", motivo: "Cruce a la baja de SMA", ...base },
      tendencia,
      velasPendiente,
    };
  }

  // Explicar qué tan cerca está la señal para que el usuario entienda la espera.
  const estado = tienePosicion ? "En posición" : "Fuera del mercado";
  const signo = separacionPct >= 0 ? "+" : "";
  return {
    decision: {
      accion: "esperar",
      motivo:
        `${estado} · SMAs ${signo}${separacionPct.toFixed(3)}% ` +
        `(señal al cruzar ±${cfg.margenCrucePct}%) · RSI ${indiceRsi.toFixed(0)}`,
      ...base,
    },
    tendencia,
    velasPendiente,
  };
}
