"""Bucle principal del robot: consulta el precio, cierra velas, decide y opera."""

import time
from datetime import datetime

from .config import Config
from .market import cierres_para_calentar, precio_actual_bitso
from .portfolio import Portafolio
from .strategy import EstrategiaSMA

MAX_CIERRES = 500  # Velas que se conservan en memoria


def _log(mensaje: str) -> None:
    hora = datetime.now().strftime("%H:%M:%S")
    print(f"[{hora}] {mensaje}", flush=True)


def correr(config: Config) -> None:
    estrategia = EstrategiaSMA(config)
    portafolio = Portafolio(config)

    live = None
    if config.live:
        import os

        if os.environ.get("ROBOT_ACEPTO_RIESGO") != "si":
            raise SystemExit(
                "Modo live bloqueado: define ROBOT_ACEPTO_RIESGO=si si de verdad "
                "quieres operar con dinero real."
            )
        from .bitso_live import BitsoLive

        live = BitsoLive()
        _log("⚠️  MODO LIVE: las órdenes se enviarán a Bitso con dinero REAL.")
    else:
        _log("Modo SIMULADO (paper trading): no se usa dinero real.")

    _log(
        f"Par {config.book} | capital inicial ${config.capital_inicial:,.2f} MXN | "
        f"vela de {config.vela_segundos}s | SMA {config.sma_rapida}/{config.sma_lenta} | "
        f"margen de cruce {config.margen_cruce_pct}% | "
        f"stop-loss {config.stop_loss_pct}% | take-profit {config.take_profit_pct}%"
    )

    # Calentar indicadores con historial para no esperar ~30 min al arrancar.
    cierres: list[float] = []
    try:
        cierres = cierres_para_calentar(config.book, estrategia.minimo_de_velas() + 5)
        _log(f"Indicadores calentados con {len(cierres)} velas históricas.")
    except Exception as e:
        _log(f"No se pudo calentar con historial ({e}); se recolectará en vivo.")

    portafolio.guardar()
    ultimo_precio = precio_actual_bitso(config.book)
    proximo_cierre = time.time() + config.vela_segundos

    _log(
        f"Precio actual: ${ultimo_precio:,.2f} MXN | "
        f"valor del portafolio: ${portafolio.valor_total(ultimo_precio):,.2f} MXN"
    )

    while True:
        try:
            ultimo_precio = precio_actual_bitso(config.book)
        except Exception as e:
            _log(f"Error consultando precio (se reintenta): {e}")
            time.sleep(config.poll_segundos)
            continue

        if time.time() >= proximo_cierre:
            proximo_cierre += config.vela_segundos
            cierres.append(ultimo_precio)
            del cierres[:-MAX_CIERRES]

            decision = estrategia.decidir(
                cierres, portafolio.tiene_posicion, portafolio.precio_entrada
            )

            if decision.accion == "comprar":
                if live:
                    live.comprar_mercado(config.book, portafolio.mxn)
                op = portafolio.comprar(ultimo_precio, decision.motivo)
                _log(
                    f"🟢 COMPRA a ${op['precio']:,.2f} MXN "
                    f"({op['cripto']:.8f} {config.book.split('_')[0].upper()}) — {decision.motivo}"
                )
            elif decision.accion == "vender":
                if live:
                    live.vender_mercado(config.book, portafolio.cripto)
                op = portafolio.vender(ultimo_precio, decision.motivo)
                _log(
                    f"🔴 VENTA a ${op['precio']:,.2f} MXN "
                    f"(resultado {op['ganancia_pct']:+.2f}%) — {decision.motivo}"
                )
            else:
                _log(
                    f"⏳ Espera — {decision.motivo} | precio ${ultimo_precio:,.2f} | "
                    f"portafolio ${portafolio.valor_total(ultimo_precio):,.2f} "
                    f"({portafolio.rendimiento_pct(ultimo_precio):+.2f}%)"
                )

        time.sleep(config.poll_segundos)
