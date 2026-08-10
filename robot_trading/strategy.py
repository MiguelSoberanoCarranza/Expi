"""Estrategias de trading y ensemble que las combina.

Parte de varias familias clásicas (tendencia SMA/EMA, MACD, bandas de
Bollinger, momentum) y un meta-estrategia que:

1. Detecta el régimen del mercado (tendencia vs lateral) con ADX.
2. En tendencia, deja votar a las estrategias de seguimiento.
3. En lateral, deja votar a las de reversión a la media.
4. Solo opera cuando hay consenso (≥ votos_minimos) y aplica stop/take
   dinámicos basados en ATR para que el riesgo se adapte a la volatilidad.

El objetivo: menos operaciones de baja calidad y mejor asimetría
ganancia/pérdida que una sola estrategia aislada.
"""

from __future__ import annotations

from dataclasses import dataclass

from . import indicators as ind
from .config import Config


@dataclass
class Decision:
    accion: str  # "comprar", "vender" o "esperar"
    motivo: str
    # Metadatos opcionales para el dashboard / logs.
    sma_rapida: float | None = None
    sma_lenta: float | None = None
    rsi: float | None = None
    votos: dict[str, str] | None = None
    regimen: str | None = None


class _EstadoTendencia:
    """Histéresis de cruce de medias (compartida por SMA y EMA)."""

    def __init__(self) -> None:
        self.tendencia: str | None = None


def _umbrales_riesgo(
    cfg: Config, precio_entrada: float, atr: float | None
) -> tuple[float, float]:
    # El stop es un techo de pérdida fijo (protege el capital de $500).
    # El take-profit sí se amplía con ATR para dejar correr tendencias fuertes.
    stop = cfg.stop_loss_pct
    take = cfg.take_profit_pct
    if atr and precio_entrada > 0:
        atr_pct = (atr / precio_entrada) * 100.0
        take = max(take, atr_pct * cfg.atr_take_mult)
    return stop, take


def _gestion_riesgo(
    cfg: Config,
    precio: float,
    precio_entrada: float | None,
    tiene_posicion: bool,
    atr: float | None,
) -> Decision | None:
    if not (tiene_posicion and precio_entrada):
        return None
    cambio_pct = (precio / precio_entrada - 1.0) * 100.0
    stop, take = _umbrales_riesgo(cfg, precio_entrada, atr)

    if cambio_pct <= -stop:
        return Decision("vender", f"stop-loss ({cambio_pct:+.2f}%)")
    if cambio_pct >= take:
        return Decision("vender", f"take-profit ({cambio_pct:+.2f}%)")
    return None


def _cubre_comisiones(cfg: Config, precio: float, precio_entrada: float | None) -> bool:
    """True si la ganancia bruta supera el costo ida+vuelta + colchón.

    Evita cerrar operaciones "ganadoras" de +0.3% que en realidad pierden
    por la comisión de Bitso (~1.3% round-trip).
    """
    if not precio_entrada:
        return False
    ganancia = (precio / precio_entrada - 1.0) * 100.0
    minimo = cfg.comision_pct * 2 + cfg.colchon_salida_pct
    return ganancia >= minimo


# ---------------------------------------------------------------------------
# Estrategias individuales (votan comprar / vender / esperar)
# ---------------------------------------------------------------------------


class EstrategiaSMA:
    """Cruce SMA rápida/lenta con filtro RSI (estrategia original mejorada)."""

    nombre = "sma"

    def __init__(self, config: Config):
        self.cfg = config
        self._est = _EstadoTendencia()
        self._velas_pendiente = 0

    def minimo_de_velas(self) -> int:
        return max(self.cfg.sma_lenta, self.cfg.rsi_periodo + 1)

    def decidir(self, cierres, tiene_posicion, precio_entrada) -> Decision:
        return self.votar(cierres, tiene_posicion, precio_entrada)

    def votar(
        self,
        cierres: list[float],
        tiene_posicion: bool,
        precio_entrada: float | None,
    ) -> Decision:
        cfg = self.cfg
        rapida = ind.sma(cierres, cfg.sma_rapida)
        lenta = ind.sma(cierres, cfg.sma_lenta)
        indice_rsi = ind.rsi(cierres, cfg.rsi_periodo)
        atr = ind.atr_aprox(cierres, cfg.atr_periodo)
        precio = cierres[-1]

        if rapida is None or lenta is None or indice_rsi is None:
            return Decision("esperar", "sma: recolectando datos", rapida, lenta, indice_rsi)

        riesgo = _gestion_riesgo(cfg, precio, precio_entrada, tiene_posicion, atr)
        if riesgo:
            riesgo.sma_rapida, riesgo.sma_lenta, riesgo.rsi = rapida, lenta, indice_rsi
            return riesgo

        separacion_pct = (rapida / lenta - 1.0) * 100.0
        prev = self._est.tendencia
        if separacion_pct >= cfg.margen_cruce_pct:
            self._est.tendencia = "alza"
        elif separacion_pct <= -cfg.margen_cruce_pct:
            self._est.tendencia = "baja"
        elif self._est.tendencia is None:
            self._est.tendencia = "alza" if separacion_pct >= 0 else "baja"

        cruce_alza = prev == "baja" and self._est.tendencia == "alza"
        cruce_baja = prev == "alza" and self._est.tendencia == "baja"

        if self._est.tendencia != "alza":
            self._velas_pendiente = 0
        elif self._velas_pendiente > 0:
            self._velas_pendiente -= 1

        if not tiene_posicion and (cruce_alza or self._velas_pendiente > 0):
            if indice_rsi >= cfg.rsi_sobrecompra:
                if cruce_alza:
                    self._velas_pendiente = cfg.velas_compra_pendiente
                return Decision(
                    "esperar",
                    f"sma: RSI alto ({indice_rsi:.0f})",
                    rapida, lenta, indice_rsi,
                )
            self._velas_pendiente = 0
            return Decision(
                "comprar",
                f"sma: cruce alza (RSI {indice_rsi:.0f})",
                rapida, lenta, indice_rsi,
            )

        if tiene_posicion and cruce_baja:
            # Si aún no cubre comisiones, solo avisa; el stop se encarga del riesgo.
            if not _cubre_comisiones(cfg, precio, precio_entrada):
                return Decision(
                    "esperar",
                    "sma: cruce baja sin cubrir comisiones",
                    rapida, lenta, indice_rsi,
                )
            return Decision("vender", "sma: cruce baja", rapida, lenta, indice_rsi)

        return Decision(
            "esperar",
            f"sma: {separacion_pct:+.3f}%",
            rapida, lenta, indice_rsi,
        )


class EstrategiaMACD:
    """Cruce del histograma MACD (momentum de tendencia)."""

    nombre = "macd"

    def __init__(self, config: Config):
        self.cfg = config
        self._hist_prev: float | None = None

    def minimo_de_velas(self) -> int:
        return self.cfg.macd_lenta + self.cfg.macd_senal + 2

    def decidir(self, cierres, tiene_posicion, precio_entrada) -> Decision:
        return self.votar(cierres, tiene_posicion, precio_entrada)

    def votar(
        self,
        cierres: list[float],
        tiene_posicion: bool,
        precio_entrada: float | None,
    ) -> Decision:
        cfg = self.cfg
        linea, senal, hist = ind.macd(
            cierres, cfg.macd_rapida, cfg.macd_lenta, cfg.macd_senal
        )
        indice_rsi = ind.rsi(cierres, cfg.rsi_periodo)
        atr = ind.atr_aprox(cierres, cfg.atr_periodo)
        precio = cierres[-1]
        rapida = ind.ema(cierres, cfg.sma_rapida)
        lenta = ind.ema(cierres, cfg.sma_lenta)

        if hist is None or indice_rsi is None:
            return Decision("esperar", "macd: recolectando datos", rapida, lenta, indice_rsi)

        riesgo = _gestion_riesgo(cfg, precio, precio_entrada, tiene_posicion, atr)
        if riesgo:
            riesgo.sma_rapida, riesgo.sma_lenta, riesgo.rsi = rapida, lenta, indice_rsi
            return riesgo

        prev = self._hist_prev
        self._hist_prev = hist
        cruce_alza = prev is not None and prev <= 0 and hist > 0
        cruce_baja = prev is not None and prev >= 0 and hist < 0

        if not tiene_posicion and cruce_alza and indice_rsi < cfg.rsi_sobrecompra:
            return Decision(
                "comprar",
                f"macd: histograma alza (RSI {indice_rsi:.0f})",
                rapida, lenta, indice_rsi,
            )
        if tiene_posicion and cruce_baja:
            if not _cubre_comisiones(cfg, precio, precio_entrada):
                return Decision(
                    "esperar",
                    "macd: cruce baja sin cubrir comisiones",
                    rapida, lenta, indice_rsi,
                )
            return Decision("vender", "macd: histograma baja", rapida, lenta, indice_rsi)

        return Decision(
            "esperar",
            f"macd: hist {hist:+.2f}",
            rapida, lenta, indice_rsi,
        )


class EstrategiaBollinger:
    """Reversión a la media: compra cerca de la banda inferior con RSI bajo."""

    nombre = "bollinger"

    def __init__(self, config: Config):
        self.cfg = config

    def minimo_de_velas(self) -> int:
        return max(self.cfg.boll_periodo, self.cfg.rsi_periodo + 1)

    def decidir(self, cierres, tiene_posicion, precio_entrada) -> Decision:
        return self.votar(cierres, tiene_posicion, precio_entrada)

    def votar(
        self,
        cierres: list[float],
        tiene_posicion: bool,
        precio_entrada: float | None,
    ) -> Decision:
        cfg = self.cfg
        media, superior, inferior = ind.bollinger(
            cierres, cfg.boll_periodo, cfg.boll_desv
        )
        indice_rsi = ind.rsi(cierres, cfg.rsi_periodo)
        atr = ind.atr_aprox(cierres, cfg.atr_periodo)
        precio = cierres[-1]
        rapida = ind.sma(cierres, cfg.sma_rapida)
        lenta = ind.sma(cierres, cfg.sma_lenta)

        if media is None or inferior is None or superior is None or indice_rsi is None:
            return Decision("esperar", "boll: recolectando datos", rapida, lenta, indice_rsi)

        riesgo = _gestion_riesgo(cfg, precio, precio_entrada, tiene_posicion, atr)
        if riesgo:
            riesgo.sma_rapida, riesgo.sma_lenta, riesgo.rsi = rapida, lenta, indice_rsi
            return riesgo

        # Compra: precio toca/bajo banda inferior y RSI sobrevendido.
        if not tiene_posicion and precio <= inferior and indice_rsi <= cfg.rsi_sobreventa:
            return Decision(
                "comprar",
                f"boll: rebote banda baja (RSI {indice_rsi:.0f})",
                rapida, lenta, indice_rsi,
            )
        # Venta: solo en banda superior (el regreso a la media casi nunca
        # cubre la comisión de Bitso). El ensemble además exige que la
        # ganancia cubra comisiones salvo stop-loss.
        if tiene_posicion and precio >= superior and _cubre_comisiones(cfg, precio, precio_entrada):
            return Decision("vender", "boll: banda alta", rapida, lenta, indice_rsi)

        return Decision(
            "esperar",
            f"boll: precio vs media {(precio / media - 1) * 100:+.2f}%",
            rapida, lenta, indice_rsi,
        )


class EstrategiaMomentum:
    """Momentum: precio sobre EMA lenta + ROC positivo + RSI sano."""

    nombre = "momentum"

    def __init__(self, config: Config):
        self.cfg = config
        self._en_momentum = False

    def minimo_de_velas(self) -> int:
        return max(self.cfg.sma_lenta, self.cfg.roc_periodo + 1, self.cfg.rsi_periodo + 1)

    def decidir(self, cierres, tiene_posicion, precio_entrada) -> Decision:
        return self.votar(cierres, tiene_posicion, precio_entrada)

    def votar(
        self,
        cierres: list[float],
        tiene_posicion: bool,
        precio_entrada: float | None,
    ) -> Decision:
        cfg = self.cfg
        if len(cierres) < self.minimo_de_velas():
            return Decision("esperar", "mom: recolectando datos")

        ema_lenta = ind.ema(cierres, cfg.sma_lenta)
        ema_rapida = ind.ema(cierres, cfg.sma_rapida)
        indice_rsi = ind.rsi(cierres, cfg.rsi_periodo)
        atr = ind.atr_aprox(cierres, cfg.atr_periodo)
        precio = cierres[-1]
        roc = (precio / cierres[-cfg.roc_periodo - 1] - 1.0) * 100.0

        if ema_lenta is None or indice_rsi is None:
            return Decision("esperar", "mom: recolectando datos", ema_rapida, ema_lenta, indice_rsi)

        riesgo = _gestion_riesgo(cfg, precio, precio_entrada, tiene_posicion, atr)
        if riesgo:
            riesgo.sma_rapida, riesgo.sma_lenta, riesgo.rsi = ema_rapida, ema_lenta, indice_rsi
            return riesgo

        fuerte = (
            precio > ema_lenta
            and roc >= cfg.roc_min_pct
            and cfg.rsi_sobreventa < indice_rsi < cfg.rsi_sobrecompra
        )
        debil = precio < ema_lenta or roc <= -cfg.roc_min_pct

        entrando = fuerte and not self._en_momentum
        self._en_momentum = fuerte

        if not tiene_posicion and entrando:
            return Decision(
                "comprar",
                f"mom: ROC {roc:+.2f}% (RSI {indice_rsi:.0f})",
                ema_rapida, ema_lenta, indice_rsi,
            )
        if tiene_posicion and debil:
            if not _cubre_comisiones(cfg, precio, precio_entrada):
                return Decision(
                    "esperar",
                    f"mom: débil sin cubrir comisiones (ROC {roc:+.2f}%)",
                    ema_rapida, ema_lenta, indice_rsi,
                )
            return Decision(
                "vender",
                f"mom: momentum débil (ROC {roc:+.2f}%)",
                ema_rapida, ema_lenta, indice_rsi,
            )

        return Decision(
            "esperar",
            f"mom: ROC {roc:+.2f}%",
            ema_rapida, ema_lenta, indice_rsi,
        )


# ---------------------------------------------------------------------------
# Ensemble: combina las estrategias según el régimen del mercado
# ---------------------------------------------------------------------------


class EstrategiaEnsemble:
    """Meta-estrategia: combina SMA, MACD, Bollinger y Momentum.

    Diseño basado en backtests con comisión real de Bitso:

    - **MACD** es el motor principal (mejor edge histórico en BTC diario).
    - **SMA + Momentum** pueden abrir si coinciden (confirmación de tendencia).
    - **Bollinger** NO abre por sí solo (en bears de crypto "compra la
      caída" destruye capital); solo suma si MACD/momentum también compran.
    - En régimen **bajista** (ADX alto + EMAs a la baja) no se abren largos.
    - Las salidas por señal exigen cubrir comisiones ida+vuelta.
    """

    nombre = "ensemble"

    def __init__(self, config: Config):
        self.cfg = config
        self.sma = EstrategiaSMA(config)
        self.macd = EstrategiaMACD(config)
        self.bollinger = EstrategiaBollinger(config)
        self.momentum = EstrategiaMomentum(config)

    def minimo_de_velas(self) -> int:
        return max(
            self.sma.minimo_de_velas(),
            self.macd.minimo_de_velas(),
            self.bollinger.minimo_de_velas(),
            self.momentum.minimo_de_velas(),
            self.cfg.adx_periodo * 2 + 1,
        )

    def decidir(
        self,
        cierres: list[float],
        tiene_posicion: bool,
        precio_entrada: float | None,
    ) -> Decision:
        cfg = self.cfg
        precio = cierres[-1]
        atr = ind.atr_aprox(cierres, cfg.atr_periodo)
        indice_rsi = ind.rsi(cierres, cfg.rsi_periodo)
        rapida = ind.sma(cierres, cfg.sma_rapida)
        lenta = ind.sma(cierres, cfg.sma_lenta)
        adx = ind.adx_aprox(cierres, cfg.adx_periodo)

        if len(cierres) < self.minimo_de_velas() or adx is None or indice_rsi is None:
            return Decision(
                "esperar",
                "ensemble: calentando indicadores",
                rapida, lenta, indice_rsi,
            )

        riesgo = _gestion_riesgo(cfg, precio, precio_entrada, tiene_posicion, atr)
        if riesgo:
            riesgo.sma_rapida, riesgo.sma_lenta, riesgo.rsi = rapida, lenta, indice_rsi
            riesgo.regimen = "riesgo"
            return riesgo

        ema_rapida = ind.ema(cierres, cfg.sma_rapida)
        ema_lenta = ind.ema(cierres, cfg.sma_lenta)
        sesgo_alcista = (
            ema_rapida is not None
            and ema_lenta is not None
            and ema_rapida >= ema_lenta
        )
        if adx >= cfg.adx_tendencia and sesgo_alcista:
            regimen = "alcista"
        elif adx >= cfg.adx_tendencia and not sesgo_alcista:
            regimen = "bajista"
        else:
            regimen = "lateral"

        votos: dict[str, str] = {}
        motivos: dict[str, str] = {}
        for est in (self.sma, self.macd, self.bollinger, self.momentum):
            d = est.votar(cierres, tiene_posicion, precio_entrada)
            votos[est.nombre] = d.accion
            motivos[est.nombre] = d.motivo

        # Pesos fijos. Bollinger solo aporta como confirmación (+1), nunca
        # abre solo (evita cachar cuchillos en bears prolongados).
        pesos = {"macd": 2, "sma": 1, "momentum": 1, "bollinger": 1}
        score_compra = 0
        score_venta = 0
        motivos_compra: list[str] = []
        motivos_venta: list[str] = []

        for nombre, accion in votos.items():
            if accion == "comprar":
                # Bollinger nunca abre solo (se suma después como bonus).
                if nombre == "bollinger":
                    continue
                # En bajista solo escuchamos al MACD (mejor edge en bears);
                # SMA/momentum tienden a comprar rallies falsos.
                if regimen == "bajista" and nombre != "macd":
                    continue
                score_compra += pesos[nombre]
                motivos_compra.append(motivos[nombre])
            elif accion == "vender":
                score_venta += pesos[nombre]
                motivos_venta.append(motivos[nombre])

        # Bonus bollinger: confirmación de sobreventa si ya hay otra señal.
        if votos.get("bollinger") == "comprar" and score_compra >= 1:
            score_compra += 1
            motivos_compra.append(motivos["bollinger"])

        umbral = cfg.votos_minimos

        if not tiene_posicion and score_compra >= umbral:
            return Decision(
                "comprar",
                f"consenso {regimen} ({score_compra} pts): "
                + "; ".join(motivos_compra),
                rapida, lenta, indice_rsi,
                votos=votos,
                regimen=regimen,
            )

        if tiene_posicion and score_venta >= umbral:
            return Decision(
                "vender",
                f"consenso {regimen} ({score_venta} pts): "
                + "; ".join(motivos_venta),
                rapida, lenta, indice_rsi,
                votos=votos,
                regimen=regimen,
            )

        detalle = ", ".join(f"{k}={v}" for k, v in votos.items())
        estado = "en posición" if tiene_posicion else "fuera del mercado"
        return Decision(
            "esperar",
            f"{estado} · régimen {regimen} (ADX {adx:.0f}) · "
            f"score C{score_compra}/V{score_venta} · [{detalle}]",
            rapida, lenta, indice_rsi,
            votos=votos,
            regimen=regimen,
        )


def crear_estrategia(config: Config, nombre: str | None = None):
    """Factory: 'ensemble' (default), 'sma', 'macd', 'bollinger', 'momentum'."""
    nombre = (nombre or config.estrategia).lower()
    mapa = {
        "ensemble": EstrategiaEnsemble,
        "sma": EstrategiaSMA,
        "macd": EstrategiaMACD,
        "bollinger": EstrategiaBollinger,
        "momentum": EstrategiaMomentum,
    }
    if nombre not in mapa:
        raise ValueError(f"Estrategia desconocida: {nombre}. Opciones: {list(mapa)}")
    return mapa[nombre](config)
