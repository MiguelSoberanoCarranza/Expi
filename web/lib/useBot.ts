"use client";

// Hook que corre el robot en el navegador: consulta el precio, cierra velas,
// decide con la estrategia y lleva el portafolio simulado (paper trading).
// El estado se guarda en localStorage para sobrevivir recargas.

import { useCallback, useEffect, useRef, useState } from "react";
import { CONFIG_DEFAULT, Config, Tendencia, decidir, minimoDeVelas } from "./strategy";

export interface Operacion {
  id: number;
  fecha: number; // epoch ms
  tipo: "compra" | "venta";
  precio: number;
  cripto: number;
  mxn: number;
  comisionMxn: number;
  gananciaPct?: number;
  motivo: string;
}

export interface PuntoGrafica {
  t: number;
  precio: number;
  smaRapida: number | null;
  smaLenta: number | null;
  valor: number;
  compra?: number;
  venta?: number;
}

export interface EstadoBot {
  corriendo: boolean;
  calentado: boolean;
  precio: number | null;
  cambio24Pct: number;
  mxn: number;
  cripto: number;
  precioEntrada: number | null;
  operaciones: Operacion[];
  puntos: PuntoGrafica[];
  ultimoMotivo: string;
  rsi: number | null;
  smaRapida: number | null;
  smaLenta: number | null;
  error: string | null;
  proximaVelaEn: number; // segundos
}

const CLAVE_STORAGE = "robot-trading-estado-v1";
const MAX_PUNTOS = 400;
const MAX_CIERRES = 500;

interface Persistido {
  config: Config;
  mxn: number;
  cripto: number;
  precioEntrada: number | null;
  operaciones: Operacion[];
}

function cargarPersistido(): Persistido | null {
  if (typeof window === "undefined") return null;
  try {
    const crudo = localStorage.getItem(CLAVE_STORAGE);
    return crudo ? (JSON.parse(crudo) as Persistido) : null;
  } catch {
    return null;
  }
}

// Los navegadores frenan los setInterval de pestañas en segundo plano (hasta
// una vez por minuto, o los congelan por completo). Los timers dentro de un
// Web Worker no sufren ese freno, así que el "reloj" del bot vive ahí.
function crearWorkerReloj(): Worker | null {
  if (typeof Worker === "undefined") return null;
  try {
    const codigo =
      "let id=null;onmessage=e=>{clearInterval(id);if(e.data&&e.data.ms)id=setInterval(()=>postMessage(0),e.data.ms);};";
    const url = URL.createObjectURL(new Blob([codigo], { type: "text/javascript" }));
    return new Worker(url);
  } catch {
    return null;
  }
}

interface SentinelaWakeLock {
  release: () => Promise<void>;
}

// Pide al navegador que no apague la pantalla mientras el robot corre
// (Wake Lock API; si el navegador no la soporta, simplemente no hace nada).
async function pedirWakeLock(): Promise<SentinelaWakeLock | null> {
  try {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (tipo: "screen") => Promise<SentinelaWakeLock> };
    };
    if (!nav.wakeLock || document.visibilityState !== "visible") return null;
    return await nav.wakeLock.request("screen");
  } catch {
    return null;
  }
}

export function useBot() {
  const [config, setConfig] = useState<Config>(CONFIG_DEFAULT);
  const [estado, setEstado] = useState<EstadoBot>({
    corriendo: false,
    calentado: false,
    precio: null,
    cambio24Pct: 0,
    mxn: CONFIG_DEFAULT.capitalInicial,
    cripto: 0,
    precioEntrada: null,
    operaciones: [],
    puntos: [],
    ultimoMotivo: "Presiona Iniciar para arrancar el robot",
    rsi: null,
    smaRapida: null,
    smaLenta: null,
    error: null,
    proximaVelaEn: 0,
  });

  // Datos internos que no necesitan re-render por sí mismos.
  const cierresRef = useRef<number[]>([]);
  const tendenciaRef = useRef<Tendencia>(null);
  const velasPendienteRef = useRef(0);
  const proximoCierreRef = useRef<number>(0);
  const ultimoTickRef = useRef<number>(0);
  const configRef = useRef(config);
  const estadoRef = useRef(estado);
  const corriendoRef = useRef(false);
  configRef.current = config;
  estadoRef.current = estado;

  // Restaurar estado guardado al montar.
  useEffect(() => {
    const p = cargarPersistido();
    if (!p) return;
    const cfgGuardada = { ...CONFIG_DEFAULT, ...p.config };
    // Migración: el margen viejo por defecto (0.3%, pensado para velas de
    // 1 hora) es inalcanzable con velas cortas y el robot nunca compraba.
    if (cfgGuardada.margenCrucePct === 0.3 && cfgGuardada.velaSegundos < 900) {
      cfgGuardada.margenCrucePct = CONFIG_DEFAULT.margenCrucePct;
    }
    setConfig(cfgGuardada);
    setEstado((e) => ({
      ...e,
      mxn: p.mxn,
      cripto: p.cripto,
      precioEntrada: p.precioEntrada,
      operaciones: p.operaciones,
      ultimoMotivo:
        p.operaciones.length > 0
          ? "Estado restaurado · presiona Iniciar para continuar"
          : e.ultimoMotivo,
    }));
  }, []);

  const persistir = useCallback((cfg: Config, e: EstadoBot) => {
    try {
      const p: Persistido = {
        config: cfg,
        mxn: e.mxn,
        cripto: e.cripto,
        precioEntrada: e.precioEntrada,
        operaciones: e.operaciones,
      };
      localStorage.setItem(CLAVE_STORAGE, JSON.stringify(p));
    } catch {
      // localStorage lleno o bloqueado: el bot sigue en memoria.
    }
  }, []);

  const tickEnCursoRef = useRef(false);

  const tick = useCallback(async () => {
    if (tickEnCursoRef.current) return;
    tickEnCursoRef.current = true;
    const cfg = configRef.current;
    try {
      const r = await fetch(`/api/ticker?book=${cfg.book}`, { cache: "no-store" });
      if (!r.ok) throw new Error("ticker");
      const t = (await r.json()) as { precio: number; cambio24Pct: number };
      const precio = t.precio;
      const ahora = Date.now();

      // ¿La pestaña estuvo dormida (segundo plano, laptop en reposo)?
      // Si el hueco es grande, las velas viejas ya no sirven: se recalientan
      // los indicadores con historial fresco antes de volver a decidir.
      let mensajeDespertar: string | null = null;
      const ultimoTick = ultimoTickRef.current;
      ultimoTickRef.current = ahora;
      if (ultimoTick && ahora - ultimoTick > Math.max(cfg.velaSegundos * 2, 90) * 1000) {
        const minutos = Math.max(1, Math.round((ahora - ultimoTick) / 60000));
        mensajeDespertar = `El navegador durmió la pestaña ${minutos} min · indicadores recalculados`;
        proximoCierreRef.current = ahora + cfg.velaSegundos * 1000;
        try {
          const n = minimoDeVelas(cfg) + 5;
          const rv = await fetch(`/api/velas?book=${cfg.book}&n=${n}`, { cache: "no-store" });
          const dv = (await rv.json()) as { cierres: number[] };
          if (dv.cierres.length > 0) cierresRef.current = dv.cierres;
        } catch {
          // Sin historial: el bot vuelve a recolectar velas en vivo.
        }
      }

      let nuevoPunto: PuntoGrafica | null = null;
      const cerroVela = ahora >= proximoCierreRef.current;

      if (cerroVela) {
        proximoCierreRef.current += cfg.velaSegundos * 1000;
        // Si la pestaña estuvo dormida mucho tiempo, re-anclar el reloj.
        if (proximoCierreRef.current < ahora) {
          proximoCierreRef.current = ahora + cfg.velaSegundos * 1000;
        }
        cierresRef.current.push(precio);
        if (cierresRef.current.length > MAX_CIERRES) {
          cierresRef.current.splice(0, cierresRef.current.length - MAX_CIERRES);
        }
      }

      setEstado((e) => {
        let { mxn, cripto, precioEntrada, operaciones, ultimoMotivo } = e;
        let rsiActual = e.rsi;
        let smaR = e.smaRapida;
        let smaL = e.smaLenta;
        let compra: number | undefined;
        let venta: number | undefined;

        if (mensajeDespertar) {
          ultimoMotivo = mensajeDespertar;
        }

        if (cerroVela) {
          const { decision, tendencia, velasPendiente } = decidir(
            cfg,
            cierresRef.current,
            tendenciaRef.current,
            velasPendienteRef.current,
            cripto > 0,
            precioEntrada,
          );
          tendenciaRef.current = tendencia;
          velasPendienteRef.current = velasPendiente;
          rsiActual = decision.rsi;
          smaR = decision.smaRapida;
          smaL = decision.smaLenta;
          ultimoMotivo = decision.motivo;

          if (decision.accion === "comprar" && mxn > 0) {
            const comision = (mxn * cfg.comisionPct) / 100;
            cripto = (mxn - comision) / precio;
            operaciones = [
              {
                id: ahora,
                fecha: ahora,
                tipo: "compra",
                precio,
                cripto,
                mxn,
                comisionMxn: comision,
                motivo: decision.motivo,
              },
              ...operaciones,
            ];
            mxn = 0;
            precioEntrada = precio;
            compra = precio;
          } else if (decision.accion === "vender" && cripto > 0) {
            const bruto = cripto * precio;
            const comision = (bruto * cfg.comisionPct) / 100;
            const gananciaPct = precioEntrada ? (precio / precioEntrada - 1) * 100 : 0;
            operaciones = [
              {
                id: ahora,
                fecha: ahora,
                tipo: "venta",
                precio,
                cripto,
                mxn: bruto - comision,
                comisionMxn: comision,
                gananciaPct,
                motivo: decision.motivo,
              },
              ...operaciones,
            ];
            mxn = bruto - comision;
            cripto = 0;
            precioEntrada = null;
            venta = precio;
          }
        }

        const valor = mxn + cripto * precio;
        nuevoPunto = { t: ahora, precio, smaRapida: smaR, smaLenta: smaL, valor, compra, venta };

        const nuevo: EstadoBot = {
          ...e,
          precio,
          cambio24Pct: t.cambio24Pct,
          mxn,
          cripto,
          precioEntrada,
          operaciones,
          ultimoMotivo,
          rsi: rsiActual,
          smaRapida: smaR,
          smaLenta: smaL,
          error: null,
          proximaVelaEn: Math.max(0, Math.round((proximoCierreRef.current - ahora) / 1000)),
          puntos: [...e.puntos, nuevoPunto].slice(-MAX_PUNTOS),
        };
        if (cerroVela) persistir(cfg, nuevo);
        return nuevo;
      });
    } catch {
      setEstado((e) => ({ ...e, error: "Sin conexión con el mercado, reintentando…" }));
    } finally {
      tickEnCursoRef.current = false;
    }
  }, [persistir]);

  // Bucle principal.
  useEffect(() => {
    corriendoRef.current = estado.corriendo;
    if (!estado.corriendo) return;
    const cfg = configRef.current;
    proximoCierreRef.current = Date.now() + cfg.velaSegundos * 1000;
    ultimoTickRef.current = 0;

    let intervalo: ReturnType<typeof setInterval> | null = null;
    let worker: Worker | null = null;
    let cancelado = false;

    // Al volver a la pestaña, disparar un tick inmediato para ponerse al día.
    const alVolver = () => {
      if (document.visibilityState === "visible" && !cancelado) void tick();
    };
    document.addEventListener("visibilitychange", alVolver);

    (async () => {
      // Calentar indicadores con historial (una sola vez por sesión).
      if (cierresRef.current.length < minimoDeVelas(cfg)) {
        try {
          const n = minimoDeVelas(cfg) + 5;
          const r = await fetch(`/api/velas?book=${cfg.book}&n=${n}`, { cache: "no-store" });
          const data = (await r.json()) as { cierres: number[] };
          if (data.cierres.length > 0) {
            cierresRef.current = data.cierres;
            setEstado((e) => ({ ...e, calentado: true }));
          }
        } catch {
          // Sin historial: el bot recolecta velas en vivo.
        }
      } else {
        setEstado((e) => ({ ...e, calentado: true }));
      }
      if (cancelado) return;
      await tick();
      if (cancelado) return;
      // El reloj vive en un Web Worker para que el navegador no lo frene
      // cuando la pestaña queda en segundo plano.
      worker = crearWorkerReloj();
      if (worker) {
        worker.onmessage = () => {
          if (!cancelado) void tick();
        };
        worker.postMessage({ ms: cfg.pollSegundos * 1000 });
      } else {
        intervalo = setInterval(tick, cfg.pollSegundos * 1000);
      }
    })();

    return () => {
      cancelado = true;
      document.removeEventListener("visibilitychange", alVolver);
      if (worker) worker.terminate();
      if (intervalo) clearInterval(intervalo);
    };
  }, [estado.corriendo, tick]);

  // Mantener la pantalla despierta mientras el robot corre (si el navegador
  // lo permite); se vuelve a pedir cada vez que la pestaña regresa al frente.
  useEffect(() => {
    if (!estado.corriendo) return;
    let sentinela: SentinelaWakeLock | null = null;
    let desmontado = false;

    const pedir = async () => {
      sentinela = await pedirWakeLock();
      if (desmontado && sentinela) void sentinela.release().catch(() => {});
    };
    void pedir();

    const alCambiarVisibilidad = () => {
      if (document.visibilityState === "visible") void pedir();
    };
    document.addEventListener("visibilitychange", alCambiarVisibilidad);

    return () => {
      desmontado = true;
      document.removeEventListener("visibilitychange", alCambiarVisibilidad);
      if (sentinela) void sentinela.release().catch(() => {});
    };
  }, [estado.corriendo]);

  const iniciar = useCallback(() => {
    setEstado((e) => ({ ...e, corriendo: true, ultimoMotivo: "Arrancando robot…" }));
  }, []);

  const pausar = useCallback(() => {
    setEstado((e) => {
      const nuevo = { ...e, corriendo: false, ultimoMotivo: "Robot en pausa" };
      persistir(configRef.current, nuevo);
      return nuevo;
    });
  }, [persistir]);

  const reiniciar = useCallback(
    (nuevaConfig?: Partial<Config>) => {
      const cfg = { ...configRef.current, ...nuevaConfig };
      setConfig(cfg);
      cierresRef.current = [];
      tendenciaRef.current = null;
      velasPendienteRef.current = 0;
      const nuevo: EstadoBot = {
        corriendo: false,
        calentado: false,
        precio: estadoRef.current.precio,
        cambio24Pct: estadoRef.current.cambio24Pct,
        mxn: cfg.capitalInicial,
        cripto: 0,
        precioEntrada: null,
        operaciones: [],
        puntos: [],
        ultimoMotivo: "Portafolio reiniciado · presiona Iniciar",
        rsi: null,
        smaRapida: null,
        smaLenta: null,
        error: null,
        proximaVelaEn: 0,
      };
      setEstado(nuevo);
      persistir(cfg, nuevo);
    },
    [persistir],
  );

  const actualizarConfig = useCallback(
    (cambios: Partial<Config>) => {
      setConfig((c) => {
        const nueva = { ...c, ...cambios };
        persistir(nueva, estadoRef.current);
        return nueva;
      });
    },
    [persistir],
  );

  return { estado, config, iniciar, pausar, reiniciar, actualizarConfig };
}
