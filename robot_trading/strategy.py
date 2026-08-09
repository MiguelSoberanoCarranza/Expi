"""Estrategia de trading: cruce de medias móviles (SMA) con filtro RSI y
gestión de riesgo por stop-loss / take-profit."""

from dataclasses import dataclass

from .config import Config


def sma(valores: list[float], periodo: int) -> float | None:
    """Media móvil simple de los últimos ``periodo`` valores."""
    if len(valores) < periodo:
        return None
    return sum(valores[-periodo:]) / periodo


def rsi(valores: list[float], periodo: int = 14) -> float | None:
    """Índice de fuerza relativa (RSI) clásico de Wilder."""
    if len(valores) < periodo + 1:
        return None
    ganancias, perdidas = [], []
    for anterior, actual in zip(valores[-periodo - 1:-1], valores[-periodo:]):
        cambio = actual - anterior
        ganancias.append(max(cambio, 0.0))
        perdidas.append(max(-cambio, 0.0))
    perdida_media = sum(perdidas) / periodo
    if perdida_media == 0:
        return 100.0
    rs = (sum(ganancias) / periodo) / perdida_media
    return 100.0 - 100.0 / (1.0 + rs)


@dataclass
class Decision:
    accion: str   # "comprar", "vender" o "esperar"
    motivo: str


class EstrategiaSMA:
    """Compra cuando la SMA rápida cruza por encima de la lenta (y el RSI no
    está sobrecomprado). Vende cuando cruza hacia abajo, o cuando se dispara
    el stop-loss o el take-profit."""

    def __init__(self, config: Config):
        self.cfg = config
        # Estado de tendencia con histéresis: "alza", "baja" o None (indefinido).
        # Solo cambia cuando la separación entre SMAs supera margen_cruce_pct,
        # lo que filtra los cruces falsos que generan operaciones perdedoras.
        self._tendencia: str | None = None

    def minimo_de_velas(self) -> int:
        return max(self.cfg.sma_lenta, self.cfg.rsi_periodo + 1)

    def decidir(
        self,
        cierres: list[float],
        tiene_posicion: bool,
        precio_entrada: float | None,
    ) -> Decision:
        rapida = sma(cierres, self.cfg.sma_rapida)
        lenta = sma(cierres, self.cfg.sma_lenta)
        indice_rsi = rsi(cierres, self.cfg.rsi_periodo)
        precio = cierres[-1]

        if rapida is None or lenta is None or indice_rsi is None:
            return Decision("esperar", "recolectando datos para los indicadores")

        # Gestión de riesgo: tiene prioridad sobre las señales.
        if tiene_posicion and precio_entrada:
            cambio_pct = (precio / precio_entrada - 1.0) * 100.0
            if cambio_pct <= -self.cfg.stop_loss_pct:
                return Decision("vender", f"stop-loss ({cambio_pct:+.2f}%)")
            if cambio_pct >= self.cfg.take_profit_pct:
                return Decision("vender", f"take-profit ({cambio_pct:+.2f}%)")

        separacion_pct = (rapida / lenta - 1.0) * 100.0
        tendencia_previa = self._tendencia
        if separacion_pct >= self.cfg.margen_cruce_pct:
            self._tendencia = "alza"
        elif separacion_pct <= -self.cfg.margen_cruce_pct:
            self._tendencia = "baja"
        cruce_al_alza = tendencia_previa == "baja" and self._tendencia == "alza"
        cruce_a_la_baja = tendencia_previa == "alza" and self._tendencia == "baja"

        if not tiene_posicion and cruce_al_alza:
            if indice_rsi >= self.cfg.rsi_sobrecompra:
                return Decision("esperar", f"cruce al alza pero RSI alto ({indice_rsi:.0f})")
            return Decision("comprar", f"cruce al alza de SMA (RSI {indice_rsi:.0f})")

        if tiene_posicion and cruce_a_la_baja:
            return Decision("vender", "cruce a la baja de SMA")

        estado = "en posición" if tiene_posicion else "fuera del mercado"
        return Decision(
            "esperar",
            f"{estado} | SMA{self.cfg.sma_rapida} {rapida:,.0f} vs "
            f"SMA{self.cfg.sma_lenta} {lenta:,.0f} | RSI {indice_rsi:.0f}",
        )
