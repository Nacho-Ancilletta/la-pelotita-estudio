import { NextRequest, NextResponse } from "next/server";

// ESPN expone el mismo dato en hosts distintos según el endpoint — standings
// solo vive en site.web.api.espn.com. Whitelist cerrada, nunca un host libre.
const ESPN_HOSTS: Record<string, string> = {
  site: "https://site.api.espn.com/apis/site/v2/sports/soccer",
  web:  "https://site.web.api.espn.com/apis/v2/sports/soccer",
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const league   = searchParams.get("league");
  const endpoint = searchParams.get("endpoint") ?? "scoreboard";
  const api      = searchParams.get("api") ?? "site";

  if (!league) return NextResponse.json({ error: "Missing league" }, { status: 400 });
  const espnBase = ESPN_HOSTS[api];
  if (!espnBase) return NextResponse.json({ error: "Invalid api" }, { status: 400 });

  const extra = new URLSearchParams(searchParams);
  extra.delete("league");
  extra.delete("endpoint");
  extra.delete("api");
  const qs  = extra.size ? "?" + extra.toString() : "";
  const url = `${espnBase}/${league}/${endpoint}${qs}`;

  try {
    const res  = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; PelotitaEstudio/1.0)" },
      next: { revalidate: 120 },
    });
    if (!res.ok) return NextResponse.json({ error: `ESPN ${res.status}` }, { status: res.status });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "ESPN fetch failed" }, { status: 502 });
  }
}
