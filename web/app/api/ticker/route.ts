import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Proxy del ticker de Bitso: el navegador no puede llamarlo directo por CORS.
export async function GET(req: NextRequest) {
  const book = req.nextUrl.searchParams.get("book") ?? "btc_mxn";
  try {
    const r = await fetch(`https://api.bitso.com/v3/ticker/?book=${encodeURIComponent(book)}`, {
      cache: "no-store",
    });
    const data = await r.json();
    if (!data.success) {
      return NextResponse.json({ error: "Bitso respondió con error" }, { status: 502 });
    }
    const p = data.payload;
    const last = parseFloat(p.last);
    const change24 = parseFloat(p.change_24);
    const precioHace24h = last - change24;
    return NextResponse.json({
      precio: last,
      cambio24Pct: precioHace24h > 0 ? (change24 / precioHace24h) * 100 : 0,
      maximo24: parseFloat(p.high),
      minimo24: parseFloat(p.low),
      volumen24: parseFloat(p.volume),
      hora: p.created_at,
    });
  } catch {
    return NextResponse.json({ error: "No se pudo consultar Bitso" }, { status: 502 });
  }
}
