import { NextRequest, NextResponse } from "next/server";

// planetagrandt.com.ar es un blog de Blogger — cada fecha del torneo publica
// un post nuevo (categoría "Estadísticas") con el link a la planilla de esa
// fecha. Se pide el feed Atom/JSON filtrado por esa label, el más reciente
// primero, y se saca el link a docs.google.com/spreadsheets de su HTML.
// Confirmado a mano (ago 2026): el feed vive en www. (planetagrandt.com.ar
// pelado 301-redirige ahí) y los gid de pestaña (ARQ/DEF/VOL/DEL = 20/19/18/17)
// se mantienen estables de una fecha a otra.
const BLOGGER_FEED_URL =
  "https://www.planetagrandt.com.ar/feeds/posts/default/-/Estad%C3%ADsticas?alt=json&max-results=1";

interface BloggerFeedEntry {
  title?: { $t?: string };
  published?: { $t?: string };
  content?: { $t?: string };
  summary?: { $t?: string };
}

async function discoverLatestSheet() {
  const res = await fetch(BLOGGER_FEED_URL, {
    headers: { "User-Agent": "curl/8.5.0" },
    next: { revalidate: 3600 },
  });
  if (!res.ok) return NextResponse.json({ error: `Feed ${res.status}` }, { status: res.status });

  const data = await res.json();
  const entry: BloggerFeedEntry | undefined = data?.feed?.entry?.[0];
  if (!entry) return NextResponse.json({ error: "Sin posts de Estadísticas" }, { status: 404 });

  const html = entry.content?.$t ?? entry.summary?.$t ?? "";
  const match = html.match(/https:\/\/docs\.google\.com\/spreadsheets\/[^"'\s<>]+/);
  if (!match) return NextResponse.json({ error: "El post no trae link de planilla" }, { status: 404 });

  return NextResponse.json({
    sheetUrl: match[0],
    title: entry.title?.$t ?? "",
    published: entry.published?.$t ?? "",
  });
}

// Proxy a la planilla pública de Google Sheets de Gran DT — evita CORS al
// pedirla desde el navegador. Solo reenvía a docs.google.com/spreadsheets/*
// (nunca a un host libre, mismo criterio que el proxy de ESPN) y reconstruye
// la URL del endpoint de hoja individual a partir del pathname + gid, así el
// query/hash que traiga la URL pegada por el usuario no se reenvía tal cual.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  if (searchParams.get("discover") === "1") {
    try {
      return await discoverLatestSheet();
    } catch {
      return NextResponse.json({ error: "Feed fetch failed" }, { status: 502 });
    }
  }

  const pubUrl = searchParams.get("url");
  const gid    = searchParams.get("gid");

  if (!pubUrl) return NextResponse.json({ error: "Missing url" }, { status: 400 });
  if (!gid || !/^-?\d+$/.test(gid)) return NextResponse.json({ error: "Missing or invalid gid" }, { status: 400 });

  let parsed: URL;
  try { parsed = new URL(pubUrl); }
  catch { return NextResponse.json({ error: "URL inválida" }, { status: 400 }); }

  if (parsed.hostname !== "docs.google.com" || !parsed.pathname.startsWith("/spreadsheets/")) {
    return NextResponse.json({ error: "Solo se permiten links de Google Sheets" }, { status: 400 });
  }

  const base = parsed.pathname.replace(/\/pubhtml.*$/, "/pubhtml");
  const sheetUrl = `https://docs.google.com${base}/sheet?headers=false&gid=${gid}`;

  try {
    const res = await fetch(sheetUrl, {
      headers: { "User-Agent": "curl/8.5.0" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return NextResponse.json({ error: `Sheets ${res.status}` }, { status: res.status });
    const html = await res.text();
    return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  } catch {
    return NextResponse.json({ error: "Sheets fetch failed" }, { status: 502 });
  }
}
