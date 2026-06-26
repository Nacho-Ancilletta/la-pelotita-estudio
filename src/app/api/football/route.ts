import { NextRequest, NextResponse } from "next/server";

const API_BASE = "https://v3.football.api-sports.io";

/**
 * Proxy seguro hacia API-Football.
 * El navegador llama a /api/football?endpoint=standings&league=128&season=2024
 * Este handler agrega la clave de API (que vive solo en el servidor)
 * y devuelve los datos + el contador de cuota restante.
 *
 * La clave NUNCA llega al navegador.
 */
export async function GET(request: NextRequest) {
  const apiKey = process.env.API_FOOTBALL_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "API_FOOTBALL_KEY no configurada en .env.local" },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const endpoint = searchParams.get("endpoint");

  if (!endpoint) {
    return NextResponse.json({ error: "Falta el parámetro 'endpoint'" }, { status: 400 });
  }

  // Reenvía todos los demás query params a la API real
  const forwardParams = new URLSearchParams();
  searchParams.forEach((value, key) => {
    if (key !== "endpoint") forwardParams.append(key, value);
  });

  const url = `${API_BASE}/${endpoint}?${forwardParams.toString()}`;

  try {
    const apiResponse = await fetch(url, {
      headers: {
        "x-apisports-key": apiKey,
      },
      // Desactiva la caché de Next.js para este fetch — la caché la manejamos nosotros
      cache: "no-store",
    });

    const data = await apiResponse.json();

    // Lee la cuota restante del header de la API
    const quotaRemaining = apiResponse.headers.get("x-ratelimit-requests-remaining");

    return NextResponse.json({
      data,
      quotaRemaining: quotaRemaining ? parseInt(quotaRemaining, 10) : null,
    });
  } catch (err) {
    console.error("Error llamando a API-Football:", err);
    return NextResponse.json({ error: "Error de red al llamar a la API" }, { status: 502 });
  }
}
