import { NextResponse } from "next/server";

// Proxy a 365scores.com — mismo patrón que ESPN/Promiedos/fichajes.com
// (fetch server-side, evita CORS). Investigado a mano antes de integrar:
// robots.txt de www.365scores.com permite "/*/league/*" y "/*/player/*"
// explícitamente, sin challenge de Cloudflare ni bloqueo activo. Sin
// robots.txt propio en el subdominio de API (webws.365scores.com, 404),
// sin términos de uso documentados — mismo criterio de cautela que ya se
// aplica a Promiedos/fichajes.com.
//
// La página /es/football/league/liga-profesional-72/stats es una SPA
// (React/mobx) sin datos en el HTML — la data real sale de
// webws.365scores.com/web/stats/, un solo request que trae las 16
// categorías de golpe (Goles, xG, Asistencias, xA, Puntajes 365,
// Barridas ganadas, Intercepciones, Tarjetas, Valla invicta, Goles
// recibidos, Salvadas, Penales, etc.) para TODA la Liga Profesional
// Argentina (competitionId=72). No hay parámetros que vengan del cliente
// — la liga está fija acá mismo, cero superficie de inyección. Probado a
// mano: "limit"/"count"/"top"/"size"/"pageSize"/"num" y filtrar por
// competitorId NO destraban el tope de 20 filas por categoría (15 en
// Penales convertidos, 7 en Penales atajados) — es un límite real de la
// fuente, no de la UI (confirmado directo contra la API, no solo la
// página). La ficha individual del jugador (/player/{slug}-{id}) es la
// MISMA SPA sin datos embebidos — no se encontró un endpoint público de
// perfil individual (se probaron variantes de web/athletes, web/athlete,
// todas 404 o vacías) — por eso no hay fallback por-jugador para esta
// fuente, a diferencia de fichajes.com que sí lo tiene para arqueros.
const URL_365 = "https://webws.365scores.com/web/stats/?langId=29&competitions=72";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function GET() {
  try {
    const res = await fetch(URL_365, { headers: { "User-Agent": UA }, next: { revalidate: 3600 } });
    if (!res.ok) return NextResponse.json({ error: `365scores ${res.status}` }, { status: res.status });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "365scores fetch failed" }, { status: 502 });
  }
}
