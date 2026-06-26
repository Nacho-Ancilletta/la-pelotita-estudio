import { NextRequest, NextResponse } from "next/server";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const league   = searchParams.get("league");
  const endpoint = searchParams.get("endpoint") ?? "scoreboard";

  if (!league) return NextResponse.json({ error: "Missing league" }, { status: 400 });

  const extra = new URLSearchParams(searchParams);
  extra.delete("league");
  extra.delete("endpoint");
  const qs  = extra.size ? "?" + extra.toString() : "";
  const url = `${ESPN_BASE}/${league}/${endpoint}${qs}`;

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
