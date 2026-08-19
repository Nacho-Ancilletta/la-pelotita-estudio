// Ranking Gran DT — parsea la planilla pública de Google Sheets que publica
// planetagrandt.com.ar cada fecha. Estructura real inspeccionada a mano
// (fecha 4, torneo Clausura 2026): documento con pestañas ARQ/DEF/VOL/DEL
// (gid 20/19/18/17), cada una con la misma tabla: fila de encabezado con
// "Jugador" en la primera columna, luego columnas POS, Equipo, Cotización,
// F1..F18 (puntos por fecha), CG/AcG/PrG (stats de un "Gran DT" global que
// en esta planilla viene vacío) y CT/AcT/PrT (stats del torneo actual). El
// ranking real está ordenado por AcT (Puntaje Acumulado en el Torneo) — se
// confirmó comparando con los valores efectivamente cargados en la hoja, no
// por el nombre más obvio de la columna. Se busca el encabezado por nombre
// de columna en vez de por índice fijo porque la cantidad de columnas de
// fecha (F1, F2...) crece semana a semana y correría los índices.

export type GrandTPosition = "ARQ" | "DEF" | "VOL" | "DEL";

export interface GrandTPlayer {
  name: string;
  club: string;
  points: number;
}

export const GRANDT_POSITIONS: { key: GrandTPosition; label: string; gid: string }[] = [
  { key: "ARQ", label: "Arquero",       gid: "20" },
  { key: "DEF", label: "Defensor",      gid: "19" },
  { key: "VOL", label: "Mediocampista", gid: "18" },
  { key: "DEL", label: "Delantero",     gid: "17" },
];

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, "")).trim();
}

function parseSheetHtml(html: string): GrandTPlayer[] {
  const rowsHtml = html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/g) ?? [];
  const rows = rowsHtml.map((r) =>
    (r.match(/<td\b[^>]*>[\s\S]*?<\/td>/g) ?? []).map(stripTags)
  );

  const headerIdx = rows.findIndex((r) => r[0] === "Jugador");
  if (headerIdx === -1) return [];
  const header = rows[headerIdx];
  const nameIdx   = header.indexOf("Jugador");
  const clubIdx   = header.indexOf("Equipo");
  const pointsIdx = header.indexOf("AcT");
  if (nameIdx === -1 || clubIdx === -1 || pointsIdx === -1) return [];

  const players: GrandTPlayer[] = [];
  for (const row of rows.slice(headerIdx + 1)) {
    // Filas de pie de página / vacías traen menos columnas que el header.
    if (row.length < header.length) continue;
    const name = row[nameIdx];
    if (!name) continue;
    const points = parseFloat((row[pointsIdx] || "0").replace(",", "."));
    players.push({ name, club: row[clubIdx] ?? "", points: Number.isFinite(points) ? points : 0 });
  }
  players.sort((a, b) => b.points - a.points);
  return players;
}

export async function getGrandTRanking(sheetUrl: string, position: GrandTPosition): Promise<GrandTPlayer[]> {
  const pos = GRANDT_POSITIONS.find((p) => p.key === position);
  if (!pos) throw new Error("Posición inválida");
  const res = await fetch(`/api/grandt?url=${encodeURIComponent(sheetUrl)}&gid=${pos.gid}`);
  if (!res.ok) throw new Error(`Gran DT ${res.status}`);
  const html = await res.text();
  return parseSheetHtml(html);
}

export interface GrandTLatestSheet {
  sheetUrl: string;
  title: string;
  published: string;
}

// Busca en el proxy el post más reciente de la categoría "Estadísticas" de
// planetagrandt.com.ar y devuelve el link a la planilla de esa fecha. Null
// si el feed falla o no trae el link — quien llama decide el fallback.
export async function getLatestGrandTSheet(): Promise<GrandTLatestSheet | null> {
  try {
    const res = await fetch(`/api/grandt?discover=1`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.sheetUrl) return null;
    return data as GrandTLatestSheet;
  } catch {
    return null;
  }
}
