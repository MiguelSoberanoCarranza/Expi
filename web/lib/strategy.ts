// Ensemble de estrategias (SMA, MACD, Bollinger, Momentum) con detección
// de régimen. Espejo del algoritmo en robot_trading/strategy.py.

export interface Config {
  book: string;
  capitalInicial: number;
  velaSegundos: number;
  pollSegundos: number;
  estrategia: "ensemble" | "sma" | "macd" | "bollinger" | "momentum";
  smaRapida: number;
  smaLenta: number;
  rsiPeriodo: number;
  rsiSobrecompra: number;
  rsiSobreventa: number;
  margenCrucePct: number;
  velasCompraPendiente: number;
  macdRapida: number;
  macdLenta: number;
  macdSenal: number;
  bollPeriodo: number;
  bollDesv: number;
  rocPeriodo: number;
  rocMinPct: number;
  adxPeriodo: number;
  adxTendencia: number;
  votosMinimos: number;
  stopLossPct: number;
  takeProfitPct: number;
  atrPeriodo: number;
  atrTakeMult: number;
  colchonSalidaPct: number;
  comisionPct: number;
}

export const CONFIG_DEFAULT: Config = {
  book: "btc_mxn",
  capitalInicial: 500,
  velaSegundos: 60,
  pollSegundos: 5,
  estrategia: "ensemble",
  smaRapida: 9,
  smaLenta: 21,
  rsiPeriodo: 14,
  rsiSobrecompra: 70,
  rsiSobreventa: 35,
  // Con velas de 1 minuto las SMAs se separan poco.
  margenCrucePct: 0.05,
  velasCompraPendiente: 3,
  macdRapida: 12,
  macdLenta: 26,
  macdSenal: 9,
  bollPeriodo: 20,
  bollDesv: 2,
  rocPeriodo: 10,
  rocMinPct: 0.8,
  adxPeriodo: 14,
  adxTendencia: 22,
  votosMinimos: 2,
  stopLossPct: 3,
  takeProfitPct: 8,
  atrPeriodo: 14,
  atrTakeMult: 3,
  colchonSalidaPct: 0.4,
  comisionPct: 0.65,
};

export interface Decision {
  accion: "comprar" | "vender" | "esperar";
  motivo: string;
  smaRapida: number | null;
  smaLenta: number | null;
  rsi: number | null;
  regimen?: string | null;
  votos?: Record<string, string> | null;
}

export type Tendencia = "alza" | "baja" | null;

// ---------------------------------------------------------------------------
// Indicadores
// ---------------------------------------------------------------------------

export function sma(valores: number[], periodo: number): number | null {
  if (valores.length < periodo) return null;
  const ultimos = valores.slice(-periodo);
  return ultimos.reduce((a, b) => a + b, 0) / periodo;
}

export function ema(valores: number[], periodo: number): number | null {
  if (valores.length < periodo) return null;
  const k = 2 / (periodo + 1);
  let e = valores.slice(0, periodo).reduce((a, b) => a + b, 0) / periodo;
  for (let i = periodo; i < valores.length; i++) {
    e = valores[i] * k + e * (1 - k);
  }
  return e;
}

export function rsi(valores: number[], periodo = 14): number | null {
  if (valores.length < periodo + 1) return null;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= periodo; i++) {
    const cambio = valores[i] - valores[i - 1];
    if (cambio >= 0) avgGain += cambio;
    else avgLoss -= cambio;
  }
  avgGain /= periodo;
  avgLoss /= periodo;
  for (let i = periodo + 1; i < valores.length; i++) {
    const cambio = valores[i] - valores[i - 1];
    const gain = Math.max(cambio, 0);
    const loss = Math.max(-cambio, 0);
    avgGain = (avgGain * (periodo - 1) + gain) / periodo;
    avgLoss = (avgLoss * (periodo - 1) + loss) / periodo;
  }
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function macd(
  valores: number[],
  rapida: number,
  lenta: number,
  senal: number,
): { linea: number; senal: number; hist: number } | null {
  if (valores.length < lenta + senal) return null;
  const kR = 2 / (rapida + 1);
  const kL = 2 / (lenta + 1);
  let eR = valores.slice(0, rapida).reduce((a, b) => a + b, 0) / rapida;
  let eL = valores.slice(0, lenta).reduce((a, b) => a + b, 0) / lenta;
  for (let i = rapida; i < lenta; i++) eR = valores[i] * kR + eR * (1 - kR);
  const lineaMacd: number[] = [];
  for (let i = lenta; i < valores.length; i++) {
    eR = valores[i] * kR + eR * (1 - kR);
    eL = valores[i] * kL + eL * (1 - kL);
    lineaMacd.push(eR - eL);
  }
  if (lineaMacd.length < senal) return null;
  const kS = 2 / (senal + 1);
  let sig = lineaMacd.slice(0, senal).reduce((a, b) => a + b, 0) / senal;
  for (let i = senal; i < lineaMacd.length; i++) {
    sig = lineaMacd[i] * kS + sig * (1 - kS);
  }
  const linea = lineaMacd[lineaMacd.length - 1];
  return { linea, senal: sig, hist: linea - sig };
}

function bollinger(
  valores: number[],
  periodo: number,
  desv: number,
): { media: number; superior: number; inferior: number } | null {
  if (valores.length < periodo) return null;
  const ventana = valores.slice(-periodo);
  const media = ventana.reduce((a, b) => a + b, 0) / periodo;
  const varianza = ventana.reduce((a, b) => a + (b - media) ** 2, 0) / periodo;
  const std = Math.sqrt(varianza);
  return { media, superior: media + desv * std, inferior: media - desv * std };
}

function atrAprox(valores: number[], periodo: number): number | null {
  if (valores.length < periodo + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < valores.length; i++) trs.push(Math.abs(valores[i] - valores[i - 1]));
  let atr = trs.slice(0, periodo).reduce((a, b) => a + b, 0) / periodo;
  for (let i = periodo; i < trs.length; i++) {
    atr = (atr * (periodo - 1) + trs[i]) / periodo;
  }
  return atr;
}

function adxAprox(valores: number[], periodo: number): number | null {
  if (valores.length < periodo * 2 + 1) return null;
  const plusDm: number[] = [];
  const minusDm: number[] = [];
  const tr: number[] = [];
  for (let i = 1; i < valores.length; i++) {
    const up = valores[i] - valores[i - 1];
    const down = valores[i - 1] - valores[i];
    plusDm.push(up > down && up > 0 ? up : 0);
    minusDm.push(down > up && down > 0 ? down : 0);
    tr.push(Math.abs(up));
  }
  const wilder = (series: number[]) => {
    const out = [series.slice(0, periodo).reduce((a, b) => a + b, 0) / periodo];
    for (let i = periodo; i < series.length; i++) {
      out.push((out[out.length - 1] * (periodo - 1) + series[i]) / periodo);
    }
    return out;
  };
  const atrS = wilder(tr);
  const plusS = wilder(plusDm);
  const minusS = wilder(minusDm);
  const dx: number[] = [];
  for (let i = 0; i < atrS.length; i++) {
    const a = atrS[i];
    if (a === 0) {
      dx.push(0);
      continue;
    }
    const diP = (100 * plusS[i]) / a;
    const diM = (100 * minusS[i]) / a;
    const s = diP + diM;
    dx.push(s === 0 ? 0 : (100 * Math.abs(diP - diM)) / s);
  }
  if (dx.length < periodo) return null;
  let adx = dx.slice(0, periodo).reduce((a, b) => a + b, 0) / periodo;
  for (let i = periodo; i < dx.length; i++) {
    adx = (adx * (periodo - 1) + dx[i]) / periodo;
  }
  return adx;
}

function cubreComisiones(cfg: Config, precio: number, precioEntrada: number | null): boolean {
  if (!precioEntrada) return false;
  const ganancia = (precio / precioEntrada - 1) * 100;
  return ganancia >= cfg.comisionPct * 2 + cfg.colchonSalidaPct;
}

function gestionRiesgo(
  cfg: Config,
  precio: number,
  precioEntrada: number | null,
  tienePosicion: boolean,
  atr: number | null,
  base: Pick<Decision, "smaRapida" | "smaLenta" | "rsi">,
): Decision | null {
  if (!tienePosicion || !precioEntrada) return null;
  const cambioPct = (precio / precioEntrada - 1) * 100;
  let take = cfg.takeProfitPct;
  if (atr && precioEntrada > 0) {
    take = Math.max(take, (atr / precioEntrada) * 100 * cfg.atrTakeMult);
  }
  if (cambioPct <= -cfg.stopLossPct) {
    return { accion: "vender", motivo: `Stop-loss (${cambioPct.toFixed(2)}%)`, ...base };
  }
  if (cambioPct >= take) {
    return { accion: "vender", motivo: `Take-profit (+${cambioPct.toFixed(2)}%)`, ...base };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Motor con estado (para el hook del navegador)
// ---------------------------------------------------------------------------

interface EstadoInterno {
  tendenciaSma: Tendencia;
  velasPendiente: number;
  histMacdPrev: number | null;
  enMomentum: boolean;
}

export function minimoDeVelas(cfg: Config): number {
  return Math.max(
    cfg.smaLenta,
    cfg.rsiPeriodo + 1,
    cfg.macdLenta + cfg.macdSenal + 2,
    cfg.bollPeriodo,
    cfg.rocPeriodo + 1,
    cfg.adxPeriodo * 2 + 1,
  );
}

function votarSma(
  cfg: Config,
  cierres: number[],
  estado: EstadoInterno,
  tienePosicion: boolean,
  precioEntrada: number | null,
  base: Pick<Decision, "smaRapida" | "smaLenta" | "rsi">,
): Decision {
  const rapida = sma(cierres, cfg.smaRapida);
  const lenta = sma(cierres, cfg.smaLenta);
  const indiceRsi = rsi(cierres, cfg.rsiPeriodo);
  const atr = atrAprox(cierres, cfg.atrPeriodo);
  const precio = cierres[cierres.length - 1];
  const b = { smaRapida: rapida, smaLenta: lenta, rsi: indiceRsi };
  if (rapida === null || lenta === null || indiceRsi === null) {
    return { accion: "esperar", motivo: "sma: recolectando", ...b };
  }
  const riesgo = gestionRiesgo(cfg, precio, precioEntrada, tienePosicion, atr, b);
  if (riesgo) return riesgo;

  const sep = (rapida / lenta - 1) * 100;
  const prev = estado.tendenciaSma;
  if (sep >= cfg.margenCrucePct) estado.tendenciaSma = "alza";
  else if (sep <= -cfg.margenCrucePct) estado.tendenciaSma = "baja";
  else if (estado.tendenciaSma === null) estado.tendenciaSma = sep >= 0 ? "alza" : "baja";

  const cruceAlza = prev === "baja" && estado.tendenciaSma === "alza";
  const cruceBaja = prev === "alza" && estado.tendenciaSma === "baja";

  if (estado.tendenciaSma !== "alza") estado.velasPendiente = 0;
  else if (estado.velasPendiente > 0) estado.velasPendiente -= 1;

  if (!tienePosicion && (cruceAlza || estado.velasPendiente > 0)) {
    if (indiceRsi >= cfg.rsiSobrecompra) {
      if (cruceAlza) estado.velasPendiente = cfg.velasCompraPendiente;
      return { accion: "esperar", motivo: `sma: RSI alto (${indiceRsi.toFixed(0)})`, ...b };
    }
    estado.velasPendiente = 0;
    return { accion: "comprar", motivo: `sma: cruce alza (RSI ${indiceRsi.toFixed(0)})`, ...b };
  }
  if (tienePosicion && cruceBaja) {
    if (!cubreComisiones(cfg, precio, precioEntrada)) {
      return { accion: "esperar", motivo: "sma: cruce baja sin cubrir comisiones", ...b };
    }
    return { accion: "vender", motivo: "sma: cruce baja", ...b };
  }
  return { accion: "esperar", motivo: `sma: ${sep >= 0 ? "+" : ""}${sep.toFixed(3)}%`, ...b };
}

function votarMacd(
  cfg: Config,
  cierres: number[],
  estado: EstadoInterno,
  tienePosicion: boolean,
  precioEntrada: number | null,
  base: Pick<Decision, "smaRapida" | "smaLenta" | "rsi">,
): Decision {
  const m = macd(cierres, cfg.macdRapida, cfg.macdLenta, cfg.macdSenal);
  const indiceRsi = rsi(cierres, cfg.rsiPeriodo);
  const atr = atrAprox(cierres, cfg.atrPeriodo);
  const precio = cierres[cierres.length - 1];
  if (!m || indiceRsi === null) {
    return { accion: "esperar", motivo: "macd: recolectando", ...base };
  }
  const riesgo = gestionRiesgo(cfg, precio, precioEntrada, tienePosicion, atr, base);
  if (riesgo) return riesgo;

  const prev = estado.histMacdPrev;
  estado.histMacdPrev = m.hist;
  const cruceAlza = prev !== null && prev <= 0 && m.hist > 0;
  const cruceBaja = prev !== null && prev >= 0 && m.hist < 0;

  if (!tienePosicion && cruceAlza && indiceRsi < cfg.rsiSobrecompra) {
    return {
      accion: "comprar",
      motivo: `macd: histograma alza (RSI ${indiceRsi.toFixed(0)})`,
      ...base,
    };
  }
  if (tienePosicion && cruceBaja) {
    if (!cubreComisiones(cfg, precio, precioEntrada)) {
      return { accion: "esperar", motivo: "macd: cruce baja sin cubrir comisiones", ...base };
    }
    return { accion: "vender", motivo: "macd: histograma baja", ...base };
  }
  return { accion: "esperar", motivo: `macd: hist ${m.hist >= 0 ? "+" : ""}${m.hist.toFixed(2)}`, ...base };
}

function votarBollinger(
  cfg: Config,
  cierres: number[],
  tienePosicion: boolean,
  precioEntrada: number | null,
  base: Pick<Decision, "smaRapida" | "smaLenta" | "rsi">,
): Decision {
  const b = bollinger(cierres, cfg.bollPeriodo, cfg.bollDesv);
  const indiceRsi = rsi(cierres, cfg.rsiPeriodo);
  const atr = atrAprox(cierres, cfg.atrPeriodo);
  const precio = cierres[cierres.length - 1];
  if (!b || indiceRsi === null) {
    return { accion: "esperar", motivo: "boll: recolectando", ...base };
  }
  const riesgo = gestionRiesgo(cfg, precio, precioEntrada, tienePosicion, atr, base);
  if (riesgo) return riesgo;

  if (!tienePosicion && precio <= b.inferior && indiceRsi <= cfg.rsiSobreventa) {
    return {
      accion: "comprar",
      motivo: `boll: rebote banda baja (RSI ${indiceRsi.toFixed(0)})`,
      ...base,
    };
  }
  if (
    tienePosicion &&
    precio >= b.superior &&
    cubreComisiones(cfg, precio, precioEntrada)
  ) {
    return { accion: "vender", motivo: "boll: banda alta", ...base };
  }
  return {
    accion: "esperar",
    motivo: `boll: vs media ${(((precio / b.media) - 1) * 100).toFixed(2)}%`,
    ...base,
  };
}

function votarMomentum(
  cfg: Config,
  cierres: number[],
  estado: EstadoInterno,
  tienePosicion: boolean,
  precioEntrada: number | null,
  base: Pick<Decision, "smaRapida" | "smaLenta" | "rsi">,
): Decision {
  if (cierres.length < Math.max(cfg.smaLenta, cfg.rocPeriodo + 1, cfg.rsiPeriodo + 1)) {
    return { accion: "esperar", motivo: "mom: recolectando", ...base };
  }
  const emaLenta = ema(cierres, cfg.smaLenta);
  const indiceRsi = rsi(cierres, cfg.rsiPeriodo);
  const atr = atrAprox(cierres, cfg.atrPeriodo);
  const precio = cierres[cierres.length - 1];
  const roc = (precio / cierres[cierres.length - cfg.rocPeriodo - 1] - 1) * 100;
  if (emaLenta === null || indiceRsi === null) {
    return { accion: "esperar", motivo: "mom: recolectando", ...base };
  }
  const riesgo = gestionRiesgo(cfg, precio, precioEntrada, tienePosicion, atr, base);
  if (riesgo) return riesgo;

  const fuerte =
    precio > emaLenta &&
    roc >= cfg.rocMinPct &&
    indiceRsi > cfg.rsiSobreventa &&
    indiceRsi < cfg.rsiSobrecompra;
  const debil = precio < emaLenta || roc <= -cfg.rocMinPct;
  const entrando = fuerte && !estado.enMomentum;
  estado.enMomentum = fuerte;

  if (!tienePosicion && entrando) {
    return {
      accion: "comprar",
      motivo: `mom: ROC ${roc >= 0 ? "+" : ""}${roc.toFixed(2)}% (RSI ${indiceRsi.toFixed(0)})`,
      ...base,
    };
  }
  if (tienePosicion && debil) {
    if (!cubreComisiones(cfg, precio, precioEntrada)) {
      return {
        accion: "esperar",
        motivo: `mom: débil sin cubrir comisiones (ROC ${roc.toFixed(2)}%)`,
        ...base,
      };
    }
    return {
      accion: "vender",
      motivo: `mom: momentum débil (ROC ${roc >= 0 ? "+" : ""}${roc.toFixed(2)}%)`,
      ...base,
    };
  }
  return {
    accion: "esperar",
    motivo: `mom: ROC ${roc >= 0 ? "+" : ""}${roc.toFixed(2)}%`,
    ...base,
  };
}

export class MotorEstrategia {
  estado: EstadoInterno = {
    tendenciaSma: null,
    velasPendiente: 0,
    histMacdPrev: null,
    enMomentum: false,
  };

  reset() {
    this.estado = {
      tendenciaSma: null,
      velasPendiente: 0,
      histMacdPrev: null,
      enMomentum: false,
    };
  }

  decidir(
    cfg: Config,
    cierres: number[],
    tienePosicion: boolean,
    precioEntrada: number | null,
  ): Decision {
    const rapida = sma(cierres, cfg.smaRapida);
    const lenta = sma(cierres, cfg.smaLenta);
    const indiceRsi = rsi(cierres, cfg.rsiPeriodo);
    const base = { smaRapida: rapida, smaLenta: lenta, rsi: indiceRsi };
    const precio = cierres[cierres.length - 1];
    const atr = atrAprox(cierres, cfg.atrPeriodo);
    const adx = adxAprox(cierres, cfg.adxPeriodo);

    if (cierres.length < minimoDeVelas(cfg) || adx === null || indiceRsi === null) {
      return { accion: "esperar", motivo: "Calentando indicadores del ensemble…", ...base };
    }

    const riesgo = gestionRiesgo(cfg, precio, precioEntrada, tienePosicion, atr, base);
    if (riesgo) return { ...riesgo, regimen: "riesgo" };

    // Actualizar estado de todas (aunque solo usemos una).
    const vSma = votarSma(cfg, cierres, this.estado, tienePosicion, precioEntrada, base);
    const vMacd = votarMacd(cfg, cierres, this.estado, tienePosicion, precioEntrada, base);
    const vBoll = votarBollinger(cfg, cierres, tienePosicion, precioEntrada, base);
    const vMom = votarMomentum(cfg, cierres, this.estado, tienePosicion, precioEntrada, base);

    if (cfg.estrategia === "sma") return vSma;
    if (cfg.estrategia === "macd") return vMacd;
    if (cfg.estrategia === "bollinger") return vBoll;
    if (cfg.estrategia === "momentum") return vMom;

    // Ensemble
    const emaRapida = ema(cierres, cfg.smaRapida);
    const emaLenta = ema(cierres, cfg.smaLenta);
    const sesgoAlcista =
      emaRapida !== null && emaLenta !== null && emaRapida >= emaLenta;
    let regimen: string;
    if (adx >= cfg.adxTendencia && sesgoAlcista) regimen = "alcista";
    else if (adx >= cfg.adxTendencia && !sesgoAlcista) regimen = "bajista";
    else regimen = "lateral";

    const votos: Record<string, string> = {
      sma: vSma.accion,
      macd: vMacd.accion,
      bollinger: vBoll.accion,
      momentum: vMom.accion,
    };
    const motivos: Record<string, string> = {
      sma: vSma.motivo,
      macd: vMacd.motivo,
      bollinger: vBoll.motivo,
      momentum: vMom.motivo,
    };
    const pesos: Record<string, number> = { macd: 2, sma: 1, momentum: 1, bollinger: 1 };

    let scoreCompra = 0;
    let scoreVenta = 0;
    const motivosCompra: string[] = [];
    const motivosVenta: string[] = [];

    for (const [nombre, accion] of Object.entries(votos)) {
      if (accion === "comprar") {
        if (nombre === "bollinger") continue;
        if (regimen === "bajista" && nombre !== "macd") continue;
        scoreCompra += pesos[nombre];
        motivosCompra.push(motivos[nombre]);
      } else if (accion === "vender") {
        scoreVenta += pesos[nombre];
        motivosVenta.push(motivos[nombre]);
      }
    }
    if (votos.bollinger === "comprar" && scoreCompra >= 1) {
      scoreCompra += 1;
      motivosCompra.push(motivos.bollinger);
    }

    if (!tienePosicion && scoreCompra >= cfg.votosMinimos) {
      return {
        accion: "comprar",
        motivo: `Consenso ${regimen} (${scoreCompra} pts): ${motivosCompra.join("; ")}`,
        ...base,
        votos,
        regimen,
      };
    }
    if (tienePosicion && scoreVenta >= cfg.votosMinimos) {
      return {
        accion: "vender",
        motivo: `Consenso ${regimen} (${scoreVenta} pts): ${motivosVenta.join("; ")}`,
        ...base,
        votos,
        regimen,
      };
    }

    const detalle = Object.entries(votos)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
    const estadoTxt = tienePosicion ? "En posición" : "Fuera del mercado";
    return {
      accion: "esperar",
      motivo: `${estadoTxt} · régimen ${regimen} (ADX ${adx.toFixed(0)}) · score C${scoreCompra}/V${scoreVenta} · [${detalle}]`,
      ...base,
      votos,
      regimen,
    };
  }
}

/** Compat: firma antigua. Delega a un motor efímero. */
export function decidir(
  cfg: Config,
  cierres: number[],
  tendenciaPrevia: Tendencia,
  velasPendientePrevia: number,
  tienePosicion: boolean,
  precioEntrada: number | null,
): { decision: Decision; tendencia: Tendencia; velasPendiente: number } {
  const motor = new MotorEstrategia();
  motor.estado.tendenciaSma = tendenciaPrevia;
  motor.estado.velasPendiente = velasPendientePrevia;
  const decision = motor.decidir(cfg, cierres, tienePosicion, precioEntrada);
  return {
    decision,
    tendencia: motor.estado.tendenciaSma,
    velasPendiente: motor.estado.velasPendiente,
  };
}
