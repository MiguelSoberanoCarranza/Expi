# Robot de trading (BTC/MXN) — ensemble multi-estrategia

Robot que arranca con **$500 MXN** y compra/vende Bitcoin solito según el
mercado, usando precios reales de [Bitso](https://bitso.com) (par `btc_mxn`).

Combina varias estrategias clásicas (SMA+RSI, MACD, Bollinger, Momentum) en un
**ensemble con voto ponderado** y detección de régimen (alcista / lateral /
bajista), pensado para sobrevivir a la comisión real de Bitso (~0.65% por lado).

> ⚠️ **Importante:** por defecto el bot corre en **modo simulado (paper
> trading)**: usa precios reales pero dinero ficticio. Así puedes ver cómo le
> iría a tus 500 pesos sin arriesgar nada. El trading con dinero real puede
> generar pérdidas; nada de esto es asesoría financiera.

## Cómo funciona el ensemble

Cada vela, cuatro estrategias votan `comprar` / `vender` / `esperar`:

| Estrategia | Idea | Peso |
|---|---|---|
| **MACD** | Cruce del histograma (motor principal) | 2 |
| **SMA + RSI** | Cruce de medias con filtro de sobrecompra | 1 |
| **Momentum** | Precio sobre EMA + ROC positivo | 1 |
| **Bollinger** | Rebote en banda inferior (solo confirma) | +1 bonus |

Se opera cuando el **score ≥ 2** (MACD solo ya alcanza). Además:

- Detecta el régimen con ADX + sesgo de EMAs.
- En bajista fuerte solo escucha al MACD (evita que SMA/momentum compren
  rallies falsos).
- Bollinger **no abre solo** (en bears de crypto “comprar la caída” destruye
  capital); solo suma si ya hay otra señal.
- Las salidas por señal exigen cubrir comisión ida+vuelta + un colchón.
- Stop-loss fijo (default 3%) y take-profit ampliable con ATR (default 8%).

### Resultado del backtest (referencia)

Con comisión 0.65%, capital 500, sobre ~1 año de velas diarias Bitso (`btc_mxn`):

| Estrategia | Rendimiento | vs buy & hold (−46%) |
|---|---|---|
| **ensemble / MACD** | **+5.7%** | +54 pts |
| momentum | −22% | |
| sma (anterior) | −30% | |
| bollinger | −48% | |

En un mes lateral de velas de 1 h nadie gana mucho: el ensemble empató con
MACD (~−5%). Un buen backtest **no garantiza** el futuro.

## 🖥️ Versión web (dashboard, lista para Vercel)

En la carpeta [`web/`](web/) hay un dashboard con tema oscuro estilo fintech:
gráfica en vivo, portafolio, historial y selector de estrategia. El robot corre
en modo simulado en tu navegador con precios reales de Bitso.

```bash
cd web
npm install
npm run dev   # abre http://localhost:3000
```

### Desplegar en Vercel

1. Entra a [vercel.com](https://vercel.com) e importa este repositorio.
2. En **Root Directory** selecciona `web`.
3. Deploy. No necesita variables de entorno ni base de datos.

> **¿Por qué se detiene si lo dejo solo?** El robot web vive en la pestaña.
> Usa la versión Python abajo para operar 24/7 en un servidor.

## Instalación (versión Python / terminal)

```bash
pip install -r requirements.txt
```

## Uso

### 1. Backtest (una estrategia o comparación)

```bash
python -m robot_trading backtest                      # ensemble, velas 1h
python -m robot_trading backtest --velas 1d           # 1 año Bitso MXN
python -m robot_trading backtest --comparar --velas 1d
python -m robot_trading backtest --estrategia macd
```

### 2. Correr el bot en modo simulado (recomendado)

```bash
python -m robot_trading run --capital 500
python -m robot_trading run --estrategia ensemble
```

Detenlo con `Ctrl+C`; el estado queda en `estado_bot.json`.

### 3. Modo real (dinero de verdad, bajo tu propio riesgo)

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
| `--estrategia` | `ensemble` | `ensemble`, `macd`, `sma`, `momentum`, `bollinger` |
| `--capital` | 500 | Pesos con los que arranca |
| `--book` | `btc_mxn` | Par de Bitso |
| `--vela` | 60 | Segundos por vela |
| `--sma-rapida` / `--sma-lenta` | 9 / 21 | Periodos de las medias |
| `--stop-loss` / `--take-profit` | 3 / 8 | % de pérdida/ganancia para salir |
| `--comision` | 0.65 | % de comisión por operación |

## Advertencias honestas

- Con $500 MXN las comisiones pesan: cada ciclo compra+venta cuesta ~1.3%.
- Ninguna estrategia gana siempre; el ensemble mejora el historial frente a
  SMA sola, pero puede perder en mercados laterales o con gaps.
- Usa el modo simulado un buen rato antes de pensar en `--live`.
- Bitso tiene montos mínimos por orden; con menos de ~100 MXN algunas órdenes
  reales pueden ser rechazadas.
