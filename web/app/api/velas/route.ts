import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Cierres recientes de velas de 1 minuto para "calentar" los indicadores al
// arrancar el bot (así no hay que esperar ~30 minutos recolectando datos).
// Usa velas de Kraken (BTC/USD) escaladas al precio actual de Bitso en MXN.
export async function GET(req: NextRequest) {
  const book = req.nextUrl.searchParams.get("book") ?? "btc_mxn";
  const n = Math.min(parseInt(req.nextUrl.searchParams.get("n") ?? "40", 10), 200);
  try {
    const [krakenRes, bitsoRes] = await Promise.all([
      fetch("https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=1", { cache: "no-store" }),
      fetch(`https://api.bitso.com/v3/ticker/?book=${encodeURIComponent(book)}`, { cache: "no-store" }),
    ]);
    const kraken = await krakenRes.json();
    const bitso = await bitsoRes.json();
    if (kraken.error?.length || !bitso.success) {
      return NextResponse.json({ cierres: [] });
    }
    const clave = Object.keys(kraken.result).find((k) => k !== "last")!;
    const cierresUsd: number[] = kraken.result[clave]
      .slice(-n)
      .map((v: string[]) => parseFloat(v[4]));
    if (cierresUsd.length === 0) return NextResponse.json({ cierres: [] });

    const precioMxn = parseFloat(bitso.payload.last);
    const factor = precioMxn / cierresUsd[cierresUsd.length - 1];
    return NextResponse.json({ cierres: cierresUsd.map((c) => c * factor) });
  } catch {
    return NextResponse.json({ cierres: [] });
  }
}
