// Refuerzo Mágico — recomendación automática de 4 jugadores por equipo,
// decidiendo puertas adentro en qué posiciones reforzar. Fuentes:
// Promiedos (goles/asistencias, sin tocar) + fichajes.com (minutos/
// partidos/tarjetas/paradas) + src/data/refuerzo-magico-data-2026.json
// (xG y diagnóstico de necesidad YA CALCULADOS a mano por Ignacio desde
// FootyStats, más una lista de arqueros por vallas invictas) + 365scores
// (xG/xA/rating/avanzadas) + Gran DT (BONUS de forma, NO filtra — ver
// nota más abajo). CERO API-Football, cero fichas de jugador (solo
// escudo de club, ver Paso 5 en RefuerzoMagicoTab.tsx).
//
// ── Bug real corregido (ago 2026): "siempre salen los mismos 4" ────────
// Confirmado con evidencia (5+ equipos probados): la composición (qué
// POSICIONES pedir) sí variaba bien según diagnosticoNecesidades, pero
// QUIÉN ganaba cada posición era casi un ranking fijo de la liga — los
// WEIGHTS por posición eran los mismos para cualquier equipo, así que
// "el mejor delantero de la liga" ganaba siempre que alguien necesitara
// un delantero, sin importar cuál. Fix: computeNeedFactors() pondera las
// dimensiones OFF/DEF de WEIGHTS según ofensiva_score/defensiva_score
// REAL del equipo buscado (mismo archivo, ya se lee) — un equipo con
// brecha defensiva grave pesa más las dimensiones defensivas al elegir
// DEF/VOL/ARQ, uno con brecha ofensiva grave pesa más las ofensivas.
// También se sacó el filtro duro de Gran DT (antes excluía candidatos
// por debajo del 20% del líder — eso achicaba el pool sobreviviente a
// casi siempre los mismos nombres) y pasó a ser una dimensión más del
// scoring (bonus, no filtro — pedido explícito: "sumatoria divertida...
// que no limiten").
//
// ── El archivo de datos manual es la única fuente de verdad del
// diagnóstico ────────────────────────────────────────────────────────
// diagnosticoNecesidades[equipo] YA trae la brecha dominante y la
// composición sugerida (misma fórmula del Paso 3 original, ya aplicada)
// — NO se recalcula acá, se lee directo. Import estático de TypeScript
// (`resolveJsonModule` habilitado en tsconfig): si Ignacio edita el JSON
// y se vuelve a deployar, el valor nuevo se usa solo, sin tocar código.
// Movido de "Refuerzo Mágico/refuerzo-magico-data-2026.json" (carpeta
// con espacio y tilde en la raíz del repo, poco estándar) a
// src/data/, ruta convencional de Next.js para datos estáticos.
//
// Los nombres de equipo del JSON (FootyStats, ej. "CA Tucuman") no
// coinciden con los de Promiedos (ej. "Atlético Tucumán") — se
// resolvió a mano un mapeo id-Promiedos → nombre-JSON para los 30
// equipos (PROMIEDOS_ID_TO_JSON_TEAM), verificado con un matcher por
// tokens antes de hardcodearlo (encontró y corrigió una colisión real:
// "CA Independiente" matcheaba mal contra "Independiente Rivadavia").
//
// ── Arquero: ahora SÍ tiene una fuente confiable ────────────────────
// playerStats.cleanSheetsGoalkeepers del JSON (FootyStats, página
// dedicada de arqueros) es la fuente PRIORIZADA para vallas invictas de
// arquero — el propio archivo advierte que la lista equivalente del
// sitio (cleanSheetsPlayersPageNote) puede mezclar jugadores de campo a
// partir del 2° puesto, no se usa. fichajes.com complementa con
// paradas/minutos/partidos/tarjetas vía cruce por nombre (mismo
// criterio best-effort de todo cruce entre fuentes de este proyecto).

import { getTablaPosiciones, PROMIEDOS_LEAGUES, getSquad, type PromiedosStandingGroup, type PromiedosSquadPlayer } from "@/lib/promiedos";
import { getGrandTRanking, getLatestGrandTSheet, type GrandTPosition } from "@/lib/grandt";
import { getFichajesData, getPlayerProfile, photoUrlFromSlug, type FichajesPlayerData } from "@/lib/fichajes";
import { getScores365Data, type Scores365PlayerStats } from "@/lib/365scores";
import { getStandings, espnTeamLogoUrl } from "@/lib/espn";
import RM_DATA_RAW from "@/data/refuerzo-magico-data-2026.json";
import RANKING_VALOR_RAW from "@/data/ranking-valor-plantel-2026.json";
import VALUE_POOL_RAW from "@/data/pool-candidatos-refuerzo-magico-2026.json";

interface RMDiagnostico {
  ofensiva_score: number;
  defensiva_score: number;
  brecha_dominante: "OFENSIVA" | "DEFENSIVA" | "PAREJA";
  composicion_sugerida: string;
}
interface RMDataFile {
  diagnosticoNecesidades: Record<string, RMDiagnostico>;
  playerStats: {
    cleanSheetsGoalkeepers: { player: string; mp: number; cs: number; csPct: number }[];
  };
}
const RM_DATA = RM_DATA_RAW as unknown as RMDataFile;

// Mapeo validado a mano (script de matcheo por tokens contra los 30
// nombres reales de Promiedos, ago 2026) — ver nota arriba.
export const PROMIEDOS_ID_TO_JSON_TEAM: Record<string, string> = {
  "hcag": "CA Union de Santa Fe",
  "hcch": "CS Independiente Rivadavia",
  "ihe": "CA Independiente",
  "ihh": "Newells Old Boys",
  "hcbh": "CSD Defensa y Justicia",
  "hbbh": "CA Sarmiento",
  "iia": "Gimnasia y Esgrima La Plata",
  "igg": "CA Boca Juniors",
  "ihf": "CA Rosario Central",
  "jche": "CA Talleres de Cordoba",
  "igj": "CA Lanus",
  "ihi": "CA Banfield",
  "bbjbf": "Atletico Gimnasia y Esgrima de Mendoza",
  "igi": "CA River Plate",
  "ihg": "Racing Club de Avellaneda",
  "ihb": "Argentinos Juniors",
  "gbfc": "CA Tucuman",
  "hchc": "Instituto AC Cordoba",
  "fhid": "CA Belgrano de Cordoba",
  "iie": "CA Huracan",
  "beafh": "CA Central Cordoba de Santiago del Estero",
  "iid": "CA Tigre",
  "ihc": "Club Atletico Velez Sarsfield",
  "hcah": "CA Platense",
  "igh": "Estudiantes de La Plata",
  "bheaf": "AA Estudiantes de Rio Cuarto",
  "igf": "CA San Lorenzo de Almagro",
  "jafb": "CA Barracas Central",
  "hccd": "CA Aldosivi",
  "bbjea": "CD Riestra",
};

// ── Refuerzo Mágico con valor de mercado (ago 2026) ─────────────────────
// Variante que suma el poder económico REAL del equipo (Transfermarkt,
// ranking-valor-plantel-2026.json) y el valor de mercado individual de
// cada candidato (pool-candidatos-refuerzo-magico-2026.json, ~350
// jugadores con club oficial confirmado) al scoring existente — para que
// no sugiera un jugador que el equipo no podría pagar ni loco. Es opt-in
// (`recommend(team, { presupuesto: true })`): sin ese flag, el
// comportamiento clásico queda idéntico a como estaba.
interface RankingValorRow { posicion: number; equipo: string; valor_plantel_eur_millones: number; escalon: "A" | "B" | "C"; }
const RANKING_VALOR: RankingValorRow[] = (RANKING_VALOR_RAW as { ranking: RankingValorRow[] }).ranking;
const RANKING_VALOR_BY_EQUIPO = new Map(RANKING_VALOR.map((r) => [normalize(r.equipo), r]));

interface ValuePoolPlayer {
  nombre: string; posicion: string; edad: number;
  valor_mercado_eur_millones: number; club: string; confianza_club: string; nota?: string;
}
interface ValuePoolFile {
  porteros: ValuePoolPlayer[]; defensas: ValuePoolPlayer[];
  mediocampistas: ValuePoolPlayer[]; delanteros: ValuePoolPlayer[];
}
const VALUE_POOL = VALUE_POOL_RAW as unknown as ValuePoolFile;
const VALUE_POOL_BY_BUCKET: Record<RMPosition, ValuePoolPlayer[]> = {
  ARQ: VALUE_POOL.porteros, DEF: VALUE_POOL.defensas,
  VOL: VALUE_POOL.mediocampistas, DEL: VALUE_POOL.delanteros,
};

// id-Promiedos → nombre Transfermarkt (ranking-valor-plantel-2026.json).
// Construido cruzando cada entrada YA VERIFICADA de PROMIEDOS_ID_TO_JSON_TEAM
// (identidad real de club, no texto) contra el nombre Transfermarkt del
// mismo club — hardcodeado y verificado a mano en vez de fuzzy-match en
// runtime, mismo criterio que esa tabla: un club mal identificado acá le
// daría acceso económico incorrecto a un equipo (ej. "Independiente" vs
// "Independiente Rivadavia" — la MISMA colisión de nombres que ya rompió
// un fuzzy-match antes en este archivo, ver nota de PROMIEDOS_ID_TO_JSON_TEAM).
const PROMIEDOS_ID_TO_RANKING_TEAM: Record<string, string> = {
  "hcag": "Unión de Santa Fe",
  "hcch": "Independiente Rivadavia",
  "ihe": "Independiente",
  "ihh": "Newell's Old Boys",
  "hcbh": "Defensa y Justicia",
  "hbbh": "Sarmiento (Junín)",
  "iia": "Gimnasia y Esgrima La Plata",
  "igg": "Boca Juniors",
  "ihf": "Rosario Central",
  "jche": "Talleres",
  "igj": "Lanús",
  "ihi": "Banfield",
  "bbjbf": "Gimnasia y Esgrima (Mendoza)",
  "igi": "River Plate",
  "ihg": "Racing Club",
  "ihb": "Argentinos Juniors",
  "gbfc": "Atlético Tucumán",
  "hchc": "Instituto ACC",
  "fhid": "Belgrano",
  "iie": "Huracán",
  "beafh": "Central Córdoba (SdE)",
  "iid": "Tigre",
  "ihc": "Vélez Sarsfield",
  "hcah": "Platense",
  "igh": "Estudiantes de La Plata",
  "bheaf": "Estudiantes (Río Cuarto)",
  "igf": "San Lorenzo de Almagro",
  "jafb": "Barracas Central",
  "hccd": "Aldosivi",
  "bbjea": "Deportivo Riestra",
};

export type Escalon = "A" | "B" | "C";
export interface EscalonInfo {
  escalon: Escalon;
  techoEurM: number | null; // null = sin techo (escalón A, acceso a cualquier candidato)
  enRanking: boolean; // false = el equipo no matcheó contra el ranking, se usó el fallback
}

// Techos ajustables sin tocar el resto de la lógica — parámetro a tunear
// después de ver la distribución real de valores del pool (min 0.25M,
// max 20M al momento de escribir esto).
const TECHO_VALOR_POR_ESCALON: Record<Escalon, number | null> = { A: null, B: 5, C: 2 };
export function getTechoValorPorEscalon(escalon: Escalon): number | null {
  return TECHO_VALOR_POR_ESCALON[escalon];
}

// Fallback: equipo sin fila en el ranking (no debería pasar, los 30 están
// mapeados) → escalón C por defecto + warning, nunca rompe la búsqueda.
export function getEscalonEquipo(team: RMTeam): EscalonInfo {
  const rankingName = PROMIEDOS_ID_TO_RANKING_TEAM[team.id];
  const row = rankingName ? RANKING_VALOR_BY_EQUIPO.get(normalize(rankingName)) : undefined;
  if (!row) {
    console.warn(`[Refuerzo Mágico] "${team.name}" sin dato de valor de plantel — se lo trata como escalón C por defecto`);
    return { escalon: "C", techoEurM: getTechoValorPorEscalon("C"), enRanking: false };
  }
  return { escalon: row.escalon, techoEurM: getTechoValorPorEscalon(row.escalon), enRanking: true };
}

// Cruce por nombre contra el pool de valor (mismo criterio best-effort que
// el resto del archivo) — sin match, el candidato queda sin valor conocido
// y se excluye del modo presupuesto (no se asume "barato" ni "caro" sobre
// un dato que no existe).
function findValueMatch(candidateName: string, position: RMPosition): ValuePoolPlayer | undefined {
  return bestTokenMatch(candidateName, VALUE_POOL_BY_BUCKET[position], (p) => tokenizeForMatch(p.nombre));
}

const LEAGUE_SLUG = "arg.1" as const;

export type RMPosition = "ARQ" | "DEF" | "VOL" | "DEL";

const PROMIEDOS_POSITION_TO_BUCKET: Record<string, RMPosition> = {
  "Arqueros": "ARQ", "Defensores": "DEF", "Mediocampistas": "VOL", "Delanteros": "DEL",
};

export interface RMTeam { id: string; name: string; shortName: string; urlName: string; }

export interface RMCandidate {
  id: string;
  name: string;
  surname: string;
  teamId: string | null;
  teamName: string;
  position: RMPosition;
  photo: string | null;
  goals: number;
  assists: number;
  // number|null: fichajes.com solo lista el top ~20-44 de la liga en cada
  // una de estas estadísticas (menos minutos, que sí cubre ~140 — ver
  // nota en lib/fichajes.ts) — null = el jugador no está entre esos
  // ~20-44, no significa que valga 0.
  minutes: number | null;
  matches: number | null;
  yellowCards: number | null;
  redCards: number | null;
  saves: number | null;
  cleanSheets: number | null;
  // Avanzadas por posición (ago 2026, fichajes.com) — solo se muestran en
  // la ficha de la posición a la que corresponden (ver statRows() en
  // RefuerzoMagicoTab.tsx), pero se guardan todas en el mismo candidato.
  goalsConceded: number | null;      // ARQ
  duelsWon: number | null;           // DEF/VOL
  tacklesWon: number | null;         // DEF
  interceptions: number | null;      // DEF
  keyPasses: number | null;          // VOL
  dribblesCompleted: number | null;  // VOL/DEL
  shotsOnTarget: number | null;      // DEL
  bigChancesCreated: number | null;  // DEL
  // Biográficos (ago 2026, plantel Promiedos) — cruce por nombre
  // best-effort, se completan recién sobre los 4 candidatos finales
  // (ver enrichWithBio), no sobre todo el pool.
  age: number | null;
  height: number | null; // metros
  // Escudo del club (ESPN) — fallback de foto cuando fichajes.com no
  // tiene una real para ese jugador puntual (ver PlayerPhoto en
  // RefuerzoMagicoTab.tsx). Se completa junto con age/height.
  teamLogo: string | null;
  // Puntaje acumulado Gran DT (Paso 4.3) — antes se usaba solo para
  // filtrar/desempatar puertas adentro, ahora también se muestra como
  // dato más de la ficha (pedido explícito: no es "explicar el
  // algoritmo", es un dato estadístico del jugador como cualquier otro).
  grandTPoints: number | null;
  // 365scores (ago 2026) — cuarta fuente, se suma sin reemplazar
  // ninguna. xg/xa/rating365 son totales/promedios de temporada, sin
  // equivalente previo. Los "PerGame365" son promedios POR PARTIDO —
  // NO se mezclan con duelsWon/interceptions/saves/goalsConceded (esos
  // son totales de fichajes.com, unidad distinta, ver nota en
  // lib/365scores.ts) — se muestran en fila aparte. yellowCards/
  // redCards/cleanSheets de esta fuente SÍ son la misma unidad
  // (totales) que las ya existentes, así que solo se usan como
  // fallback silencioso cuando fichajes.com/el JSON no tenían el dato.
  xg365: number | null;
  xa365: number | null;
  xgXaCombined365: number | null;
  rating365: number | null;
  duelsWonPerGame365: number | null;
  interceptionsPerGame365: number | null;
  savesPerGame365: number | null;
  goalsConcededPerGame365: number | null;
  penaltisConvertidos365: number | null;
  penaltisParados365: number | null;
  // Cuántos campos de 365scores (los relevantes a esta posición) tiene
  // poblados este candidato — 0 si ninguno (nunca null: "cero fuentes
  // extra" es un valor real, no "no sabemos"). Usado como dimensión de
  // bonus (Paso "bonus de cobertura") en WEIGHTS: a igualdad de mérito,
  // el candidato con más data verificable de 365scores puntúa un poco
  // más — se computa en enrichWith365, ver esa función.
  coverage365: number;
  // Modo presupuesto (opt-in, ver getEscalonEquipo/recommend) — solo se
  // completan cuando `recommend()` corre con `{ presupuesto: true }`, cruce
  // por nombre contra pool-candidatos-refuerzo-magico-2026.json. Opcionales
  // para no tener que tocar cada sitio que construye un RMCandidate "a
  // secas" (buildPromiedosPool, getGoalkeeperPool) — ahí quedan undefined.
  valorMercadoEUR?: number | null;
  clubActual?: string | null;
}
export interface FitResult { score: number; }
export type RMResult = RMCandidate & { fit: FitResult };

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/['']/g, "").toLowerCase().trim();
}
function clamp(v: number, min: number, max: number) { return Math.min(max, Math.max(min, v)); }
function delay(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

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
const POOL_TTL_MS = 24 * 60 * 60 * 1000;
const GRANDT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_MINUTES_FOR_CLEAN_SHEETS = 900; // Paso 4.4

// ── Equipos (Promiedos, tabla anual) ────────────────────────────────────
export async function getTeams(): Promise<RMTeam[]> {
  // v2: se agregó urlName (necesario para el plantel/edad/altura) —
  // bump para no servir equipos cacheados sin ese campo.
  const key = "pelotita_rm_teams_v2";
  const cached = cacheGet<RMTeam[]>(key);
  if (cached) return cached;
  const groups = await getTablaPosiciones(LEAGUE_SLUG);
  const byId = new Map<string, RMTeam>();
  for (const g of groups) for (const t of g.tables) for (const r of t.rows) {
    byId.set(r.team.id, { id: r.team.id, name: r.team.name, shortName: r.team.shortName, urlName: r.team.urlName });
  }
  const teams = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  cacheSet(key, teams, POOL_TTL_MS);
  return teams;
}

// ── Composición de posiciones — leída directo del JSON, no recalculada ──
function parseComposition(str: string): RMPosition[] {
  if (str.includes("arquero")) return ["ARQ", "DEF", "DEF", "VOL"];
  if (str.includes("delanteros")) return ["DEL", "DEL", "VOL", "VOL"];
  return ["DEL", "VOL", "DEF", "DEF"]; // "2 ofensivos + 2 defensivos"
}

function getComposition(team: RMTeam): RMPosition[] {
  const jsonKey = PROMIEDOS_ID_TO_JSON_TEAM[team.id];
  const diag = jsonKey ? RM_DATA.diagnosticoNecesidades[jsonKey] : undefined;
  if (!diag) return ["DEL", "VOL", "DEF", "DEF"]; // no debería pasar, los 30 están mapeados — fallback defensivo
  return parseComposition(diag.composicion_sugerida);
}

// ── Promiedos: pool de candidatos de campo (DEF/VOL/DEL) ────────────────
async function fetchRawLeagueData(): Promise<Record<string, unknown>> {
  const meta = PROMIEDOS_LEAGUES[LEAGUE_SLUG];
  const res = await fetch(`/api/promiedos?endpoint=data&slug=${meta.urlName}&id=${meta.id}`);
  if (!res.ok) throw new Error(`Promiedos ${res.status}`);
  return res.json();
}

function flattenTeams(groups: PromiedosStandingGroup[]): Map<string, { name: string; shortName: string }> {
  const map = new Map<string, { name: string; shortName: string }>();
  for (const g of groups) for (const t of g.tables) for (const r of t.rows) {
    map.set(r.team.id, { name: r.team.name, shortName: r.team.shortName });
  }
  return map;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildPromiedosPool(raw: any, teamNameById: Map<string, { name: string; shortName: string }>): RMCandidate[] {
  const pool = new Map<string, RMCandidate>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function ensure(obj: any): RMCandidate | null {
    const name: string | undefined = obj?.name;
    const bucket = PROMIEDOS_POSITION_TO_BUCKET[obj?.position];
    if (!name || !bucket || bucket === "ARQ") return null; // arqueros salen del JSON, no de acá
    const id = normalize(name);
    let c = pool.get(id);
    if (!c) {
      const teamId: string = obj.team_id ?? "";
      c = {
        id, name, surname: obj.sname || name.split(/\s+/).slice(-1)[0] || name,
        teamId, teamName: teamNameById.get(teamId)?.shortName ?? teamNameById.get(teamId)?.name ?? "",
        position: bucket, photo: null, goals: 0, assists: 0, minutes: null, matches: null,
        yellowCards: null, redCards: null, saves: null, cleanSheets: null,
        goalsConceded: null, duelsWon: null, tacklesWon: null, interceptions: null,
        keyPasses: null, dribblesCompleted: null, shotsOnTarget: null, bigChancesCreated: null,
        age: null, height: null, teamLogo: null, grandTPoints: null,
        xg365: null, xa365: null, xgXaCombined365: null, rating365: null, duelsWonPerGame365: null,
        interceptionsPerGame365: null, savesPerGame365: null, goalsConcededPerGame365: null,
        penaltisConvertidos365: null, penaltisParados365: null, coverage365: 0,
      };
      pool.set(id, c);
    }
    return c;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tables: any[] = raw.players_statistics?.tables ?? [];
  for (const t of tables) {
    for (const r of t.rows ?? []) {
      const c = ensure(r.entity?.object);
      if (!c) continue;
      const value = parseInt(String(r.values?.[0]?.value ?? "0"), 10) || 0;
      if (t.name === "Goles") c.goals = value;
      else if (t.name === "Asistencias") c.assists = value;
    }
  }
  return [...pool.values()];
}

// ── Cruce por nombre entre Promiedos/JSON (nombre completo) y
// fichajes.com (slug de la URL) ─────────────────────────────────────────
// BUG encontrado y corregido (ago 2026): la versión anterior cruzaba solo
// por APELLIDO (Promiedos `sname`) contra el último segmento del slug —
// con apellidos comunes o compuestos esto colisiona fuerte: "Michael
// Santos" terminaba emparejado con "Mateo Mendía Dos Santos" (comparten
// "santos" nomás), "Bruno Cabrera" con "Maximo Cabrera", "Eric Meza" con
// "Sebastián Tomás Meza" — todos casos reales confirmados a mano. El
// cruce ahora exige que compartan el apellido Y AL MENOS otro token
// (nombre de pila u otro apellido) cuando el slug tiene más de una
// palabra — con un solo apellido compartido y nada más, se descarta en
// vez de adivinar. Esto significa que MENOS candidatos van a tener match
// que antes, pero los que sí matchean son los correctos — mejor "—"
// honesto que un dato de otro jugador.
function tokenizeForMatch(s: string): string[] {
  // Se limpia toda puntuación (paréntesis, puntos, etc.) antes de separar
  // en tokens — encontrado con "Sarmiento (Junín)" (ESPN) vs "Sarmiento
  // Junín" (Promiedos): sin este replace, el token quedaba "(junin)" con
  // paréntesis y nunca igualaba a "junin", matcheo fallaba en falso.
  return normalize(s).replace(/[^a-z0-9\s-]/g, "").split(/[\s-]+/).filter((t) => t.length > 2);
}
// Matcher genérico por solapamiento de tokens — reusado para cruzar
// Promiedos↔fichajes.com (por slug), Promiedos↔plantel (por nombre) y
// Promiedos↔ESPN (por nombre de equipo). Mismo criterio en los tres
// casos: exige 2 tokens compartidos — salvo que el lado MÁS CORTO de la
// comparación (el nombre buscado o el ítem candidato, el que tenga menos
// tokens) sea de una sola palabra, ahí un solo token compartido alcanza.
// Esto es lo que permite que "Instituto" (Promiedos) matchee contra
// "Club Atlético Instituto" (ESPN, 3 tokens) sin exigirle un segundo
// token que Promiedos no tiene, sin debilitar la protección contra
// colisiones de apellidos (ahí AMBOS lados son nombres completos de
// varias palabras, así que el mínimo de los dos sigue siendo 2). A
// igual cantidad de tokens compartidos, se prefiere el ítem con menos
// tokens (más específico). Sin match → undefined, nunca se adivina.
function bestTokenMatch<T>(fullName: string, items: T[], tokensOf: (item: T) => string[]): T | undefined {
  const target = new Set(tokenizeForMatch(fullName));
  let best: T | undefined, bestShared = 0, bestLen = Infinity;
  for (const item of items) {
    const itemTokens = tokensOf(item);
    if (itemTokens.length === 0) continue;
    const shared = itemTokens.filter((t) => target.has(t)).length;
    const minRequired = Math.min(target.size, itemTokens.length) <= 1 ? 1 : 2;
    if (shared < minRequired) continue;
    if (shared > bestShared || (shared === bestShared && itemTokens.length < bestLen)) {
      bestShared = shared; bestLen = itemTokens.length; best = item;
    }
  }
  return best;
}
function findFichajesMatch(fullName: string, pool: FichajesPlayerData[]): FichajesPlayerData | undefined {
  return bestTokenMatch(fullName, pool, (p) => tokenizeForMatch(p.slug));
}
function findSquadMatch(fullName: string, squad: PromiedosSquadPlayer[]): PromiedosSquadPlayer | undefined {
  return bestTokenMatch(fullName, squad, (p) => tokenizeForMatch(p.name));
}
function findTeamMatch(teamName: string, teams: RMTeam[]): RMTeam | undefined {
  return bestTokenMatch(teamName, teams, (t) => tokenizeForMatch(`${t.name} ${t.shortName}`));
}

// Enriquece un candidato de campo con datos de fichajes.com (minutos,
// partidos, tarjetas). Vallas invictas de Defensor queda siempre sin
// dato: ninguna fuente integrada atribuye clean sheets a un defensor
// puntual (ni fichajes.com ni el JSON — "cleanSheetsGoalkeepers" es,
// como el nombre indica, solo de arqueros).
// Avanzadas por posición — cada posición solo toma los campos de
// fichajes.com que le corresponden (ver WEIGHTS/statRows), el resto
// queda en null aunque fd los traiga (no aplican a esta posición).
function enrichWithFichajes(c: RMCandidate, fichajesPool: FichajesPlayerData[]): RMCandidate {
  const fd = findFichajesMatch(c.name, fichajesPool);
  if (!fd) return c;
  const advanced: Partial<RMCandidate> =
    c.position === "DEF" ? { duelsWon: fd.duelsWon, tacklesWon: fd.tacklesWon, interceptions: fd.interceptions }
    : c.position === "VOL" ? { keyPasses: fd.keyPasses, dribblesCompleted: fd.dribblesCompleted, duelsWon: fd.duelsWon }
    : c.position === "DEL" ? { shotsOnTarget: fd.shotsOnTarget, dribblesCompleted: fd.dribblesCompleted, bigChancesCreated: fd.bigChancesCreated }
    : {};
  return {
    ...c,
    minutes: fd.minutes, matches: fd.matches,
    yellowCards: fd.yellowCards, redCards: fd.redCards,
    photo: photoUrlFromSlug(fd.slug),
    ...advanced,
  };
}

function findScores365Match(fullName: string, pool: Scores365PlayerStats[]): Scores365PlayerStats | undefined {
  return bestTokenMatch(fullName, pool, (p) => tokenizeForMatch(p.name));
}

// Enriquece con 365scores (cuarta fuente, ago 2026) — se suma sin
// reemplazar. Campos nuevos (xg365/xa365/rating365/los "PerGame365") van
// siempre que haya match, según posición. yellowCards/redCards SOLO se
// llenan si fichajes.com no los trajo ya (misma unidad — total de
// temporada — así que es un fallback seguro, no un reemplazo silencioso
// de un dato real). cleanSheets nunca se pisa acá: para arqueros el JSON
// manual ya es la fuente priorizada y siempre trae el dato para los 15
// que cubre.
// Campos de 365scores relevantes por posición — mismos que usa
// enrichWith365 para poblar la ficha, usados también para contar
// coverage365 (Paso "bonus de cobertura", confirmado que suma de
// verdad al score, no solo declarado — ver WEIGHTS/computeCoverage365).
const SCORES_365_FIELDS_BY_POSITION: Record<RMPosition, (keyof RMCandidate)[]> = {
  ARQ: ["savesPerGame365", "goalsConcededPerGame365", "penaltisParados365"],
  DEF: ["rating365", "duelsWonPerGame365", "interceptionsPerGame365"],
  VOL: ["xg365", "xa365", "rating365", "duelsWonPerGame365"],
  DEL: ["xg365", "xa365", "xgXaCombined365", "rating365", "penaltisConvertidos365"],
};
function computeCoverage365(c: RMCandidate): number {
  return SCORES_365_FIELDS_BY_POSITION[c.position].filter((k) => c[k] != null).length;
}

function enrichWith365(c: RMCandidate, pool365: Scores365PlayerStats[]): RMCandidate {
  const m = findScores365Match(c.name, pool365);
  if (!m) return c;
  const byPosition: Partial<RMCandidate> =
    c.position === "ARQ" ? { savesPerGame365: m.savesPerGame365, goalsConcededPerGame365: m.goalsConcededPerGame365, penaltisParados365: m.penaltisParados }
    : c.position === "DEF" ? { rating365: m.rating365, duelsWonPerGame365: m.duelsWonPerGame365, interceptionsPerGame365: m.interceptionsPerGame365 }
    : c.position === "VOL" ? { xg365: m.xg, xa365: m.xa, rating365: m.rating365, duelsWonPerGame365: m.duelsWonPerGame365 }
    : { xg365: m.xg, xa365: m.xa, xgXaCombined365: m.xgXaCombined, rating365: m.rating365, penaltisConvertidos365: m.penaltisConvertidos }; // DEL
  const merged: RMCandidate = {
    ...c,
    ...byPosition,
    yellowCards: c.yellowCards ?? m.yellowCards,
    redCards: c.redCards ?? m.redCards,
    cleanSheets: c.cleanSheets ?? m.cleanSheets,
  };
  return { ...merged, coverage365: computeCoverage365(merged) };
}

// ── Arqueros: JSON (cleanSheetsGoalkeepers) + fichajes.com (paradas,
// minutos, tarjetas, equipo/foto vía ficha individual) ─────────────────

async function getGoalkeeperPool(): Promise<RMCandidate[]> {
  const key = "pelotita_rm_pool_arq_v9"; // v9: se agregó coverage365 (bonus de cobertura)
  const cached = cacheGet<RMCandidate[]>(key);
  if (cached) return cached;

  const [fichajesData, scores365Data] = await Promise.all([getFichajesData(), getScores365Data()]);
  const fichajesPool = [...fichajesData.values()];
  const pool365 = [...scores365Data.values()];
  const keepers = RM_DATA.playerStats.cleanSheetsGoalkeepers;

  const pool: RMCandidate[] = [];
  for (let i = 0; i < keepers.length; i++) {
    const gk = keepers[i];
    const match = findFichajesMatch(gk.player, fichajesPool);
    if (i > 0) await delay(280); // 250-300ms entre pedidos, criterio conservador (mismo que ESPN)
    const profile = match ? await getPlayerProfile(match.slug) : { team: null, photo: null };
    pool.push(enrichWith365({
      id: match?.slug ?? normalize(gk.player),
      name: gk.player,
      surname: gk.player.split(/\s+/).slice(-1)[0] ?? gk.player,
      teamId: null, // el JSON no trae team_id de Promiedos — se resuelve por nombre (ver recommend())
      teamName: profile.team ?? "—",
      position: "ARQ",
      photo: profile.photo ?? (match ? photoUrlFromSlug(match.slug) : null),
      goals: 0, assists: 0,
      minutes: match?.minutes ?? null, // sin estimar — si fichajes no matcheó, queda sin dato
      matches: gk.mp, // el JSON siempre lo trae para estos 15, es la fuente priorizada
      yellowCards: match?.yellowCards ?? null,
      redCards: match?.redCards ?? null,
      saves: match?.saves ?? null,
      cleanSheets: gk.cs, // JSON siempre gana acá
      goalsConceded: match?.goalsConceded ?? null,
      duelsWon: null, tacklesWon: null, interceptions: null, keyPasses: null,
      dribblesCompleted: null, shotsOnTarget: null, bigChancesCreated: null,
      age: null, height: null, teamLogo: null, grandTPoints: null, // se completan después
      xg365: null, xa365: null, xgXaCombined365: null, rating365: null, duelsWonPerGame365: null,
      interceptionsPerGame365: null, savesPerGame365: null, goalsConcededPerGame365: null,
      penaltisConvertidos365: null, penaltisParados365: null, coverage365: 0,
    }, pool365));
  }
  cacheSet(key, pool, POOL_TTL_MS);
  return pool;
}

export async function getCandidatePool(position: RMPosition): Promise<RMCandidate[]> {
  if (position === "ARQ") return getGoalkeeperPool();

  // v8: se agregó coverage365 (bonus de cobertura) — bump para no servir
  // el pool viejo (sin ese campo) ya cacheado 24hs.
  const key = `pelotita_rm_pool_v8_${LEAGUE_SLUG}`;
  const cached = cacheGet<RMCandidate[]>(key);
  let allOutfield: RMCandidate[];
  if (cached) {
    allOutfield = cached;
  } else {
    const [raw, groups, fichajes, scores365] = await Promise.all([
      fetchRawLeagueData(), getTablaPosiciones(LEAGUE_SLUG), getFichajesData(), getScores365Data(),
    ]);
    const fichajesPool = [...fichajes.values()];
    const pool365 = [...scores365.values()];
    allOutfield = buildPromiedosPool(raw, flattenTeams(groups))
      .map((c) => enrichWithFichajes(c, fichajesPool))
      .map((c) => enrichWith365(c, pool365));
    cacheSet(key, allOutfield, POOL_TTL_MS);
  }
  return allOutfield.filter((c) => c.position === position);
}

// ── Gran DT: BONUS de forma, ya NO filtra (ver nota del bug al inicio
// del archivo) — puntos por equipo/posición, se usan como una dimensión
// más de WEIGHTS ("grandTPoints"), nunca excluyen a nadie del pool. ────
async function getGrandTPointsBySurname(position: RMPosition): Promise<Map<string, number>> {
  const key = `pelotita_rm_grandt_${position}`;
  const cached = cacheGet<Record<string, number>>(key);
  if (cached) return new Map(Object.entries(cached));
  try {
    const latest = await getLatestGrandTSheet();
    if (!latest?.sheetUrl) return new Map();
    const players = await getGrandTRanking(latest.sheetUrl, position as GrandTPosition);
    const map = new Map<string, number>();
    for (const p of players) {
      const surname = p.name.split(",")[0]?.trim() ?? p.name;
      map.set(normalize(surname), p.points);
    }
    cacheSet(key, Object.fromEntries(map), GRANDT_TTL_MS);
    return map;
  } catch {
    return new Map();
  }
}

// ── Paso 6: scoring 0-100, normalizado por 90' ──────────────────────────
// category: usada por computeNeedFactors para pesar OFF/DEF según la
// necesidad REAL de cada equipo (ver nota del bug al inicio del
// archivo) — NEUTRAL (disciplina, forma Gran DT, cobertura de datos) no
// se pondera por necesidad, es igual de relevante para cualquier equipo.
type DimCategory = "OFF" | "DEF" | "NEUTRAL";
interface WeightDim { key: keyof RMCandidate; per90?: boolean; invert?: boolean; weight: number; category: DimCategory; }
// Pesos de grandTPoints/coverage365 más altos que en el primer intento —
// se subieron a mano tras verificar con datos reales (6 equipos, 3 tipos
// de brecha) que con pesos chicos un líder estadístico dominante seguía
// ganando en casi todos los equipos, incluso los de brecha PAREJA (ahí
// el ajuste OFF/DEF queda ~neutro a propósito, así que la única forma de
// dar variedad real es que el bonus de forma/cobertura pese más).
const WEIGHTS: Record<RMPosition, WeightDim[]> = {
  ARQ: [
    { key: "saves", per90: true, weight: 0.26, category: "DEF" },
    { key: "cleanSheets", weight: 0.22, category: "DEF" },
    { key: "yellowCards", invert: true, weight: 0.08, category: "NEUTRAL" },
    { key: "redCards", invert: true, weight: 0.06, category: "NEUTRAL" },
    { key: "grandTPoints", weight: 0.24, category: "NEUTRAL" }, // bonus de forma (Gran DT), ya NO filtra
    { key: "coverage365", weight: 0.14, category: "NEUTRAL" }, // bonus de cobertura de datos
  ],
  DEF: [
    { key: "cleanSheets", weight: 0.20, category: "DEF" },
    { key: "assists", per90: true, weight: 0.09, category: "OFF" },
    { key: "goals", per90: true, weight: 0.05, category: "OFF" },
    { key: "yellowCards", invert: true, weight: 0.14, category: "NEUTRAL" },
    { key: "redCards", invert: true, weight: 0.09, category: "NEUTRAL" },
    { key: "grandTPoints", weight: 0.29, category: "NEUTRAL" },
    { key: "coverage365", weight: 0.14, category: "NEUTRAL" },
  ],
  VOL: [
    { key: "assists", per90: true, weight: 0.25, category: "OFF" },
    { key: "goals", per90: true, weight: 0.17, category: "OFF" },
    { key: "yellowCards", invert: true, weight: 0.08, category: "NEUTRAL" },
    { key: "redCards", invert: true, weight: 0.05, category: "NEUTRAL" },
    { key: "grandTPoints", weight: 0.31, category: "NEUTRAL" },
    { key: "coverage365", weight: 0.14, category: "NEUTRAL" },
  ],
  DEL: [
    { key: "goals", per90: true, weight: 0.30, category: "OFF" },
    { key: "assists", per90: true, weight: 0.19, category: "OFF" },
    { key: "yellowCards", invert: true, weight: 0.06, category: "NEUTRAL" },
    { key: "grandTPoints", weight: 0.31, category: "NEUTRAL" },
    { key: "coverage365", weight: 0.14, category: "NEUTRAL" },
  ],
};

function per90(value: number, minutes: number): number {
  return minutes > 0 ? (value / minutes) * 90 : 0;
}

// Pondera OFF/DEF según la brecha REAL del equipo (diagnosticoNecesidades,
// mismo archivo que ya decide la composición) — esto es lo que hace que
// "quién gana" cada posición dependa del equipo buscado, no solo "qué
// posiciones pedir".
//
// OJO — el signo absoluto de ofensiva_score/defensiva_score no está
// documentado en el JSON (no dice si "más alto" es "mejor" o "más
// urgencia") y se confirmó a mano que la lectura ingenua ("negativo =
// brecha grave") es INCORRECTA: Atlético Tucumán tiene ofensiva_score
// POSITIVO (+7.5) y ataque real por encima del promedio de liga (1.95
// goles/partido vs 1.026 de liga) pero igual queda con brecha_dominante
// "OFENSIVA". Para no arriesgar pesar mal por una suposición de signo no
// verificada, NO se usa el valor absoluto — se reusa la MISMA
// comparación relativa que ya decide brecha_dominante (confirmado
// empíricamente: gana el score más alto entre ofensiva/defensiva,
// PAREJA cuando están cerca), extendida acá a un factor gradual en vez
// de solo 3 categorías discretas. Factor entre 0.6 y 1.6 — nunca anula
// ni triplica una dimensión, solo la inclina. Sin diagnóstico (no
// debería pasar, los 30 equipos están mapeados) → factor neutro 1.
function computeNeedFactors(team: RMTeam): Record<DimCategory, number> {
  const jsonKey = PROMIEDOS_ID_TO_JSON_TEAM[team.id];
  const diag = jsonKey ? RM_DATA.diagnosticoNecesidades[jsonKey] : undefined;
  if (!diag) return { OFF: 1, DEF: 1, NEUTRAL: 1 };
  const diff = diag.ofensiva_score - diag.defensiva_score; // > 0 → mismo lado que elige brecha_dominante="OFENSIVA"
  const lean = clamp(diff / 40, -1, 1);
  return {
    OFF: clamp(1 + lean * 0.5, 0.6, 1.6),
    DEF: clamp(1 - lean * 0.5, 0.6, 1.6),
    NEUTRAL: 1,
  };
}

// raw[candidato][dimensión] = número, o null si no hay dato para ese
// jugador puntual en esa dimensión — null NO es lo mismo que 0.
function scoreCandidates(candidates: RMCandidate[], position: RMPosition, needFactors: Record<DimCategory, number>): RMResult[] {
  const dims = WEIGHTS[position];
  const effWeight = (d: WeightDim) => d.weight * needFactors[d.category];
  const raw: (number | null)[][] = candidates.map((c) => dims.map((d) => {
    const v = c[d.key] as number | null;
    if (v == null) return null; // sin dato para esta dimensión — no se inventa un 0
    if (d.key === "cleanSheets" && (c.minutes ?? 0) < MIN_MINUTES_FOR_CLEAN_SHEETS) return 0; // Paso 4.4
    return d.per90 ? per90(v, c.minutes ?? 0) : v;
  }));
  const poolMax = dims.map((_, i) => Math.max(1e-6, ...raw.map((r) => r[i] ?? 0)));
  const weightSum = dims.reduce((s, d) => s + effWeight(d), 0);

  return candidates.map((c, idx) => {
    let weighted = 0;
    dims.forEach((d, i) => {
      const value = raw[idx][i];
      // Sin dato = contribución neutra (ni premia ni castiga) — tratar
      // "no sabemos" como "0 tarjetas" favorecería injustamente a
      // candidatos que simplemente no están en el top de esa categoría.
      const norm = value == null ? 0.5 : (d.invert ? 1 - value / poolMax[i] : value / poolMax[i]);
      weighted += norm * effWeight(d);
    });
    // El ajuste de calidad de equipo (Paso 6.3) se aplica DESPUÉS, en
    // applyTeamQualityAdjustment — necesita la posición en tabla de cada
    // candidato, no solo la del equipo buscado. clamp con headroom (1.3,
    // no 1.0) para que ese ajuste posterior tenga margen antes del clamp final.
    const base = clamp(weightSum > 0 ? weighted / weightSum : 0, 0, 1.3);
    return { ...c, fit: { score: Math.round(clamp(base * 100, 0, 100)) } };
  });
}

function applyTeamQualityAdjustment(results: RMResult[], teamPositionById: Map<string, number>, totalTeams: number): RMResult[] {
  return results.map((r) => {
    const pos = r.teamId ? teamPositionById.get(r.teamId) : undefined;
    if (!pos || totalTeams <= 1) return r;
    const factor = 1 + (pos - 1) / (totalTeams - 1) * 0.12; // 0% arriba, +12% abajo de tabla
    return { ...r, fit: { score: Math.round(clamp(r.fit.score * factor, 0, 100)) } };
  });
}

// Escudo del club vía ESPN (fallback de foto, Paso 5) — se resuelve UNA
// sola vez por llamada a recommend() contra la tabla de posiciones de
// ESPN (mismo endpoint que ya usa TacticoTab, misma quirk de temporada:
// la liga argentina en ESPN identifica la temporada en curso con el año
// calendario ANTERIOR — confirmado ya en TacticoTab.tsx, se reusa el
// mismo criterio acá). Cruce por nombre con el mismo matcher por tokens
// que el resto de la app — si no matchea, sin escudo, cae directo al
// ícono genérico (nunca un espacio roto).
async function getEspnTeamLogos(): Promise<{ name: string; logo: string }[]> {
  const key = "pelotita_rm_espn_teams_v1";
  const cached = cacheGet<{ name: string; logo: string }[]>(key);
  if (cached) return cached;
  try {
    const season = new Date().getFullYear() - 1;
    const rows = await getStandings("arg.1", season);
    const list = rows.map((r) => ({ name: r.team.name, logo: espnTeamLogoUrl(r.team.id) }));
    cacheSet(key, list, POOL_TTL_MS);
    return list;
  } catch {
    return [];
  }
}

// ── Edad/altura/escudo (Paso final) — se completan SOLO sobre los 4
// candidatos finales (no sobre todo el pool, sería decenas de pedidos de
// plantel innecesarios). Para candidatos con teamId (DEF/VOL/DEL) se
// resuelve el equipo Promiedos directo por id; arqueros no tienen teamId
// confiable (ver nota más arriba) así que se busca el equipo por nombre
// (profile.team de fichajes.com) con el mismo matcher por tokens — si no
// matchea, age/height/teamLogo quedan en null, nunca inventados. Plantel
// cacheado 30 días por equipo (getSquad), se pide como máximo una vez
// por equipo distinto entre los 4 candidatos (dedupeado acá), con 250ms
// de delay entre pedidos nuevos — mismo criterio conservador que el
// resto de la app.
async function enrichWithBio(candidates: RMResult[], teams: RMTeam[]): Promise<RMResult[]> {
  const squadByTeamId = new Map<string, PromiedosSquadPlayer[]>();
  const espnTeams = await getEspnTeamLogos();
  const out: RMResult[] = [];
  for (const c of candidates) {
    const team = c.teamId
      ? teams.find((t) => t.id === c.teamId)
      : findTeamMatch(c.teamName, teams);

    const espnMatch = team ? bestTokenMatch(team.name, espnTeams, (t) => tokenizeForMatch(t.name)) : undefined;
    const teamLogo = espnMatch?.logo ?? null;

    if (!team || !team.urlName) { out.push({ ...c, teamLogo }); continue; }

    let squad = squadByTeamId.get(team.id);
    if (!squad) {
      if (squadByTeamId.size > 0) await delay(250);
      try { squad = await getSquad(team.urlName, team.id); } catch { squad = []; }
      squadByTeamId.set(team.id, squad);
    }
    const match = findSquadMatch(c.name, squad);
    out.push(match ? { ...c, age: match.age, height: match.height, teamLogo } : { ...c, teamLogo });
  }
  return out;
}

// Con datos tan dispersos (fichajes.com solo cubre el top ~20-44 de la
// liga por categoría, ver nota en lib/fichajes.ts), dos candidatos de la
// misma posición pueden terminar con el mismo score REDONDEADO aunque
// sus stats de base no sean idénticas (la diferencia real cae dentro del
// margen que se pierde al redondear a entero) — no es un bug de scoring,
// es un artefacto de redondeo sobre datos escasos. La UI pide puntajes
// visiblemente distintos entre los 4 candidatos, así que sobre el orden
// YA decidido (por el score sin redondear, antes de este paso) se fuerza
// una escalera estrictamente descendente restando 1 punto al que empata
// o invierte el orden — nunca se inventa una diferencia en los datos,
// solo se ajusta el número mostrado.
function ensureDistinctScores(sorted: RMResult[]): RMResult[] {
  const out = [...sorted];
  for (let i = 1; i < out.length; i++) {
    if (out[i].fit.score >= out[i - 1].fit.score) {
      out[i] = { ...out[i], fit: { score: Math.max(0, out[i - 1].fit.score - 1) } };
    }
  }
  return out;
}

// ── Franjas de equipo (Paso 1-2, ago 2026) — simula que un equipo
// grande pelea por los mejores candidatos de la liga y uno chico solo
// por los más accesibles. Franja ALTA es fija por poder económico/
// histórico real (NO por posición en la tabla — un "grande" sigue
// siendo grande aunque ande mal el torneo), los 30-10=20 restantes se
// dividen dinámicamente en MEDIA/BAJA por posición real en la tabla
// anual de Promiedos (mejor mitad / peor mitad). Nombres en el mismo
// formato que PROMIEDOS_ID_TO_JSON_TEAM (FootyStats/JSON), ya validado
// contra los 30 equipos reales de Promiedos.
const FRANJA_ALTA_TEAMS = new Set<string>([
  "CA River Plate", "CA Boca Juniors", "Racing Club de Avellaneda", "CA Rosario Central",
  "Estudiantes de La Plata", "CA Talleres de Cordoba", "CA San Lorenzo de Almagro",
  "CA Lanus", "CA Independiente", "Argentinos Juniors",
]);
type Franja = "ALTA" | "MEDIA" | "BAJA";

function computeDynamicFranjas(teamPositionById: Map<string, number>): { media: Set<string>; baja: Set<string> } {
  const nonFixed = [...teamPositionById.entries()]
    .filter(([id]) => {
      const jsonName = PROMIEDOS_ID_TO_JSON_TEAM[id];
      return !jsonName || !FRANJA_ALTA_TEAMS.has(jsonName);
    })
    .sort((a, b) => a[1] - b[1]); // por posición real en la tabla, mejor ubicado primero
  return {
    media: new Set(nonFixed.slice(0, 10).map(([id]) => id)),
    baja: new Set(nonFixed.slice(10, 20).map(([id]) => id)),
  };
}

function getFranja(team: RMTeam, dynamic: { media: Set<string>; baja: Set<string> }): Franja {
  const jsonName = PROMIEDOS_ID_TO_JSON_TEAM[team.id];
  if (jsonName && FRANJA_ALTA_TEAMS.has(jsonName)) return "ALTA";
  if (dynamic.media.has(team.id)) return "MEDIA";
  return "BAJA";
}

// Ventana del ranking (ya ordenado de mejor a peor fit) según la franja
// del equipo buscador — con superposición entre franjas vecinas (pedido
// explícito, para que no haya un salto brusco). Si el pool disponible es
// chico (ej. arqueros, ~15 candidatos en vez de ~90) o la ventana quedó
// angosta, se ensancha hacia el resto del pool en vez de dejar muy pocos
// candidatos para sortear con variedad real.
function selectWindow(sorted: RMResult[], franja: Franja): RMResult[] {
  const n = sorted.length;
  let start: number, end: number;
  if (franja === "ALTA") { start = 0; end = 10; }
  else if (franja === "MEDIA") { start = 7; end = 20; }
  else { start = 17; end = n; }
  start = Math.min(start, n);
  end = Math.min(end, n);
  let window = sorted.slice(start, end);
  if (window.length < 4) window = sorted.slice(Math.max(0, n - 10), n);
  if (window.length === 0) window = sorted;
  return window;
}

// Sorteo ponderado sin reemplazo (Paso 3.1) — mayor fit = más chance de
// salir, pero NUNCA 100% determinístico dentro de la ventana permitida.
// Nunca inventa candidatos: solo cambia CUÁLES de los ya calculados con
// datos reales se eligen.
function weightedSampleWithoutReplacement<T>(items: { item: T; weight: number }[], count: number): T[] {
  const pool = [...items];
  const result: T[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const total = pool.reduce((s, p) => s + p.weight, 0);
    let r = Math.random() * total;
    let idx = 0;
    for (; idx < pool.length - 1; idx++) {
      r -= pool[idx].weight;
      if (r <= 0) break;
    }
    result.push(pool[idx].item);
    pool.splice(idx, 1);
  }
  return result;
}

export interface RecommendOptions { presupuesto?: boolean; }
export interface PresupuestoResult {
  escalon: Escalon;
  techoEurM: number | null;
  enRanking: boolean;
  // Una entrada por cada cupo de composición que no encontró NINGÚN
  // candidato accesible dentro del techo — la UI la usa para mostrar
  // "sin candidatos accesibles" en vez de dejar el cupo vacío o mostrar
  // a alguien fuera de rango.
  missingPositions: RMPosition[];
}

export async function recommend(
  team: RMTeam, opts?: RecommendOptions,
): Promise<{ picks: RMResult[]; composition: RMPosition[]; presupuesto?: PresupuestoResult }> {
  const groups = await getTablaPosiciones(LEAGUE_SLUG);
  const composition = getComposition(team);
  const teamPositionById = new Map<string, number>();
  for (const g of groups) for (const t of g.tables) for (const r of t.rows) teamPositionById.set(r.team.id, r.position);
  const totalTeams = teamPositionById.size || 30;

  const needByPosition = new Map<RMPosition, number>();
  for (const p of composition) needByPosition.set(p, (needByPosition.get(p) ?? 0) + 1);

  const franja = getFranja(team, computeDynamicFranjas(teamPositionById));
  const needFactors = computeNeedFactors(team);
  const escalonInfo = opts?.presupuesto ? getEscalonEquipo(team) : null;
  const ownClubTransfermarkt = PROMIEDOS_ID_TO_RANKING_TEAM[team.id];

  // Paso 3.2: no repetir siempre los mismos 4 al buscar el MISMO equipo
  // dos veces seguidas — se guarda en localStorage (sin TTL, se compara
  // siempre contra la última búsqueda real de ESE equipo puntual) y si
  // el sorteo da 3 o 4 nombres iguales a la vez anterior, se vuelve a
  // sortear (hasta 6 intentos, después se acepta lo que salga para no
  // colgar la búsqueda).
  const lastKey = `pelotita_rm_last_picks_${team.id}`;
  const lastNames = cacheGet<string[]>(lastKey) ?? [];

  let picks: RMResult[] = [];
  let missingPositions: RMPosition[] = [];
  const MAX_ATTEMPTS = 6;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    picks = [];
    missingPositions = [];
    for (const [position, count] of needByPosition) {
      const pool = await getCandidatePool(position);
      // Para arquero no hay teamId confiable siempre (el JSON no trae
      // team_id de Promiedos) — se excluye por NOMBRE contra el equipo
      // buscado en vez de por ID, best-effort.
      const eligible = position === "ARQ"
        ? pool.filter((c) => !c.teamName || normalize(c.teamName) !== normalize(team.shortName || team.name))
        : pool.filter((c) => c.teamId !== team.id);

      // Gran DT ya NO filtra a nadie afuera (ver nota del bug al inicio
      // del archivo) — solo se adjunta el puntaje real como dato,
      // WEIGHTS lo usa como bonus de forma.
      const grandTPoints = await getGrandTPointsBySurname(position);
      const withGrandT = eligible.map((c) => ({ ...c, grandTPoints: grandTPoints.get(normalize(c.surname)) ?? null }));

      // Modo presupuesto (Paso 2): cruce por nombre contra el pool de
      // valor de mercado, filtrado por techo del escalón del equipo
      // buscador y excluido por club propio (comparando el mismo campo
      // `club`, no el teamId de Promiedos). Sin valor conocido → afuera,
      // nunca se asume "barato" sobre un dato que no existe.
      const withValor = escalonInfo
        ? withGrandT
            .map((c) => {
              const match = findValueMatch(c.name, position);
              return { ...c, valorMercadoEUR: match?.valor_mercado_eur_millones ?? null, clubActual: match?.club ?? null };
            })
            .filter((c) => {
              if (c.valorMercadoEUR == null || c.clubActual == null) return false;
              if (escalonInfo.techoEurM != null && c.valorMercadoEUR > escalonInfo.techoEurM) return false;
              if (ownClubTransfermarkt && normalize(c.clubActual) === normalize(ownClubTransfermarkt)) return false;
              return true;
            })
        : withGrandT;

      const scored = applyTeamQualityAdjustment(scoreCandidates(withValor, position, needFactors), teamPositionById, totalTeams);
      let sorted = scored.sort((a, b) => b.fit.score - a.fit.score);

      if (escalonInfo) {
        // Paso 3: preferir candidatos cerca del techo del escalón, no
        // siempre el más barato posible. Sin techo (escalón A) se usa el
        // máximo valor real disponible en este pool ya filtrado como
        // referencia — sigue premiando "el mejor que se puede pagar" en
        // vez de un techo infinito sin sentido práctico para el score.
        const techoEfectivo = escalonInfo.techoEurM ?? Math.max(1e-6, ...sorted.map((c) => c.valorMercadoEUR ?? 0));
        sorted = sorted
          .map((c) => {
            const scoreValorRelativo = clamp((c.valorMercadoEUR ?? 0) / techoEfectivo, 0, 1);
            const scoreFinal = clamp(c.fit.score * 0.7 + scoreValorRelativo * 100 * 0.3, 0, 100);
            return { ...c, fit: { score: Math.round(scoreFinal) } };
          })
          .sort((a, b) => b.fit.score - a.fit.score);
      }

      // Paso 1-2: la franja heurística (poder económico simulado por lista
      // fija + posición en tabla) decide qué ventana del ranking está
      // disponible EN MODO CLÁSICO. En modo presupuesto ya hay un filtro
      // de acceso económico real (Transfermarkt) más preciso — aplicar
      // ADEMÁS la franja heurística encima solo achicaría el pool sin
      // sentido, así que se sortea sobre TODO el pool ya filtrado por
      // techo. Paso 3.1 (sorteo ponderado, no siempre el de mayor puntaje)
      // aplica igual en los dos modos.
      const window = escalonInfo ? sorted : selectWindow(sorted, franja);
      const chosen = weightedSampleWithoutReplacement(
        window.map((c) => ({ item: c, weight: Math.max(1, c.fit.score) })),
        count,
      );
      const top = ensureDistinctScores(chosen.sort((a, b) => b.fit.score - a.fit.score));
      picks.push(...top);

      if (escalonInfo && top.length < count) {
        for (let i = 0; i < count - top.length; i++) missingPositions.push(position);
      }
    }

    const currentNames = picks.map((p) => p.name);
    const overlap = currentNames.filter((n) => lastNames.includes(n)).length;
    if (lastNames.length === 0 || overlap <= 1 || attempt === MAX_ATTEMPTS - 1) break;
  }
  cacheSet(lastKey, picks.map((p) => p.name));

  const teams = await getTeams();
  const enriched = await enrichWithBio(picks, teams);
  const presupuesto: PresupuestoResult | undefined = escalonInfo
    ? { escalon: escalonInfo.escalon, techoEurM: escalonInfo.techoEurM, enRanking: escalonInfo.enRanking, missingPositions }
    : undefined;
  return { picks: enriched, composition, presupuesto };
}
