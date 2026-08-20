import { NextRequest, NextResponse } from "next/server";

// Proxy a fichajes.com — mismo patrón que ESPN/Promiedos/Gran DT (fetch
// server-side, evita CORS). Investigado a mano antes de integrar:
// robots.txt permite todo ("User-agent: * / Allow: /"), sin challenge de
// Cloudflare ni bloqueo activo — a diferencia de FBref/Understat, que sí
// se descartaron por eso. No hay términos de uso explícitos documentados
// (mismo criterio de cautela que ya se aplica a Promiedos, que tampoco
// los tiene). Dos modos:
// - ?category=slug  → tabla de ranking de una estadística (ej.
//   "minutos-disputados") para /argentina/primera-division/
//   estadistica-jugadores/{slug}.
// - ?player=slug    → ficha individual de un jugador (para resolver
//   equipo y foto de arqueros, que no vienen en las tablas de ranking).
const BASE = "https://www.fichajes.com";
const SLUG_RE = /^[a-z0-9-]+$/;
// UA de navegador real — confirmado a mano que fichajes.com responde 200
// con esto (a diferencia de ESPN/Akamai, que exige lo opuesto, un UA
// tipo curl).
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const player = searchParams.get("player");

  let url: string;
  if (category) {
    if (!SLUG_RE.test(category)) return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    url = `${BASE}/argentina/primera-division/estadistica-jugadores/${category}`;
  } else if (player) {
    if (!SLUG_RE.test(player)) return NextResponse.json({ error: "Invalid player" }, { status: 400 });
    url = `${BASE}/jugador/${player}/`;
  } else {
    return NextResponse.json({ error: "Missing category or player" }, { status: 400 });
  }

  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, next: { revalidate: 3600 } });
    if (!res.ok) return NextResponse.json({ error: `fichajes ${res.status}` }, { status: res.status });
    const html = await res.text();
    return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  } catch {
    return NextResponse.json({ error: "fichajes fetch failed" }, { status: 502 });
  }
}
