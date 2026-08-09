"""Backtest: prueba la estrategia con velas históricas antes de usarla en vivo."""

from .config import Config
from .market import velas_diarias_bitso, velas_kraken
from .strategy import EstrategiaSMA


def correr_backtest(config: Config, velas_tipo: str = "1h") -> None:
    if velas_tipo == "1d":
        velas = velas_diarias_bitso(config.book, periodo="1year")
        moneda = "MXN"
        descripcion = f"velas diarias de Bitso ({config.book})"
    else:
        velas = velas_kraken("XBTUSD", interval_min=60)
        moneda = "USD"
        descripcion = "velas de 1 hora de Kraken (BTC/USD, ~30 días)"

    cierres_todos = [v["close"] for v in velas]
    if len(cierres_todos) < 30:
        raise SystemExit("No hay suficientes velas históricas para el backtest.")

    print(f"Backtest con {len(velas)} {descripcion}")
    print(
        f"Estrategia: SMA {config.sma_rapida}/{config.sma_lenta}, RSI {config.rsi_periodo}, "
        f"stop-loss {config.stop_loss_pct}%, take-profit {config.take_profit_pct}%, "
        f"comisión {config.comision_pct}% por operación"
    )
    print("-" * 72)

    estrategia = EstrategiaSMA(config)
    efectivo = config.capital_inicial
    cripto = 0.0
    precio_entrada = None
    operaciones = []
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
            operaciones.append(("venta", velas[i]["time"], precio, f"{decision.motivo} ({ganancia:+.2f}%)"))

    precio_final = cierres_todos[-1]
    valor_final = efectivo + cripto * precio_final
    rendimiento = (valor_final / config.capital_inicial - 1.0) * 100.0

    # Comparación con solo comprar y aguantar (buy & hold)
    primer_precio = cierres_todos[minimo]
    hold = (precio_final / primer_precio - 1.0) * 100.0

    for tipo, fecha, precio, motivo in operaciones:
        emoji = "🟢" if tipo == "compra" else "🔴"
        print(f"{emoji} {tipo.upper():6s} {fecha} a {precio:,.2f} {moneda} — {motivo}")

    ventas = sum(1 for op in operaciones if op[0] == "venta")
    print("-" * 72)
    print(f"Capital inicial : {config.capital_inicial:,.2f} {moneda}")
    print(f"Valor final     : {valor_final:,.2f} {moneda}")
    print(f"Rendimiento bot : {rendimiento:+.2f}%")
    print(f"Buy & hold      : {hold:+.2f}%  (comprar al inicio y no hacer nada)")
    if ventas:
        print(f"Operaciones     : {len(operaciones)} ({ganadas}/{ventas} ventas con ganancia)")
    else:
        print("Operaciones     : la estrategia no generó señales en este periodo")
