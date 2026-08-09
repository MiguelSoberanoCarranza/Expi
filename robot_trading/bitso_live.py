"""Órdenes reales en Bitso (SOLO modo live, requiere llaves de API).

ADVERTENCIA: este módulo mueve dinero de verdad. El bot nunca lo usa a menos
que lo ejecutes con --live, tengas las variables de entorno BITSO_API_KEY y
BITSO_API_SECRET, y además ROBOT_ACEPTO_RIESGO=si.
"""

import hashlib
import hmac
import json
import os
import time

import requests

BITSO_API = "https://api.bitso.com"


class BitsoLive:
    def __init__(self):
        self.key = os.environ.get("BITSO_API_KEY", "")
        self.secret = os.environ.get("BITSO_API_SECRET", "")
        if not self.key or not self.secret:
            raise RuntimeError(
                "Faltan BITSO_API_KEY y/o BITSO_API_SECRET en las variables de entorno"
            )

    # ------------------------------------------------------------------
    def _request(self, metodo: str, ruta: str, cuerpo: dict | None = None) -> dict:
        nonce = str(int(time.time() * 1000))
        cuerpo_json = json.dumps(cuerpo) if cuerpo else ""
        mensaje = nonce + metodo + ruta + cuerpo_json
        firma = hmac.new(
            self.secret.encode(), mensaje.encode(), hashlib.sha256
        ).hexdigest()
        headers = {
            "Authorization": f"Bitso {self.key}:{nonce}:{firma}",
            "Content-Type": "application/json",
        }
        r = requests.request(
            metodo,
            BITSO_API + ruta,
            headers=headers,
            data=cuerpo_json or None,
            timeout=15,
        )
        data = r.json()
        if not data.get("success"):
            raise RuntimeError(f"Error de Bitso: {data}")
        return data["payload"]

    # ------------------------------------------------------------------
    def saldo(self) -> dict:
        """Saldos disponibles por moneda, ej. {"mxn": 500.0, "btc": 0.0}."""
        payload = self._request("GET", "/v3/balance/")
        return {
            b["currency"]: float(b["available"]) for b in payload["balances"]
        }

    def comprar_mercado(self, book: str, mxn: float) -> dict:
        """Orden de compra a mercado gastando ``mxn`` pesos."""
        return self._request("POST", "/v3/orders/", {
            "book": book,
            "side": "buy",
            "type": "market",
            "minor": f"{mxn:.2f}",
        })

    def vender_mercado(self, book: str, cripto: float) -> dict:
        """Orden de venta a mercado de ``cripto`` unidades (ej. BTC)."""
        return self._request("POST", "/v3/orders/", {
            "book": book,
            "side": "sell",
            "type": "market",
            "major": f"{cripto:.8f}",
        })
