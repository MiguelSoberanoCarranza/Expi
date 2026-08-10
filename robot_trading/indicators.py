"""Indicadores técnicos compartidos por las estrategias."""

from __future__ import annotations


def sma(valores: list[float], periodo: int) -> float | None:
    if len(valores) < periodo:
        return None
    return sum(valores[-periodo:]) / periodo


def ema(valores: list[float], periodo: int) -> float | None:
    """EMA clásica; usa SMA del primer tramo como semilla."""
    if len(valores) < periodo:
        return None
    k = 2.0 / (periodo + 1)
    e = sum(valores[:periodo]) / periodo
    for v in valores[periodo:]:
        e = v * k + e * (1.0 - k)
    return e


def rsi(valores: list[float], periodo: int = 14) -> float | None:
    """RSI de Wilder (suavizado exponencial)."""
    if len(valores) < periodo + 1:
        return None
    ganancias = 0.0
    perdidas = 0.0
    for i in range(1, periodo + 1):
        cambio = valores[i] - valores[i - 1]
        if cambio >= 0:
            ganancias += cambio
        else:
            perdidas -= cambio
    avg_gain = ganancias / periodo
    avg_loss = perdidas / periodo
    for i in range(periodo + 1, len(valores)):
        cambio = valores[i] - valores[i - 1]
        gain = max(cambio, 0.0)
        loss = max(-cambio, 0.0)
        avg_gain = (avg_gain * (periodo - 1) + gain) / periodo
        avg_loss = (avg_loss * (periodo - 1) + loss) / periodo
    if avg_loss == 0:
        return 50.0 if avg_gain == 0 else 100.0
    rs = avg_gain / avg_loss
    return 100.0 - 100.0 / (1.0 + rs)


def macd(
    valores: list[float],
    rapida: int = 12,
    lenta: int = 26,
    senal: int = 9,
) -> tuple[float | None, float | None, float | None]:
    """Devuelve (macd_line, signal_line, histograma)."""
    minimo = lenta + senal
    if len(valores) < minimo:
        return None, None, None
    # Serie de EMA rápida/lenta para construir el histograma con señal EMA.
    k_r = 2.0 / (rapida + 1)
    k_l = 2.0 / (lenta + 1)
    e_r = sum(valores[:rapida]) / rapida
    e_l = sum(valores[:lenta]) / lenta
    # Avanzar ambas hasta el índice lenta-1 con la misma semilla parcial.
    for v in valores[rapida:lenta]:
        e_r = v * k_r + e_r * (1.0 - k_r)
    linea_macd: list[float] = []
    for v in valores[lenta:]:
        e_r = v * k_r + e_r * (1.0 - k_r)
        e_l = v * k_l + e_l * (1.0 - k_l)
        linea_macd.append(e_r - e_l)
    if len(linea_macd) < senal:
        return None, None, None
    k_s = 2.0 / (senal + 1)
    sig = sum(linea_macd[:senal]) / senal
    for m in linea_macd[senal:]:
        sig = m * k_s + sig * (1.0 - k_s)
    macd_line = linea_macd[-1]
    hist = macd_line - sig
    return macd_line, sig, hist


def bollinger(
    valores: list[float], periodo: int = 20, desv: float = 2.0
) -> tuple[float | None, float | None, float | None]:
    """Devuelve (media, banda_superior, banda_inferior)."""
    if len(valores) < periodo:
        return None, None, None
    ventana = valores[-periodo:]
    media = sum(ventana) / periodo
    varianza = sum((x - media) ** 2 for x in ventana) / periodo
    std = varianza ** 0.5
    return media, media + desv * std, media - desv * std


def atr_aprox(valores: list[float], periodo: int = 14) -> float | None:
    """ATR aproximado usando solo cierres (|Δclose| suavizado)."""
    if len(valores) < periodo + 1:
        return None
    trs = [abs(valores[i] - valores[i - 1]) for i in range(1, len(valores))]
    atr = sum(trs[:periodo]) / periodo
    for tr in trs[periodo:]:
        atr = (atr * (periodo - 1) + tr) / periodo
    return atr


def adx_aprox(valores: list[float], periodo: int = 14) -> float | None:
    """ADX aproximado con solo cierres (fuerza de tendencia 0-100)."""
    if len(valores) < periodo * 2 + 1:
        return None
    plus_dm: list[float] = []
    minus_dm: list[float] = []
    tr: list[float] = []
    for i in range(1, len(valores)):
        up = valores[i] - valores[i - 1]
        down = valores[i - 1] - valores[i]
        plus_dm.append(up if up > down and up > 0 else 0.0)
        minus_dm.append(down if down > up and down > 0 else 0.0)
        tr.append(abs(up))
    def wilder(series: list[float]) -> list[float]:
        out = [sum(series[:periodo]) / periodo]
        for x in series[periodo:]:
            out.append((out[-1] * (periodo - 1) + x) / periodo)
        return out
    atr_s = wilder(tr)
    plus_s = wilder(plus_dm)
    minus_s = wilder(minus_dm)
    dx: list[float] = []
    for a, p, m in zip(atr_s, plus_s, minus_s):
        if a == 0:
            dx.append(0.0)
            continue
        di_p = 100.0 * p / a
        di_m = 100.0 * m / a
        s = di_p + di_m
        dx.append(0.0 if s == 0 else 100.0 * abs(di_p - di_m) / s)
    if len(dx) < periodo:
        return None
    adx = sum(dx[:periodo]) / periodo
    for x in dx[periodo:]:
        adx = (adx * (periodo - 1) + x) / periodo
    return adx
