"""Portafolio simulado (paper trading) con persistencia en JSON."""

import json
import os
from datetime import datetime, timezone

from .config import Config


def _ahora() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


class Portafolio:
    """Lleva la cuenta del dinero (MXN) y la cripto comprada.

    En modo simulado las 'compras' y 'ventas' solo mueven números aquí;
    no se toca dinero real.
    """

    def __init__(self, config: Config):
        self.cfg = config
        self.mxn = config.capital_inicial
        self.cripto = 0.0
        self.precio_entrada: float | None = None
        self.operaciones: list[dict] = []
        self._cargar()

    # ------------------------------------------------------------------
    @property
    def tiene_posicion(self) -> bool:
        return self.cripto > 0

    def valor_total(self, precio: float) -> float:
        return self.mxn + self.cripto * precio

    def rendimiento_pct(self, precio: float) -> float:
        return (self.valor_total(precio) / self.cfg.capital_inicial - 1.0) * 100.0

    # ------------------------------------------------------------------
    def comprar(self, precio: float, motivo: str) -> dict:
        """Compra con todo el MXN disponible (descontando comisión)."""
        if self.mxn <= 0:
            raise RuntimeError("No hay MXN disponible para comprar")
        comision = self.mxn * self.cfg.comision_pct / 100.0
        self.cripto = (self.mxn - comision) / precio
        operacion = {
            "fecha": _ahora(),
            "tipo": "compra",
            "precio": precio,
            "mxn": self.mxn,
            "cripto": self.cripto,
            "comision_mxn": comision,
            "motivo": motivo,
        }
        self.mxn = 0.0
        self.precio_entrada = precio
        self.operaciones.append(operacion)
        self.guardar()
        return operacion

    def vender(self, precio: float, motivo: str) -> dict:
        """Vende toda la posición (descontando comisión)."""
        if self.cripto <= 0:
            raise RuntimeError("No hay cripto para vender")
        bruto = self.cripto * precio
        comision = bruto * self.cfg.comision_pct / 100.0
        ganancia_pct = (precio / self.precio_entrada - 1.0) * 100.0 if self.precio_entrada else 0.0
        operacion = {
            "fecha": _ahora(),
            "tipo": "venta",
            "precio": precio,
            "cripto": self.cripto,
            "mxn": bruto - comision,
            "comision_mxn": comision,
            "ganancia_pct": ganancia_pct,
            "motivo": motivo,
        }
        self.mxn = bruto - comision
        self.cripto = 0.0
        self.precio_entrada = None
        self.operaciones.append(operacion)
        self.guardar()
        return operacion

    # ------------------------------------------------------------------
    def guardar(self) -> None:
        estado = {
            "mxn": self.mxn,
            "cripto": self.cripto,
            "precio_entrada": self.precio_entrada,
            "capital_inicial": self.cfg.capital_inicial,
            "operaciones": self.operaciones,
        }
        with open(self.cfg.archivo_estado, "w") as f:
            json.dump(estado, f, indent=2, ensure_ascii=False)

    def _cargar(self) -> None:
        if not os.path.exists(self.cfg.archivo_estado):
            return
        with open(self.cfg.archivo_estado) as f:
            estado = json.load(f)
        self.mxn = estado.get("mxn", self.mxn)
        self.cripto = estado.get("cripto", 0.0)
        self.precio_entrada = estado.get("precio_entrada")
        self.operaciones = estado.get("operaciones", [])
