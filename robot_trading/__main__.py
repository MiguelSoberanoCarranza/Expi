"""Línea de comandos del robot de trading.

Uso:
    python -m robot_trading run                 # correr el bot (simulado)
    python -m robot_trading run --capital 500   # con 500 pesos
    python -m robot_trading backtest            # probar la estrategia
    python -m robot_trading run --live          # dinero REAL (bajo tu riesgo)
"""

import argparse

from .config import Config


def _agregar_flags_comunes(parser: argparse.ArgumentParser) -> None:
    d = Config()
    parser.add_argument("--capital", type=float, default=d.capital_inicial,
                        help=f"Capital inicial en MXN (default {d.capital_inicial:.0f})")
    parser.add_argument("--book", default=d.book,
                        help=f"Par de Bitso a operar (default {d.book})")
    parser.add_argument(
        "--estrategia",
        choices=["ensemble", "sma", "macd", "bollinger", "momentum"],
        default=d.estrategia,
        help="Estrategia a usar (default: ensemble = consenso de varias)",
    )
    parser.add_argument("--sma-rapida", type=int, default=d.sma_rapida)
    parser.add_argument("--sma-lenta", type=int, default=d.sma_lenta)
    parser.add_argument("--rsi", type=int, default=d.rsi_periodo)
    parser.add_argument("--margen", type=float, default=None,
                        help="%% mínimo de separación entre SMAs para confirmar "
                             "un cruce (filtra señales falsas). Por defecto: "
                             "0.3 con velas largas (>=15 min) y 0.05 con velas "
                             "cortas, donde las SMAs se separan mucho menos")
    parser.add_argument("--stop-loss", type=float, default=d.stop_loss_pct,
                        help="%% de pérdida máxima antes de vender")
    parser.add_argument("--take-profit", type=float, default=d.take_profit_pct,
                        help="%% de ganancia para tomar utilidades")
    parser.add_argument("--comision", type=float, default=d.comision_pct,
                        help="%% de comisión por operación")


def _config_desde_args(args: argparse.Namespace) -> Config:
    cfg = Config(
        book=args.book,
        capital_inicial=args.capital,
        estrategia=args.estrategia,
        sma_rapida=args.sma_rapida,
        sma_lenta=args.sma_lenta,
        rsi_periodo=args.rsi,
        stop_loss_pct=args.stop_loss,
        take_profit_pct=args.take_profit,
        comision_pct=args.comision,
    )
    if hasattr(args, "vela"):
        cfg.vela_segundos = args.vela
    if args.margen is not None:
        cfg.margen_cruce_pct = args.margen
    elif hasattr(args, "vela") and cfg.vela_segundos < 900:
        # Solo aplica al comando run: con velas cortas las SMAs se separan
        # mucho menos que con las velas de 1 hora del backtest; el margen por
        # defecto se ajusta para que sí haya señales.
        cfg.margen_cruce_pct = 0.05
    if hasattr(args, "estado"):
        cfg.archivo_estado = args.estado
    if getattr(args, "live", False):
        cfg.live = True
    return cfg


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="robot_trading",
        description="Robot de trading BTC/MXN con modo simulado y backtest.",
    )
    sub = parser.add_subparsers(dest="comando", required=True)

    run = sub.add_parser("run", help="Correr el bot (simulado por default)")
    _agregar_flags_comunes(run)
    run.add_argument("--vela", type=int, default=Config().vela_segundos,
                     help="Segundos por vela (default 60)")
    run.add_argument("--estado", default=Config().archivo_estado,
                     help="Archivo JSON donde se guarda el estado")
    run.add_argument("--live", action="store_true",
                     help="Operar con dinero REAL en Bitso (requiere llaves de API "
                          "y ROBOT_ACEPTO_RIESGO=si)")

    back = sub.add_parser("backtest", help="Probar la estrategia con datos históricos")
    _agregar_flags_comunes(back)
    back.add_argument("--velas", choices=["1h", "1d"], default="1h",
                      help="1h = 30 días de velas por hora (USD); "
                           "1d = 1 año de velas diarias de Bitso (MXN)")
    back.add_argument(
        "--comparar",
        action="store_true",
        help="Compara sma, macd, bollinger, momentum y ensemble lado a lado",
    )

    args = parser.parse_args()
    cfg = _config_desde_args(args)

    if args.comando == "backtest":
        from .backtest import correr_backtest

        correr_backtest(cfg, velas_tipo=args.velas, comparar=args.comparar)
    else:
        from .bot import correr

        try:
            correr(cfg)
        except KeyboardInterrupt:
            print("\nBot detenido. El estado quedó guardado en", cfg.archivo_estado)


if __name__ == "__main__":
    main()
