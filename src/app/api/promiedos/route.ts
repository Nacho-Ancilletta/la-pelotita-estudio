import { NextRequest, NextResponse } from "next/server";

// Proxy a promiedos.com.ar — mismo patrón que /api/espn (fetch server-side,
// evita CORS). Dos endpoints porque el sitio expone los datos de dos formas
// distintas (investigado a mano, ver src/lib/promiedos.ts para el detalle):
//
// - endpoint=data: la página /league/{slug}/{id} es Next.js SSR — el HTML
//   trae un <script id="__NEXT_DATA__"> con TODA la data ya resuelta
//   (standings completos, goleadores/asistencias completos, partidos de la
//   fecha seleccionada). Se pide esa página y se extrae ese JSON.
// - endpoint=games: la API real que usa el sitio para cambiar de fecha en
//   el selector de partidos. Devuelve JSON directo, sin scraping.
//   https://api.promiedos.com.ar/league/games/{leagueId}/{filterKey}
// - endpoint=team: la página /team/{urlName}/{id} — mismo patrón SSR que
//   endpoint=data, trae pageProps.data.squad (plantel con edad/altura).

const SLUG_RE = /^[a-z0-9\-]+$/;
const ID_RE   = /^[a-z0-9]+$/;
const KEY_RE  = /^[a-z0-9_\-]+$/i; // filterKey: "latest" o algo tipo "72_228_8_5"

function extractNextData(html: string): unknown {
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const endpoint = searchParams.get("endpoint") ?? "data";

  if (endpoint === "data") {
    const slug = searchParams.get("slug");
    const id   = searchParams.get("id");
    if (!slug || !SLUG_RE.test(slug)) return NextResponse.json({ error: "Missing or invalid slug" }, { status: 400 });
    if (!id || !ID_RE.test(id)) return NextResponse.json({ error: "Missing or invalid id" }, { status: 400 });

    try {
      const res = await fetch(`https://www.promiedos.com.ar/league/${slug}/${id}`, {
        headers: { "User-Agent": "curl/8.5.0" },
        next: { revalidate: 300 },
      });
      if (!res.ok) return NextResponse.json({ error: `Promiedos ${res.status}` }, { status: res.status });
      const html = await res.text();
      const nextData = extractNextData(html) as { props?: { pageProps?: { data?: unknown; error?: boolean } } } | null;
      const pageProps = nextData?.props?.pageProps;
      if (!pageProps || pageProps.error || !pageProps.data) {
        return NextResponse.json({ error: "Liga no encontrada en Promiedos" }, { status: 404 });
      }
      return NextResponse.json(pageProps.data);
    } catch {
      return NextResponse.json({ error: "Promiedos fetch failed" }, { status: 502 });
    }
  }

  if (endpoint === "team") {
    const slug = searchParams.get("slug");
    const id   = searchParams.get("id");
    if (!slug || !SLUG_RE.test(slug)) return NextResponse.json({ error: "Missing or invalid slug" }, { status: 400 });
    if (!id || !ID_RE.test(id)) return NextResponse.json({ error: "Missing or invalid id" }, { status: 400 });

    try {
      const res = await fetch(`https://www.promiedos.com.ar/team/${slug}/${id}`, {
        headers: { "User-Agent": "curl/8.5.0" },
        next: { revalidate: 3600 },
      });
      if (!res.ok) return NextResponse.json({ error: `Promiedos ${res.status}` }, { status: res.status });
      const html = await res.text();
      const nextData = extractNextData(html) as { props?: { pageProps?: { data?: unknown; error?: boolean } } } | null;
      const pageProps = nextData?.props?.pageProps;
      if (!pageProps || pageProps.error || !pageProps.data) {
        return NextResponse.json({ error: "Equipo no encontrado en Promiedos" }, { status: 404 });
      }
      return NextResponse.json(pageProps.data);
    } catch {
      return NextResponse.json({ error: "Promiedos fetch failed" }, { status: 502 });
    }
  }

  if (endpoint === "games") {
    const id  = searchParams.get("id");
    const key = searchParams.get("key") ?? "latest";
    if (!id || !ID_RE.test(id)) return NextResponse.json({ error: "Missing or invalid id" }, { status: 400 });
    if (!KEY_RE.test(key)) return NextResponse.json({ error: "Invalid key" }, { status: 400 });

    try {
      const res = await fetch(`https://api.promiedos.com.ar/league/games/${id}/${key}`, {
        headers: { "User-Agent": "curl/8.5.0", "X-VER": "1.11.7.3" },
        next: { revalidate: 60 },
      });
      if (!res.ok) return NextResponse.json({ error: `Promiedos ${res.status}` }, { status: res.status });
      const data = await res.json();
      return NextResponse.json(data);
    } catch {
      return NextResponse.json({ error: "Promiedos fetch failed" }, { status: 502 });
    }
  }

  return NextResponse.json({ error: "Invalid endpoint" }, { status: 400 });
}
