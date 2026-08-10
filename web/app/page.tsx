"use client";

import Grafica from "@/components/Grafica";
import Historial from "@/components/Historial";
import Panel from "@/components/Panel";
import { mxn, mxnCompacto, pct, cripto as fmtCripto } from "@/lib/formato";
import { useBot } from "@/lib/useBot";

function Tarjeta({
  titulo,
  children,
  className = "",
}: {
  titulo?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`tarjeta ${className}`}>
      {titulo && (
        <h2 className="border-b border-borde/60 px-4 py-3 text-[11px] font-semibold uppercase tracking-widest text-tinta-suave">
          {titulo}
        </h2>
      )}
      {children}
    </section>
  );
}

function Stat({
  etiqueta,
  valor,
  detalle,
  tono = "neutro",
}: {
  etiqueta: string;
  valor: string;
  detalle?: React.ReactNode;
  tono?: "neutro" | "positivo" | "negativo";
}) {
  const color =
    tono === "positivo" ? "text-verde" : tono === "negativo" ? "text-rojo" : "text-tinta";
  return (
    <div className="tarjeta px-4 py-3">
      <p className="text-[11px] uppercase tracking-widest text-tinta-suave">{etiqueta}</p>
      <p className={`mt-1 font-mono text-xl font-semibold ${color}`}>{valor}</p>
      {detalle && <p className="mt-0.5 text-xs text-tinta-suave">{detalle}</p>}
    </div>
  );
}

export default function Home() {
  const { estado, config, iniciar, pausar, reiniciar, actualizarConfig } = useBot();

  const precio = estado.precio;
  const valorTotal = precio !== null ? estado.mxn + estado.cripto * precio : estado.mxn;
  const rendimiento = (valorTotal / config.capitalInicial - 1) * 100;
  const enPosicion = estado.cripto > 0;
  const pnlNoRealizado =
    enPosicion && estado.precioEntrada && precio !== null
      ? (precio / estado.precioEntrada - 1) * 100
      : null;

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 lg:px-8">
      {/* Encabezado */}
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cian/30 to-verde/20 text-xl ring-1 ring-borde">
            🤖
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight">Robot Trader</h1>
            <p className="text-xs text-tinta-suave">
              BTC/MXN · ensemble multi-estrategia ·{" "}
              <span className="font-semibold text-ambar">modo simulado</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {precio !== null && (
            <div className="text-right">
              <p className="font-mono text-xl font-semibold leading-tight">
                {mxnCompacto(precio)}
              </p>
              <p
                className={`font-mono text-xs ${
                  estado.cambio24Pct >= 0 ? "text-verde" : "text-rojo"
                }`}
              >
                {pct(estado.cambio24Pct)} · 24 h
              </p>
            </div>
          )}
          <button
            onClick={estado.corriendo ? pausar : iniciar}
            className={`rounded-xl px-6 py-2.5 text-sm font-bold transition active:scale-95 ${
              estado.corriendo
                ? "bg-rojo/15 text-rojo ring-1 ring-rojo/50 hover:bg-rojo/25"
                : "bg-verde text-[#05261a] shadow-lg shadow-verde/25 hover:brightness-110"
            }`}
          >
            {estado.corriendo ? "⏸ Pausar" : "▶ Iniciar"}
          </button>
        </div>
      </header>

      {/* Barra de estado del robot */}
      <div className="tarjeta mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-xs">
        <span className="flex items-center gap-2">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              estado.corriendo ? "punto-vivo bg-verde" : "bg-tinta-suave/50"
            }`}
          />
          <span className="font-semibold">
            {estado.corriendo ? "Robot activo" : "Robot detenido"}
          </span>
        </span>
        <span className="text-tinta-suave">{estado.error ?? estado.ultimoMotivo}</span>
        {estado.corriendo && (
          <span className="ml-auto flex items-center gap-4 font-mono text-tinta-suave">
            {estado.rsi !== null && <span>RSI {estado.rsi.toFixed(0)}</span>}
            <span>Próxima vela en {estado.proximaVelaEn}s</span>
          </span>
        )}
      </div>

      {/* Tarjetas de resumen */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          etiqueta="Valor del portafolio"
          valor={mxn(valorTotal)}
          detalle={`Capital inicial ${mxn(config.capitalInicial)}`}
          tono={rendimiento > 0.005 ? "positivo" : rendimiento < -0.005 ? "negativo" : "neutro"}
        />
        <Stat
          etiqueta="Rendimiento"
          valor={pct(rendimiento)}
          detalle={`${estado.operaciones.length} operaciones`}
          tono={rendimiento > 0.005 ? "positivo" : rendimiento < -0.005 ? "negativo" : "neutro"}
        />
        <Stat
          etiqueta="Efectivo disponible"
          valor={mxn(estado.mxn)}
          detalle={enPosicion ? "Invertido en BTC" : "Listo para comprar"}
        />
        <Stat
          etiqueta="Posición"
          valor={enPosicion ? `${fmtCripto(estado.cripto)} BTC` : "—"}
          detalle={
            enPosicion && estado.precioEntrada
              ? `Entrada ${mxnCompacto(estado.precioEntrada)}${
                  pnlNoRealizado !== null ? ` · ${pct(pnlNoRealizado)}` : ""
                }`
              : "Sin posición abierta"
          }
          tono={
            pnlNoRealizado === null ? "neutro" : pnlNoRealizado >= 0 ? "positivo" : "negativo"
          }
        />
      </div>

      {/* Gráfica + columna lateral */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Tarjeta className="lg:col-span-2">
          <div className="flex items-center justify-between border-b border-borde/60 px-4 py-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-widest text-tinta-suave">
              Precio y señales
            </h2>
            <div className="flex items-center gap-4 text-[11px] text-tinta-suave">
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded bg-cian" /> Precio
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded bg-verde" /> SMA {config.smaRapida}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded bg-ambar" /> SMA {config.smaLenta}
              </span>
            </div>
          </div>
          <div className="h-[340px] p-2">
            <Grafica puntos={estado.puntos} />
          </div>
        </Tarjeta>

        <div className="flex flex-col gap-4">
          <Tarjeta titulo="Historial de operaciones" className="flex max-h-[240px] min-h-[160px] flex-col">
            <Historial operaciones={estado.operaciones} />
          </Tarjeta>
          <Tarjeta titulo="Configuración">
            <Panel
              config={config}
              corriendo={estado.corriendo}
              onCambio={actualizarConfig}
              onReiniciar={() => reiniciar()}
            />
          </Tarjeta>
        </div>
      </div>

      <footer className="mt-8 text-center text-[11px] leading-relaxed text-tinta-suave">
        El robot trabaja mientras esta pestaña siga abierta; si el navegador la
        duerme o la computadora entra en reposo, se pone al día solito al
        despertar. Para operar 24/7 usa la versión de terminal (Python) en un
        servidor.
        <br />
        Simulador educativo con dinero ficticio y precios reales · No es asesoría
        financiera · El trading con dinero real puede generar pérdidas.
      </footer>
    </main>
  );
}
