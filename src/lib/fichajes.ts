// fichajes.com — tercera fuente, SOLO para lo que Promiedos/ESPN no
// exponen por jugador: minutos, partidos, tarjetas, paradas. Goles/
// asistencias siguen viniendo de Promiedos (fuente principal para eso,
// sin tocar). Vallas invictas de arquero ya NO sale de acá — el archivo
// manual src/data/refuerzo-magico-data-2026.json trae una lista más
// confiable (FootyStats, "cleanSheetsGoalkeepers").
//
// Investigación previa (confirmada a mano antes de integrar, ago 2026):
// robots.txt de fichajes.com permite todo, sin bloqueo/challenge activo
// detectado. Sin términos de uso explícitos documentados — mismo criterio
// de cautela que ya se aplica a Promiedos (tampoco los tiene). Cada
// categoría (/estadistica-jugadores/{slug}) es una tabla server-rendered
// de 4 columnas (#, jugador+link, Total, por partido) — SIN paginación
// real (el único "pagination" del HTML es del feed de noticias lateral,
// no de la tabla). "Total" (columna 3) es lo que se usa acá.
//
// El link de cada jugador (/jugador/{slug}/) no trae equipo en la tabla
// de ranking — para outfield no hace falta (el equipo sale de Promiedos,
// cruzando por apellido), pero para ARQUERO sí hace falta pedir la ficha
// individual del jugador (confirmado que la trae: <a href=".../equipo/
// ..."> con el nombre del club). Esa misma ficha trae también la foto
// real del jugador (data-src de assets-es.imgfoot.com/.../portrait/
// {slug}.png) — para jugadores de campo no hace falta pedir la ficha
// para esto, el mismo patrón de URL se arma directo con el slug que ya
// viene en la tabla de ranking (ver photoUrlFromSlug).

// "porteria-a-cero" (vallas invictas de arquero) ya NO se pide acá — el
// archivo manual src/data/refuerzo-magico-data-2026.json trae
// "cleanSheetsGoalkeepers" (FootyStats) como fuente priorizada para eso
// (pedido explícito: más confiable que la tabla equivalente de esta
// fuente, que en su nota propia advierte que puede mezclar jugadores de
// campo a partir del 2° puesto).
const CATEGORY_SLUGS = {
  minutes: "minutos-disputados",
  matches: "partidos-disputados",
  saves: "paradas-realizadas",
  yellowCards: "tarjetas-amarillas",
  redCardsDirect: "tarjetas-rojas-directas",
  redCardsDouble: "tarjetas-rojas-por-dos-amarillas",
  // Avanzadas por posición (ago 2026) — se piden todas siempre (un solo
  // pool combinado cacheado 24hs, igual que las de arriba) aunque cada
  // ficha solo muestre las que le corresponden a su posición (ver
  // statRows() en RefuerzoMagicoTab.tsx). Mismas ~20-44 filas de
  // cobertura por categoría que las anteriores — confirmado a mano.
  goalsConceded: "goles-concedidos",           // ARQ
  duelsWon: "duelos-ganados",                  // DEF/VOL
  tacklesWon: "entradas-ganadas",              // DEF
  interceptions: "intercepciones",             // DEF
  keyPasses: "pases-clave",                    // VOL
  dribblesCompleted: "regates-completados",    // VOL/DEL
  shotsOnTarget: "tiros-a-puerta",             // DEL
  bigChancesCreated: "ocasiones-claras-creadas", // DEL
} as const;

// Cada categoría (excepto minutos-disputados, ~140 filas) solo lista el
// top ~20-24 de TODA la liga en esa estadística puntual — confirmado a
// mano (paradas-realizadas: 20, tarjetas-amarillas: 23, tarjetas-rojas-*:
// 24 c/u). No es "cada jugador tiene este dato", es "estos ~20 son los
// líderes de la liga en esto". Por eso cada campo es number|null: null =
// el jugador no aparece en ESA tabla puntual (no necesariamente 0 —
// puede jugar mucho y no estar entre los ~20 con más tarjetas, por
// ejemplo), no se inventa un 0 falso.
export interface FichajesPlayerData {
  name: string;
  slug: string;
  minutes: number | null;
  matches: number | null;
  saves: number | null;
  yellowCards: number | null;
  redCards: number | null;
  goalsConceded: number | null;
  duelsWon: number | null;
  tacklesWon: number | null;
  interceptions: number | null;
  keyPasses: number | null;
  dribblesCompleted: number | null;
  shotsOnTarget: number | null;
  bigChancesCreated: number | null;
}

export interface FichajesProfile { team: string | null; photo: string | null; }

// ── Caché — mismo patrón {data,ts,ttlMs} que el resto de la app ─────────
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
const STATS_TTL_MS = 24 * 60 * 60 * 1000;       // se actualiza por fecha, mismo criterio que Gran DT
const PROFILE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // equipo/foto de un jugador no cambia de un día para otro

// Se corta el loop entero apenas aparece un 403 y no se reintenta en la
// misma sesión (pedido explícito) — flag en memoria, no en localStorage
// (es "esta sesión", no "para siempre").
let blockedThisSession = false;
function delay(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function fetchHtml(qs: string): Promise<string | null> {
  if (blockedThisSession) return null;
  try {
    const res = await fetch(`/api/fichajes?${qs}`);
    if (res.status === 403) { blockedThisSession = true; return null; }
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

interface CategoryRow { slug: string; name: string; total: number; }

function parseCategoryTable(html: string): CategoryRow[] {
  const tbody = html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1];
  if (!tbody) return [];
  const rowsHtml = tbody.match(/<tr[\s\S]*?<\/tr>/g) ?? [];
  const rows: CategoryRow[] = [];
  for (const rowHtml of rowsHtml) {
    const link = rowHtml.match(/href="https:\/\/www\.fichajes\.com\/jugador\/([a-z0-9-]+)\/"[^>]*>\s*([^<]+?)\s*</);
    // spans de la fila en orden: [#, Total, por partido] — se toma el segundo.
    const spans = [...rowHtml.matchAll(/<span>\s*([\d.,]+)\s*<\/span>/g)].map((m) => m[1]);
    if (!link || spans.length < 2) continue;
    rows.push({ slug: link[1], name: link[2].trim(), total: parseFloat(spans[1].replace(",", ".")) || 0 });
  }
  return rows;
}

// ── Pool combinado de las 14 categorías, keyeado por slug (único real de
// esta fuente, a diferencia del apellido que puede repetirse) ──────────
export async function getFichajesData(): Promise<Map<string, FichajesPlayerData>> {
  // v2: se agregaron 8 categorías avanzadas por posición — bump para que
  // el pool ya cacheado (24hs) no se sirva sin ellas.
  const key = "pelotita_fichajes_data_v2";
  const cached = cacheGet<Record<string, FichajesPlayerData>>(key);
  if (cached) return new Map(Object.entries(cached));

  const byId = new Map<string, FichajesPlayerData>();
  function ensure(slug: string, name: string): FichajesPlayerData {
    let p = byId.get(slug);
    if (!p) {
      p = {
        name, slug, minutes: null, matches: null, saves: null, yellowCards: null, redCards: null,
        goalsConceded: null, duelsWon: null, tacklesWon: null, interceptions: null,
        keyPasses: null, dribblesCompleted: null, shotsOnTarget: null, bigChancesCreated: null,
      };
      byId.set(slug, p);
    }
    return p;
  }

  const entries = Object.entries(CATEGORY_SLUGS) as [keyof typeof CATEGORY_SLUGS, string][];
  for (let i = 0; i < entries.length; i++) {
    const [field, slug] = entries[i];
    if (i > 0) await delay(280); // 250-300ms entre pedidos, criterio conservador (mismo que ESPN)
    const html = await fetchHtml(`category=${slug}`);
    if (html === null) break; // bloqueado o error — corta acá, no reintenta
    for (const r of parseCategoryTable(html)) {
      const p = ensure(r.slug, r.name);
      if (field === "minutes") p.minutes = r.total;
      else if (field === "matches") p.matches = r.total;
      else if (field === "saves") p.saves = r.total;
      else if (field === "yellowCards") p.yellowCards = r.total;
      else if (field === "redCardsDirect") p.redCards = (p.redCards ?? 0) + r.total;   // directas + por doble amarilla se suman
      else if (field === "redCardsDouble") p.redCards = (p.redCards ?? 0) + r.total;   // en un solo total de "rojas" (pedido no las separa en la ficha)
      else if (field === "goalsConceded") p.goalsConceded = r.total;
      else if (field === "duelsWon") p.duelsWon = r.total;
      else if (field === "tacklesWon") p.tacklesWon = r.total;
      else if (field === "interceptions") p.interceptions = r.total;
      else if (field === "keyPasses") p.keyPasses = r.total;
      else if (field === "dribblesCompleted") p.dribblesCompleted = r.total;
      else if (field === "shotsOnTarget") p.shotsOnTarget = r.total;
      else if (field === "bigChancesCreated") p.bigChancesCreated = r.total;
    }
  }

  cacheSet(key, Object.fromEntries(byId), STATS_TTL_MS);
  return byId;
}

// Construcción directa de la URL de foto a partir del slug — no hace
// falta pedir la ficha del jugador para esto (confirmado a mano que el
// patrón se cumple: mismo slug de la tabla de ranking = nombre del
// archivo de la foto). Con fallback a silueta en la UI si la imagen no
// carga (jugadores sin foto en la fuente).
export function photoUrlFromSlug(slug: string): string {
  return `https://assets-es.imgfoot.com/media/cache/150x150/portrait/${slug}.png`;
}

// ── Ficha individual — SOLO para arqueros (resolver equipo, que no viene
// en las tablas de ranking). Cacheado 7 días, no 24hs: equipo y foto de
// un jugador no cambian de una fecha a otra. ────────────────────────────
export async function getPlayerProfile(slug: string): Promise<FichajesProfile> {
  const key = `pelotita_fichajes_profile_${slug}`;
  const cached = cacheGet<FichajesProfile>(key);
  if (cached) return cached;
  const empty: FichajesProfile = { team: null, photo: null };
  const html = await fetchHtml(`player=${slug}`);
  if (!html) return empty;
  const team = html.match(/pageDataHeaderIdentity__secondaryLabel">\s*<a[^>]*>([^<]+)<\/a>/)?.[1]?.trim() ?? null;
  const photo = html.match(/data-src="(https:\/\/assets-es\.imgfoot\.com\/[^"]+)"/)?.[1] ?? null;
  const result: FichajesProfile = { team, photo };
  cacheSet(key, result, PROFILE_TTL_MS);
  return result;
}

