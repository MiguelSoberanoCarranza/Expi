"""Acceso a datos de mercado: Bitso (precios en MXN) y Kraken (velas históricas)."""

import requests

BITSO_API = "https://api.bitso.com"
BITSO_WEB = "https://bitso.com"
KRAKEN_API = "https://api.kraken.com"

_session = requests.Session()
_session.headers["User-Agent"] = "robot-trading/0.1"


def precio_actual_bitso(book: str = "btc_mxn") -> float:
    """Último precio del par en Bitso (en MXN)."""
    r = _session.get(f"{BITSO_API}/v3/ticker/", params={"book": book}, timeout=10)
    r.raise_for_status()
    data = r.json()
    if not data.get("success"):
        raise RuntimeError(f"Bitso respondió con error: {data}")
    return float(data["payload"]["last"])


def velas_diarias_bitso(book: str = "btc_mxn", periodo: str = "3months") -> list[dict]:
    """Velas diarias históricas de Bitso (en MXN).

    ``periodo`` puede ser: 1month, 3months, 1year.
    Regresa una lista de velas: {"time", "open", "high", "low", "close", "volume"}.
    """
    r = _session.get(f"{BITSO_WEB}/trade/chartJSON/{book}/{periodo}", timeout=15)
    r.raise_for_status()
    velas = []
    for punto in r.json():
        velas.append({
            "time": punto["date"],
            "open": float(punto["open"]),
            "high": float(punto["high"]),
            "low": float(punto["low"]),
            "close": float(punto["close"]),
            "volume": float(punto["volume"]),
        })
    return velas


def velas_kraken(pair: str = "XBTUSD", interval_min: int = 60) -> list[dict]:
    """Velas históricas de Kraken (~720 velas, en USD).

    ``interval_min``: 1, 5, 15, 30, 60, 240, 1440 (minutos por vela).
    """
    r = _session.get(
        f"{KRAKEN_API}/0/public/OHLC",
        params={"pair": pair, "interval": interval_min},
        timeout=15,
    )
    r.raise_for_status()
    data = r.json()
    if data.get("error"):
        raise RuntimeError(f"Kraken respondió con error: {data['error']}")
    resultado = data["result"]
    clave = next(k for k in resultado if k != "last")
    velas = []
    for t, o, h, l, c, _vwap, v, _count in resultado[clave]:
        velas.append({
            "time": t,
            "open": float(o),
            "high": float(h),
            "low": float(l),
            "close": float(c),
            "volume": float(v),
        })
    return velas


def cierres_para_calentar(book: str, n: int) -> list[float]:
    """Cierres recientes de velas de 1 minuto para 'calentar' los indicadores.

    Usa velas de 1 minuto de Kraken (BTC/USD) escaladas al precio actual de
    Bitso en MXN. Solo sirven para no esperar ~30 minutos al arrancar; el bot
    las va reemplazando con velas reales de Bitso conforme corre.
    """
    velas = velas_kraken("XBTUSD", interval_min=1)
    cierres_usd = [v["close"] for v in velas[-n:]]
    if not cierres_usd:
        return []
    precio_mxn = precio_actual_bitso(book)
    factor = precio_mxn / cierres_usd[-1]
    return [c * factor for c in cierres_usd]
