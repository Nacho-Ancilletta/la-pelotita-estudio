import { NextRequest, NextResponse } from "next/server";

// Proxy a la API pública de Fantasy Premier League — evita CORS al pedirla
// desde el navegador. A diferencia de ESPN (Akamai) no exige user-agent
// especial, confirmado a mano. Dos endpoints, ambos de solo lectura:
// - bootstrap: jugadores, equipos y posiciones de toda la temporada
//   (https://fantasy.premierleague.com/api/bootstrap-static/).
// - fixtures: calendario de partidos aún no jugados, usado para resolver el
//   próximo rival de cada equipo (?future=1 ya viene ordenado por fecha).
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const endpoint = searchParams.get("endpoint") ?? "bootstrap";

  const url =
    endpoint === "fixtures" ? "https://fantasy.premierleague.com/api/fixtures/?future=1"
    : endpoint === "bootstrap" ? "https://fantasy.premierleague.com/api/bootstrap-static/"
    : null;

  if (!url) return NextResponse.json({ error: "Invalid endpoint" }, { status: 400 });

  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return NextResponse.json({ error: `FPL ${res.status}` }, { status: res.status });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "FPL fetch failed" }, { status: 502 });
  }
}
