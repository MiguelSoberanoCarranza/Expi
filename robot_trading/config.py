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

    # Estrategia (cruce de medias móviles + filtro RSI)
    sma_rapida: int = 9
    sma_lenta: int = 21
    rsi_periodo: int = 14
    rsi_sobrecompra: float = 70.0   # No comprar si el RSI está por encima de esto
    margen_cruce_pct: float = 0.3   # % mínimo de separación entre SMAs para
                                    # confirmar un cruce (filtra señales falsas)

    # Gestión de riesgo
    stop_loss_pct: float = 3.0      # Vender si el precio cae este % desde la entrada
    take_profit_pct: float = 5.0    # Vender si el precio sube este % desde la entrada

    # Costos
    comision_pct: float = 0.65      # Comisión taker aproximada de Bitso

    # Persistencia
    archivo_estado: str = "estado_bot.json"

    # Modo real (dinero de verdad). Por defecto SIEMPRE apagado.
    live: bool = False
