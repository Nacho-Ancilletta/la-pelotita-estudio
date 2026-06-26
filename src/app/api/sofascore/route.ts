import { NextRequest, NextResponse } from "next/server";

const SFS_BASE = "https://api.sofascore.com/api/v1";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path");

  if (!path) return NextResponse.json({ error: "Missing path" }, { status: 400 });

  const extra = new URLSearchParams(searchParams);
  extra.delete("path");
  const qs  = extra.size ? "?" + extra.toString() : "";
  const url = `${SFS_BASE}/${path}${qs}`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Referer":    "https://www.sofascore.com/",
        "Accept":     "application/json, text/plain, */*",
      },
    });
    if (!res.ok) return NextResponse.json({ error: `Sofascore ${res.status}` }, { status: res.status });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Sofascore fetch failed" }, { status: 502 });
  }
}
