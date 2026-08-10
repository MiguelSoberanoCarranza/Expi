"""Backtest: prueba una o varias estrategias con velas históricas."""

from __future__ import annotations

from dataclasses import dataclass

from .config import Config
from .market import velas_diarias_bitso, velas_kraken
from .strategy import crear_estrategia


@dataclass
class ResultadoBacktest:
    nombre: str
    valor_final: float
    rendimiento: float
    buy_hold: float
    operaciones: int
    ventas: int
    ganadas: int
    detalle: list[tuple]


def simular(config: Config, velas: list[dict], nombre: str | None = None) -> ResultadoBacktest:
    """Corre una estrategia sobre ``velas`` y devuelve métricas."""
    estrategia = crear_estrategia(config, nombre)
    nombre = getattr(estrategia, "nombre", nombre or config.estrategia)

    cierres_todos = [v["close"] for v in velas]
    efectivo = config.capital_inicial
    cripto = 0.0
    precio_entrada = None
    operaciones: list[tuple] = []
    ganadas = 0

    minimo = estrategia.minimo_de_velas()
    for i in range(minimo, len(cierres_todos)):
        cierres = cierres_todos[: i + 1]
        precio = cierres[-1]
        decision = estrategia.decidir(cierres, cripto > 0, precio_entrada)

        if decision.accion == "comprar" and cripto == 0:
            comision = efectivo * config.comision_pct / 100.0
            cripto = (efectivo - comision) / precio
            efectivo = 0.0
            precio_entrada = precio
            operaciones.append(("compra", velas[i]["time"], precio, decision.motivo))
        elif decision.accion == "vender" and cripto > 0:
            bruto = cripto * precio
            efectivo = bruto - bruto * config.comision_pct / 100.0
            ganancia = (precio / precio_entrada - 1.0) * 100.0
            if ganancia > 0:
                ganadas += 1
            cripto = 0.0
            precio_entrada = None
            operaciones.append(
                ("venta", velas[i]["time"], precio, f"{decision.motivo} ({ganancia:+.2f}%)")
            )

    precio_final = cierres_todos[-1]
    valor_final = efectivo + cripto * precio_final
    rendimiento = (valor_final / config.capital_inicial - 1.0) * 100.0
    primer_precio = cierres_todos[minimo]
    hold = (precio_final / primer_precio - 1.0) * 100.0
    ventas = sum(1 for op in operaciones if op[0] == "venta")

    return ResultadoBacktest(
        nombre=nombre,
        valor_final=valor_final,
        rendimiento=rendimiento,
        buy_hold=hold,
        operaciones=len(operaciones),
        ventas=ventas,
        ganadas=ganadas,
        detalle=operaciones,
    )


def _cargar_velas(config: Config, velas_tipo: str) -> tuple[list[dict], str, str]:
    if velas_tipo == "1d":
        velas = velas_diarias_bitso(config.book, periodo="1year")
        return velas, "MXN", f"velas diarias de Bitso ({config.book})"
    velas = velas_kraken("XBTUSD", interval_min=60)
    return velas, "USD", "velas de 1 hora de Kraken (BTC/USD, ~30 días)"


def correr_backtest(config: Config, velas_tipo: str = "1h", comparar: bool = False) -> None:
    velas, moneda, descripcion = _cargar_velas(config, velas_tipo)
    if len(velas) < 30:
        raise SystemExit("No hay suficientes velas históricas para el backtest.")

    print(f"Backtest con {len(velas)} {descripcion}")
    print(
        f"Comisión {config.comision_pct}% · stop {config.stop_loss_pct}% · "
        f"take {config.take_profit_pct}% · capital {config.capital_inicial:.0f} {moneda}"
    )
    print("-" * 72)

    nombres = (
        ["sma", "macd", "bollinger", "momentum", "ensemble"]
        if comparar
        else [config.estrategia]
    )

    resultados: list[ResultadoBacktest] = []
    for nombre in nombres:
        resultados.append(simular(config, velas, nombre))

    if comparar:
        print(f"{'Estrategia':<12} {'Rendimiento':>12} {'vs B&H':>10} {'Ops':>6} {'Win':>8}")
        print("-" * 72)
        for r in sorted(resultados, key=lambda x: x.rendimiento, reverse=True):
            win = f"{r.ganadas}/{r.ventas}" if r.ventas else "—"
            print(
                f"{r.nombre:<12} {r.rendimiento:>+11.2f}% "
                f"{r.rendimiento - r.buy_hold:>+9.2f}% "
                f"{r.operaciones:>6} {win:>8}"
            )
        print("-" * 72)
        print(f"Buy & hold de referencia: {resultados[0].buy_hold:+.2f}%")
        mejor = max(resultados, key=lambda x: x.rendimiento)
        print(f"Mejor en este periodo: {mejor.nombre} ({mejor.rendimiento:+.2f}%)")
        return

    r = resultados[0]
    for tipo, fecha, precio, motivo in r.detalle:
        emoji = "🟢" if tipo == "compra" else "🔴"
        print(f"{emoji} {tipo.upper():6s} {fecha} a {precio:,.2f} {moneda} — {motivo}")

    print("-" * 72)
    print(f"Estrategia      : {r.nombre}")
    print(f"Capital inicial : {config.capital_inicial:,.2f} {moneda}")
    print(f"Valor final     : {r.valor_final:,.2f} {moneda}")
    print(f"Rendimiento bot : {r.rendimiento:+.2f}%")
    print(f"Buy & hold      : {r.buy_hold:+.2f}%  (comprar al inicio y no hacer nada)")
    if r.ventas:
        print(f"Operaciones     : {r.operaciones} ({r.ganadas}/{r.ventas} ventas con ganancia)")
    else:
        print("Operaciones     : la estrategia no generó señales en este periodo")
