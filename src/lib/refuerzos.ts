// Buscador de Refuerzos — recomendación por posición adaptada al equipo.
//
// ── Rediseño v3 (ago 2026): fuera API-Football por completo ────────────
// v1/v2 dependían de API-Football para bio o stats — el plan gratis solo
// da temporadas 2022-2024, inútil para "temporada actual". v3 saca esa
// dependencia entera: SOLO Promiedos (lib/promiedos.ts, sin tocar, mismo
// endpoint que ya usa Gran DT) para estadísticas de rendimiento —
// 100% temporada 2026 (Apertura + lo jugado del Clausura).
//
// ── Investigación previa a este rediseño ────────────────────────────────
// - ESPN (lib/espn.ts, sin tocar) SÍ tiene atajadas/goles recibidos/goles/
//   asistencias/tarjetas por jugador — confirmado en `summary.rosters[].
//   roster[].stats` — pero es POR PARTIDO INDIVIDUAL, no acumulado de
//   temporada. Sumar esto para toda la liga implicaría pedir el summary
//   de cada partido jugado (decenas/cientos), no se hizo por costo/
//   latencia — no por límite de cuota, es una fuente distinta a
//   API-Football (sin rate limit duro) pero el volumen de pedidos para
//   agregar una temporada completa de TODOS los equipos es
//   desproporcionado para este alcance.
// - NINGUNA fuente (Promiedos ni ESPN) expone foto de cara del jugador —
//   Promiedos no tiene el campo en absoluto; ESPN solo trae imagen de
//   camiseta genérica (`jerseyImages`), no headshot. Todas las tarjetas
//   usan silueta genérica — no es una limitación de implementación, es
//   que el dato no existe en ninguna fuente disponible.
// - Ninguna fuente da "vallas invictas" ATRIBUIBLE A UN ARQUERO puntual
//   (solo a nivel equipo, vía goles en contra de la tabla de posiciones)
//   ni minutos/partidos jugados por jugador. Arquero se queda sin pool de
//   candidatos por esto (ver recommend() más abajo) — Defensor/
//   Mediocampista/Delantero muestran esos campos vacíos en la ficha
//   (nunca inventados) pero sí tienen goles/asistencias/tarjetas reales.
// - La columna de Promiedos rotulada "Barridas ganadas" en realidad trae
//   el campo `TotalFoulsConceded` (faltas cometidas) — mal rotulada en el
//   sitio. Se usa acá SOLO como señal interna de scoring para Defensor
//   (menos faltas = mejor), no se muestra en la ficha (no estaba pedido).
//
// ── xG manual (Paso 1) ───────────────────────────────────────────────
// Ninguna de las 3 fuentes integradas en el proyecto tiene xG. Se carga a
// mano por equipo (localStorage, sin TTL — se actualiza cuando el usuario
// lo actualiza, no automáticamente) y se combina con goles reales de
// Promiedos para el perfil de necesidad.
//
// ── Diagnóstico silencioso (Paso 2/5/7) ──────────────────────────────
// El perfil de necesidad y el desempate con Gran DT se calculan acá pero
// NUNCA se exponen como texto en la UI (a pedido explícito) — el
// componente solo pinta los 4 resultados finales. El cálculo en sí queda
// documentado en comentarios como el resto del proyecto.

import { getTablaPosiciones, PROMIEDOS_LEAGUES, type PromiedosStandingGroup } from "@/lib/promiedos";
import { getGrandTRanking, getLatestGrandTSheet, type GrandTPosition } from "@/lib/grandt";

const LEAGUE_SLUG = "arg.1" as const; // Liga Profesional Argentina (Primera División) — mismo scope que Gran DT

export type RefuerzoPosition = "ARQ" | "DEF" | "VOL" | "DEL";

export const REFUERZO_POSITIONS: { key: RefuerzoPosition; label: string }[] = [
  { key: "ARQ", label: "Arquero" },
  { key: "DEF", label: "Defensor / Lateral" },
  { key: "VOL", label: "Mediocampista" },
  { key: "DEL", label: "Delantero / Extremo" },
];

const PROMIEDOS_POSITION_TO_BUCKET: Record<string, RefuerzoPosition> = {
  "Arqueros": "ARQ", "Defensores": "DEF", "Mediocampistas": "VOL", "Delanteros": "DEL",
};

export interface RefuerzoTeam { id: string; name: string; shortName: string; }

export interface RefuerzoCandidate {
  id: string;       // normalize(nombre) — Promiedos no da un ID de jugador estable
  name: string;
  surname: string;  // Promiedos `sname` — para cruzar contra la planilla de Gran DT
  teamId: string;
  teamName: string;
  position: RefuerzoPosition;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  foulsConceded: number; // interno, no se muestra — ver nota sobre "Barridas ganadas"
}

export interface FitResult { score: number; }
export type RefuerzoResult = RefuerzoCandidate & { fit: FitResult };

export interface TeamXG { xGFor: number; xGAgainst: number; updatedAt: string; }

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}
function clamp(v: number, min: number, max: number) { return Math.min(max, Math.max(min, v)); }

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
const POOL_TTL_MS = 24 * 60 * 60 * 1000;       // Promiedos cambia con la fecha jugada
const GRANDT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // mismo TTL que ya usa Gran DT para su ranking

// ── xG manual (Paso 1) — localStorage puro, sin TTL, edición directa ───
const XG_KEY = "pelotita_refuerzos_xg";

export function getAllTeamXG(): Record<string, TeamXG> {
  try { return JSON.parse(localStorage.getItem(XG_KEY) ?? "{}"); } catch { return {}; }
}
export function setTeamXG(teamId: string, xGFor: number, xGAgainst: number) {
  const all = getAllTeamXG();
  all[teamId] = { xGFor, xGAgainst, updatedAt: new Date().toISOString() };
  localStorage.setItem(XG_KEY, JSON.stringify(all));
}
export function clearTeamXG(teamId: string) {
  const all = getAllTeamXG();
  delete all[teamId];
  localStorage.setItem(XG_KEY, JSON.stringify(all));
}

// ── Promiedos: equipos + pool de candidatos (mismo proxy que lib/
// promiedos.ts, pedido con fetch propio para leer también Tarjetas/
// Faltas que las funciones exportadas de ahí no exponen — no modifica
// ese archivo). ──────────────────────────────────────────────────────
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
function buildCandidatePool(raw: any, teamNameById: Map<string, { name: string; shortName: string }>): RefuerzoCandidate[] {
  const pool = new Map<string, RefuerzoCandidate>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function ensure(obj: any): RefuerzoCandidate | null {
    const name: string | undefined = obj?.name;
    const bucket = PROMIEDOS_POSITION_TO_BUCKET[obj?.position];
    if (!name || !bucket) return null;
    const id = normalize(name);
    let c = pool.get(id);
    if (!c) {
      const teamId: string = obj.team_id ?? "";
      c = {
        id, name, surname: obj.sname || name.split(/\s+/).slice(-1)[0] || name,
        teamId, teamName: teamNameById.get(teamId)?.shortName ?? teamNameById.get(teamId)?.name ?? "",
        position: bucket, goals: 0, assists: 0, yellowCards: 0, redCards: 0, foulsConceded: 0,
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
      else if (t.name === "Tarjetas Amarillas") c.yellowCards = value;
      else if (t.name === "Tarjetas Rojas") c.redCards = value;
      else if (t.name === "Barridas ganadas") c.foulsConceded = value; // = TotalFoulsConceded real
    }
  }
  return [...pool.values()];
}

export async function getTeams(): Promise<RefuerzoTeam[]> {
  const key = "pelotita_refuerzos_teams_v3";
  const cached = cacheGet<RefuerzoTeam[]>(key);
  if (cached) return cached;
  const groups = await getTablaPosiciones(LEAGUE_SLUG);
  const byId = new Map<string, RefuerzoTeam>();
  for (const g of groups) for (const t of g.tables) for (const r of t.rows) {
    byId.set(r.team.id, { id: r.team.id, name: r.team.name, shortName: r.team.shortName });
  }
  const teams = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  cacheSet(key, teams, POOL_TTL_MS);
  return teams;
}

export async function getCandidatePool(): Promise<RefuerzoCandidate[]> {
  const key = `pelotita_refuerzos_pool_v3_${LEAGUE_SLUG}`;
  const cached = cacheGet<RefuerzoCandidate[]>(key);
  if (cached) return cached;
  const [raw, groups] = await Promise.all([fetchRawLeagueData(), getTablaPosiciones(LEAGUE_SLUG)]);
  const pool = buildCandidatePool(raw, flattenTeams(groups));
  cacheSet(key, pool, POOL_TTL_MS);
  return pool;
}

interface TeamStyle { goalsForAvg: number; goalsAgainstAvg: number; played: number; }

function styleFromStandings(teamId: string, groups: PromiedosStandingGroup[]): TeamStyle {
  for (const g of groups) for (const t of g.tables) for (const r of t.rows) {
    if (r.team.id === teamId) {
      const p = r.played;
      return {
        goalsForAvg: p > 0 ? Math.round((r.goalsFor / p) * 100) / 100 : 0,
        goalsAgainstAvg: p > 0 ? Math.round((r.goalsAgainst / p) * 100) / 100 : 0,
        played: p,
      };
    }
  }
  return { goalsForAvg: 0, goalsAgainstAvg: 0, played: 0 };
}

// ── Gran DT: puntos por jugador de esa posición, solo para desempate
// silencioso (Paso 5.2) — nunca se muestra en la UI. Best-effort: si el
// descubrimiento de la planilla vigente falla, no hay desempate y listo,
// no rompe la búsqueda principal. ───────────────────────────────────────
async function getGrandTPointsBySurname(position: RefuerzoPosition): Promise<Map<string, number>> {
  const key = `pelotita_refuerzos_grandt_${position}`;
  const cached = cacheGet<Record<string, number>>(key);
  if (cached) return new Map(Object.entries(cached));
  try {
    const latest = await getLatestGrandTSheet();
    if (!latest?.sheetUrl) return new Map();
    const players = await getGrandTRanking(latest.sheetUrl, position as GrandTPosition);
    const map = new Map<string, number>();
    for (const p of players) {
      const surname = p.name.split(",")[0]?.trim() ?? p.name; // planilla: "Apellido, Nombre"
      map.set(normalize(surname), p.points);
    }
    cacheSet(key, Object.fromEntries(map), GRANDT_TTL_MS);
    return map;
  } catch {
    return new Map();
  }
}

// ── Paso 2: perfil de necesidad (interno, nunca se explica en la UI) ───
interface NeedProfile {
  incumbents: RefuerzoCandidate[];
  defensiveNeed: number;
  offensiveNeed: number;
  depthNeed: number;
}

async function getNeedProfile(team: RefuerzoTeam, position: RefuerzoPosition, pool: RefuerzoCandidate[], groups: PromiedosStandingGroup[]): Promise<NeedProfile> {
  const incumbents = pool.filter((c) => c.teamId === team.id && c.position === position);
  const style = styleFromStandings(team.id, groups);
  const xg = getAllTeamXG()[team.id];

  // Combina goles reales (siempre disponibles) con xG cargado a mano (si
  // existe para este equipo) — promedio simple. Sin xG cargado, se usa
  // solo el dato real de Promiedos.
  const attackSignal = xg ? (style.goalsForAvg + xg.xGFor) / 2 : style.goalsForAvg;
  const defenseSignal = xg ? (style.goalsAgainstAvg + xg.xGAgainst) / 2 : style.goalsAgainstAvg;

  const offensiveNeed = clamp(1.5 - attackSignal * 0.4, 0.7, 1.5);
  const defensiveNeed = clamp(0.7 + defenseSignal * 0.5, 0.7, 1.5);
  const depthNeed = incumbents.length <= 1 ? 1.3 : incumbents.length <= 3 ? 1.1 : 1.0;

  return { incumbents, defensiveNeed, offensiveNeed, depthNeed };
}

// ── Paso 5.1: scoring (interno) ─────────────────────────────────────────
// ARQ sin entrada: ni Promiedos ni ESPN dan estadística de arquero
// atribuible a un jugador puntual para esta liga (ver recommend()).
const WEIGHTS: Record<RefuerzoPosition, { key: "goals" | "assists" | "yellowCards" | "redCards" | "foulsConceded"; invert?: boolean; weight: number; kind: "def" | "off" }[]> = {
  ARQ: [],
  DEF: [
    { key: "yellowCards",   invert: true, weight: 0.30, kind: "def" },
    { key: "redCards",      invert: true, weight: 0.25, kind: "def" },
    { key: "foulsConceded", invert: true, weight: 0.20, kind: "def" },
    { key: "goals",         weight: 0.15, kind: "off" },
    { key: "assists",       weight: 0.10, kind: "off" },
  ],
  VOL: [
    { key: "assists",     weight: 0.45, kind: "off" },
    { key: "goals",       weight: 0.30, kind: "off" },
    { key: "yellowCards", invert: true, weight: 0.15, kind: "def" },
    { key: "redCards",    invert: true, weight: 0.10, kind: "def" },
  ],
  DEL: [
    { key: "goals",       weight: 0.55, kind: "off" },
    { key: "assists",     weight: 0.35, kind: "off" },
    { key: "yellowCards", invert: true, weight: 0.10, kind: "def" },
  ],
};

function scoreCandidates(candidates: RefuerzoCandidate[], position: RefuerzoPosition, need: NeedProfile): RefuerzoResult[] {
  const dims = WEIGHTS[position].map((d) => {
    let effectiveWeight = d.weight;
    if (d.kind === "def") effectiveWeight *= need.defensiveNeed;
    if (d.kind === "off") effectiveWeight *= need.offensiveNeed;
    return { ...d, effectiveWeight };
  });
  const weightSum = dims.reduce((s, d) => s + d.effectiveWeight, 0);
  const raw = candidates.map((c) => dims.map((d) => c[d.key]));
  const maxes = dims.map((_, i) => Math.max(1e-6, ...raw.map((r) => r[i])));

  return candidates.map((c, idx) => {
    let weighted = 0;
    dims.forEach((d, i) => {
      const ratio = raw[idx][i] / maxes[i];
      const norm = d.invert ? 1 - ratio : ratio;
      weighted += norm * d.effectiveWeight;
    });
    const base = weightSum > 0 ? weighted / weightSum : 0;
    const boosted = base * need.depthNeed;
    return { ...c, fit: { score: Math.round(clamp(boosted * 100, 0, 100)) } };
  });
}

// Desempate silencioso (Paso 5.2): si dos candidatos quedan a menos de 3
// puntos de fit, gana el de más puntos acumulados en Gran DT de esa
// posición. Comparador "casi empate" no es estrictamente transitivo en
// una lista larga — aceptable acá porque solo se usa para ordenar un
// puñado de candidatos antes de cortar el top 4, no como ranking formal.
function sortWithTiebreak(candidates: RefuerzoResult[], grandTPoints: Map<string, number>): RefuerzoResult[] {
  return [...candidates].sort((a, b) => {
    const diff = b.fit.score - a.fit.score;
    if (Math.abs(diff) >= 3) return diff;
    const gtA = grandTPoints.get(normalize(a.surname)) ?? 0;
    const gtB = grandTPoints.get(normalize(b.surname)) ?? 0;
    if (gtA !== gtB) return gtB - gtA;
    return diff;
  });
}

// ── Punto de entrada: top 4 candidatos (perfil de necesidad + desempate
// con Gran DT, ambos internos, nunca expuestos) ─────────────────────────
export async function recommend(team: RefuerzoTeam, position: RefuerzoPosition): Promise<{ candidates: RefuerzoResult[]; noDataForPosition: boolean }> {
  if (position === "ARQ") {
    // Sin estadística de arquero atribuible a un jugador puntual en
    // ninguna fuente — no se arma ranking con datos de otra posición.
    return { candidates: [], noDataForPosition: true };
  }

  const [pool, groups] = await Promise.all([getCandidatePool(), getTablaPosiciones(LEAGUE_SLUG)]);
  const need = await getNeedProfile(team, position, pool, groups);
  const eligible = pool.filter((c) => c.position === position && c.teamId !== team.id);
  const scored = scoreCandidates(eligible, position, need);

  const grandTPoints = await getGrandTPointsBySurname(position);
  const ordered = sortWithTiebreak(scored, grandTPoints);

  return { candidates: ordered.slice(0, 4), noDataForPosition: false };
}

export async function refreshRecommendation(team: RefuerzoTeam, position: RefuerzoPosition) {
  localStorage.removeItem(`pelotita_refuerzos_pool_v3_${LEAGUE_SLUG}`);
  localStorage.removeItem(`pelotita_refuerzos_grandt_${position}`);
  return recommend(team, position);
}
