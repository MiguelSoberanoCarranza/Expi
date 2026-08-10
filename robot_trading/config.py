"""Configuración del robot de trading."""

from dataclasses import dataclass


@dataclass
class Config:
    # Mercado
    book: str = "btc_mxn"          # Par a operar en Bitso
    capital_inicial: float = 500.0  # Pesos mexicanos con los que arranca el bot

    # Tiempos
    vela_segundos: int = 60         # Cada cuántos segundos se cierra una vela
    poll_segundos: int = 5          # Cada cuántos segundos se consulta el precio

    # Qué estrategia usar: ensemble (default), sma, macd, bollinger, momentum
    estrategia: str = "ensemble"

    # Medias / RSI (compartidos)
    sma_rapida: int = 9
    sma_lenta: int = 21
    rsi_periodo: int = 14
    rsi_sobrecompra: float = 70.0   # No comprar si el RSI está por encima
    rsi_sobreventa: float = 35.0    # Umbral de sobreventa (Bollinger / momentum)
    margen_cruce_pct: float = 0.3   # % mínimo de separación entre SMAs
    velas_compra_pendiente: int = 3

    # MACD
    macd_rapida: int = 12
    macd_lenta: int = 26
    macd_senal: int = 9

    # Bollinger
    boll_periodo: int = 20
    boll_desv: float = 2.0

    # Momentum
    roc_periodo: int = 10
    roc_min_pct: float = 0.8        # ROC mínimo (%) para confirmar momentum

    # Régimen (ADX) y consenso del ensemble
    adx_periodo: int = 14
    adx_tendencia: float = 22.0     # ADX >= esto ⇒ mercado en tendencia
    votos_minimos: int = 2          # Mínimo de estrategias de acuerdo para operar

    # Gestión de riesgo
    stop_loss_pct: float = 3.0
    take_profit_pct: float = 8.0    # Más amplio: deja correr ganadores
    atr_periodo: int = 14
    atr_stop_mult: float = 1.5      # Stop dinámico = max(stop_loss, 1.5·ATR%)
    atr_take_mult: float = 3.0      # Take dinámico = max(take_profit, 3·ATR%)
    colchon_salida_pct: float = 0.4  # Extra sobre comisiones ida+vuelta para salir

    # Costos
    comision_pct: float = 0.65      # Comisión taker aproximada de Bitso

    # Persistencia
    archivo_estado: str = "estado_bot.json"

    # Modo real (dinero de verdad). Por defecto SIEMPRE apagado.
    live: bool = False
