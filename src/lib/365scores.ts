// 365scores.com — cuarta fuente, se suma a Promiedos/ESPN/fichajes.com
// sin reemplazar ninguna (ver src/app/api/365scores/route.ts para el
// detalle de la investigación). Un solo request trae las 16 categorías
// de golpe para toda la Liga Profesional Argentina — no hace falta loop
// con delays entre pedidos como en fichajes.com.
//
// OJO — unidades mezcladas dentro de la misma fuente, confirmado a mano
// contra la respuesta real: "Goles esperados"/"Asistencias esperadas"/
// "Puntajes 365"/tarjetas/"Valla invicta" son TOTALES de temporada
// (números enteros o con la escala de un total real), pero "Barridas
// ganadas", "Intercepciones", "Goles recibidos" y "Salvadas" son
// PROMEDIOS POR PARTIDO (ej. Goles recibidos líder = "0.2" — un total no
// puede ser decimal). fichajes.com, en cambio, SIEMPRE trae totales de
// temporada (columna "Total" de su tabla). Por eso los campos de 365scores
// que son promedios NO se mezclan con los campos ya existentes de
// fichajes.com (duelsWon/interceptions/saves/goalsConceded, todos
// totales) — se guardan aparte con sufijo "PerGame365" y se muestran en
// una fila propia, aclarando "(por partido)". Solo tarjetas/vallas
// invictas (mismas unidades, totales de temporada en ambas fuentes) se
// usan como fallback silencioso de los campos ya existentes.
export interface Scores365PlayerStats {
  name: string;
  nameForURL: string;
  xg: number | null;              // Goles esperados (temporada)
  xa: number | null;              // Asistencias esperadas (temporada)
  rating365: number | null;       // Puntajes 365 (promedio de rendimiento)
  duelsWonPerGame365: number | null;      // Barridas ganadas POR PARTIDO
  interceptionsPerGame365: number | null; // Intercepciones POR PARTIDO
  savesPerGame365: number | null;         // Salvadas POR PARTIDO (arquero)
  goalsConcededPerGame365: number | null; // Goles recibidos POR PARTIDO (arquero)
  yellowCards: number | null;     // Tarjetas Amarillas (temporada — mismo total que fichajes.com)
  redCards: number | null;        // Tarjetas Rojas (temporada)
  cleanSheets: number | null;     // Valla invicta (temporada, arquero)
}

// id de cada categoría en stats.athletesStats[], confirmado a mano contra
// la respuesta real de web/stats/ (ago 2026) — no hay endpoint que liste
// los ids con nombre, se mapearon leyendo el campo "name" de cada uno.
const CATEGORY_FIELD: Record<number, keyof Scores365PlayerStats> = {
  2: "xg",
  4: "xa",
  7: "rating365",
  9: "duelsWonPerGame365",
  10: "interceptionsPerGame365",
  11: "redCards",
  12: "yellowCards",
  13: "cleanSheets",
  14: "goalsConcededPerGame365",
  15: "savesPerGame365",
};

function cacheGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "data" in parsed && "ts" in parsed) {
      const { data, ts, ttlMs } = parsed as { data: T; ts: number; ttlMs?: number };
      if (ttlMs != null && Date.now() - ts > ttlMs) return null;
      return data;
    }
    return parsed as T;
  } catch { return null; }
}
function cacheSet(key: string, d: unknown, ttlMs?: number) {
  localStorage.setItem(key, JSON.stringify({ data: d, ts: Date.now(), ttlMs }));
}
const STATS_TTL_MS = 24 * 60 * 60 * 1000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface Score365Row { entity: { name: string; nameForURL: string }; stats: any[]; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface Score365Category { id: number; rows: any[]; }

export async function getScores365Data(): Promise<Map<string, Scores365PlayerStats>> {
  const key = "pelotita_365scores_data_v1";
  const cached = cacheGet<Record<string, Scores365PlayerStats>>(key);
  if (cached) return new Map(Object.entries(cached));

  const byId = new Map<string, Scores365PlayerStats>();
  function ensure(name: string, nameForURL: string): Scores365PlayerStats {
    let p = byId.get(nameForURL);
    if (!p) {
      p = {
        name, nameForURL, xg: null, xa: null, rating365: null,
        duelsWonPerGame365: null, interceptionsPerGame365: null,
        savesPerGame365: null, goalsConcededPerGame365: null,
        yellowCards: null, redCards: null, cleanSheets: null,
      };
      byId.set(nameForURL, p);
    }
    return p;
  }

  try {
    const res = await fetch(`/api/365scores`);
    if (!res.ok) { cacheSet(key, {}, STATS_TTL_MS); return byId; }
    const data = await res.json();
    const categories: Score365Category[] = data?.stats?.athletesStats ?? [];
    for (const cat of categories) {
      const field = CATEGORY_FIELD[cat.id];
      if (!field) continue; // categoría que no usamos (Goles/Asistencias/combinados/penales — ya cubiertos por Promiedos/fichajes)
      for (const row of cat.rows as Score365Row[]) {
        const p = ensure(row.entity.name, row.entity.nameForURL);
        const raw = row.stats?.[0]?.value; // stats[0] es siempre el valor primario de la categoría, confirmado a mano
        const value = raw != null ? parseFloat(String(raw).replace(",", ".")) : NaN;
        if (Number.isFinite(value)) (p[field] as number | null) = value;
      }
    }
  } catch {
    // sin datos — cachea vacío igual (24hs) para no reintentar en cada búsqueda
  }

  cacheSet(key, Object.fromEntries(byId), STATS_TTL_MS);
  return byId;
}
