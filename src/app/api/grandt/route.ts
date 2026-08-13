import { NextRequest, NextResponse } from "next/server";

// Proxy a la planilla pública de Google Sheets de Gran DT — evita CORS al
// pedirla desde el navegador. Solo reenvía a docs.google.com/spreadsheets/*
// (nunca a un host libre, mismo criterio que el proxy de ESPN) y reconstruye
// la URL del endpoint de hoja individual a partir del pathname + gid, así el
// query/hash que traiga la URL pegada por el usuario no se reenvía tal cual.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
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
