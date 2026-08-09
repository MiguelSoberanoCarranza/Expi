# Robot de trading (BTC/MXN)

Robot que arranca con **$500 MXN** y compra/vende Bitcoin solito según el
mercado, usando precios reales de [Bitso](https://bitso.com) (par `btc_mxn`).

> ⚠️ **Importante:** por defecto el bot corre en **modo simulado (paper
> trading)**: usa precios reales pero dinero ficticio. Así puedes ver cómo le
> iría a tus 500 pesos sin arriesgar nada. El trading con dinero real puede
> generar pérdidas; nada de esto es asesoría financiera.

## Cómo funciona

Cada minuto el bot cierra una "vela" con el precio de BTC en pesos y decide:

- **Compra** cuando la media móvil rápida (SMA 9) cruza por encima de la lenta
  (SMA 21) y el RSI no está sobrecomprado (< 70). Señal de tendencia al alza.
- **Vende** cuando la media rápida cruza por debajo de la lenta, **o** si la
  posición pierde 3% (*stop-loss*), **o** si gana 5% (*take-profit*).
- Descuenta una comisión de 0.65% por operación (la taker de Bitso), para que
  la simulación sea realista.

El estado (dinero, posición, historial de operaciones) se guarda en
`estado_bot.json`, así que puedes detener el bot y retomarlo después.

## 🖥️ Versión web (dashboard bonito, lista para Vercel)

En la carpeta [`web/`](web/) hay un dashboard con tema oscuro estilo fintech:
gráfica en vivo del precio con las medias móviles y marcas de compra/venta,
tarjetas de portafolio y rendimiento, historial de operaciones y panel de
configuración. El robot corre en modo simulado directamente en tu navegador
con precios reales de Bitso, y tu progreso se guarda localmente.

```bash
cd web
npm install
npm run dev   # abre http://localhost:3000
```

### Desplegar en Vercel

1. Entra a [vercel.com](https://vercel.com) e importa este repositorio.
2. En **Root Directory** selecciona `web`.
3. Deploy. No necesita variables de entorno ni base de datos.

> El bot corre mientras la pestaña esté abierta (es un simulador en el
> navegador). Para dejarlo corriendo 24/7 usa la versión de Python de abajo
> en una computadora o servidor.

## Instalación (versión Python / terminal)

```bash
pip install -r requirements.txt
```

## Uso

### 1. Probar la estrategia con datos históricos (backtest)

```bash
python -m robot_trading backtest              # últimos 30 días, velas de 1 hora
python -m robot_trading backtest --velas 1d   # último año, velas diarias en MXN
```

Muestra cada compra/venta que habría hecho el bot, el rendimiento final y la
comparación contra solo comprar y aguantar (*buy & hold*).

### 2. Correr el bot en modo simulado (recomendado)

```bash
python -m robot_trading run --capital 500
```

Verás algo así:

```
[10:32:01] Modo SIMULADO (paper trading): no se usa dinero real.
[10:32:01] Par btc_mxn | capital inicial $500.00 MXN | vela de 60s | SMA 9/21 | ...
[10:33:02] ⏳ Espera — fuera del mercado | SMA9 1,113,205 vs SMA21 1,113,890 | RSI 42
[10:47:03] 🟢 COMPRA a $1,112,500.00 MXN (0.00044660 BTC) — cruce al alza de SMA (RSI 55)
```

Detenlo con `Ctrl+C`; el estado queda guardado.

### 3. Modo real (dinero de verdad, bajo tu propio riesgo)

Solo si ya probaste bastante en simulado y aceptas el riesgo:

1. Crea llaves de API en Bitso con permiso de *trading*.
2. Exporta las variables:

```bash
export BITSO_API_KEY="tu_llave"
export BITSO_API_SECRET="tu_secreto"
export ROBOT_ACEPTO_RIESGO=si
python -m robot_trading run --capital 500 --live
```

Sin las tres variables y el flag `--live`, el bot **nunca** toca dinero real.

## Ajustes disponibles

| Opción | Default | Descripción |
|---|---|---|
| `--capital` | 500 | Pesos con los que arranca |
| `--book` | `btc_mxn` | Par de Bitso (ej. `eth_mxn`, `xrp_mxn`) |
| `--vela` | 60 | Segundos por vela |
| `--sma-rapida` / `--sma-lenta` | 9 / 21 | Periodos de las medias móviles |
| `--stop-loss` / `--take-profit` | 3 / 5 | % de pérdida/ganancia para salir |
| `--comision` | 0.65 | % de comisión por operación |

## Advertencias honestas

- Con $500 MXN las comisiones pesan: cada ciclo compra+venta cuesta ~1.3%, así
  que la estrategia necesita movimientos mayores a eso para ganar.
- Ninguna estrategia gana siempre; un buen resultado en backtest no garantiza
  el futuro. Usa el modo simulado un buen rato antes de pensar en `--live`.
- Bitso tiene montos mínimos por orden; con menos de ~100 MXN algunas órdenes
  reales pueden ser rechazadas.
