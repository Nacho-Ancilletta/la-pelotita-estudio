// Refuerzo Mágico — recomendación automática de 4 jugadores por equipo,
// decidiendo puertas adentro en qué posiciones reforzar. Fuentes: SOLO
// Promiedos (goles/asistencias, tabla anual) + fichajes.com (minutos,
// partidos, tarjetas, paradas, vallas invictas — lo que Promiedos/ESPN NO
// tienen, confirmado en el Paso 0 de esta tarea). Gran DT solo para el
// filtro de forma (Paso 4.3). CERO API-Football — no queda ni un import.
//
// Todo el diagnóstico de necesidad y la composición de posiciones es
// interno — nunca se expone en la UI (pedido explícito).

import { getTablaPosiciones, PROMIEDOS_LEAGUES, type PromiedosStandingGroup } from "@/lib/promiedos";
import { getGrandTRanking, getLatestGrandTSheet, type GrandTPosition } from "@/lib/grandt";
import { getFichajesData, getGoalkeeperCandidates, bySurname, photoUrlFromSlug, type FichajesPlayerData } from "@/lib/fichajes";
import { XG_DATA } from "@/lib/xg-data";

const LEAGUE_SLUG = "arg.1" as const;

export type RMPosition = "ARQ" | "DEF" | "VOL" | "DEL";

const PROMIEDOS_POSITION_TO_BUCKET: Record<string, RMPosition> = {
  "Arqueros": "ARQ", "Defensores": "DEF", "Mediocampistas": "VOL", "Delanteros": "DEL",
};

export interface RMTeam { id: string; name: string; shortName: string; }

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
  // number|null: fichajes.com solo lista el top ~20-24 de la liga en cada
  // una de estas estadísticas (menos minutos, que sí cubre ~140 — ver
  // nota en lib/fichajes.ts) — null = el jugador no está entre esos
  // ~20-24, no significa que valga 0.
  minutes: number | null;
  matches: number | null;
  yellowCards: number | null;
  redCards: number | null;
  saves: number | null;
  cleanSheets: number | null;
}
export interface FitResult { score: number; }
export type RMResult = RMCandidate & { fit: FitResult };

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
const POOL_TTL_MS = 24 * 60 * 60 * 1000;
const GRANDT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_MINUTES_FOR_CLEAN_SHEETS = 900; // Paso 4.4

// ── Equipos (Promiedos, tabla anual) ────────────────────────────────────
export async function getTeams(): Promise<RMTeam[]> {
  const key = "pelotita_rm_teams_v1";
  const cached = cacheGet<RMTeam[]>(key);
  if (cached) return cached;
  const groups = await getTablaPosiciones(LEAGUE_SLUG);
  const byId = new Map<string, RMTeam>();
  for (const g of groups) for (const t of g.tables) for (const r of t.rows) {
    byId.set(r.team.id, { id: r.team.id, name: r.team.name, shortName: r.team.shortName });
  }
  const teams = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  cacheSet(key, teams, POOL_TTL_MS);
  return teams;
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
    if (!name || !bucket || bucket === "ARQ") return null; // arqueros salen de fichajes.com, no de acá
    const id = normalize(name);
    let c = pool.get(id);
    if (!c) {
      const teamId: string = obj.team_id ?? "";
      c = {
        id, name, surname: obj.sname || name.split(/\s+/).slice(-1)[0] || name,
        teamId, teamName: teamNameById.get(teamId)?.shortName ?? teamNameById.get(teamId)?.name ?? "",
        position: bucket, photo: null, goals: 0, assists: 0, minutes: null, matches: null,
        yellowCards: null, redCards: null, saves: null, cleanSheets: null,
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

// Enriquece un candidato de campo con datos de fichajes.com (minutos,
// partidos, tarjetas, vallas invictas para defensores) — cruce por
// apellido, best-effort (ver nota en lib/fichajes.ts).
function enrichWithFichajes(c: RMCandidate, bySname: Map<string, FichajesPlayerData>): RMCandidate {
  const fd = bySname.get(normalize(c.surname));
  if (!fd) return c;
  return {
    ...c,
    minutes: fd.minutes, matches: fd.matches,
    yellowCards: fd.yellowCards, redCards: fd.redCards,
    cleanSheets: c.position === "DEF" ? fd.cleanSheets : null, // solo relevante como ficha de Defensor
    photo: photoUrlFromSlug(fd.slug),
  };
}

export async function getCandidatePool(position: RMPosition): Promise<RMCandidate[]> {
  if (position === "ARQ") {
    const key = "pelotita_rm_pool_arq_v1";
    const cached = cacheGet<RMCandidate[]>(key);
    if (cached) return cached;
    const keepers = await getGoalkeeperCandidates();
    const pool: RMCandidate[] = keepers.map((k) => ({
      id: k.slug, name: k.name, surname: k.slug.split("-").slice(-1)[0] ?? k.name,
      teamId: null, teamName: k.team ?? "—", position: "ARQ",
      photo: k.photo, goals: 0, assists: 0, minutes: k.minutes, matches: k.matches,
      yellowCards: k.yellowCards, redCards: k.redCards, saves: k.saves, cleanSheets: k.cleanSheets,
    }));
    cacheSet(key, pool, POOL_TTL_MS);
    return pool;
  }

  const key = `pelotita_rm_pool_v1_${LEAGUE_SLUG}`;
  const cached = cacheGet<RMCandidate[]>(key);
  let allOutfield: RMCandidate[];
  if (cached) {
    allOutfield = cached;
  } else {
    const [raw, groups, fichajes] = await Promise.all([fetchRawLeagueData(), getTablaPosiciones(LEAGUE_SLUG), getFichajesData()]);
    const bySname = bySurname(fichajes);
    allOutfield = buildPromiedosPool(raw, flattenTeams(groups)).map((c) => enrichWithFichajes(c, bySname));
    cacheSet(key, allOutfield, POOL_TTL_MS);
  }
  return allOutfield.filter((c) => c.position === position);
}

// ── Paso 2/3: perfil de necesidad + composición de posiciones (interno) ──
interface NeedProfile {
  composition: RMPosition[];
  teamPosition: number; // posición en la tabla anual (1=puntero) — para el ajuste de calidad de equipo (Paso 6.3)
  totalTeams: number;
}

function pctDeviation(value: number, avg: number): number {
  return avg !== 0 ? ((value - avg) / avg) * 100 : 0;
}

async function getNeedProfile(team: RMTeam, groups: PromiedosStandingGroup[]): Promise<NeedProfile> {
  const annual = groups.flatMap((g) => g.tables).find((t) => /anual/i.test(t.name));
  const rows = annual?.rows ?? [];
  const row = rows.find((r) => r.team.id === team.id);
  const withGames = rows.filter((r) => r.played > 0);
  const leagueAvgFor = withGames.length ? withGames.reduce((s, r) => s + r.goalsFor / r.played, 0) / withGames.length : 0;
  const leagueAvgAgainst = withGames.length ? withGames.reduce((s, r) => s + r.goalsAgainst / r.played, 0) / withGames.length : 0;
  const forPerGame = row && row.played > 0 ? row.goalsFor / row.played : 0;
  const againstPerGame = row && row.played > 0 ? row.goalsAgainst / row.played : 0;

  const golesForDev = pctDeviation(forPerGame, leagueAvgFor);
  const golesAgainstDev = pctDeviation(againstPerGame, leagueAvgAgainst);

  // xG: promedio de liga calculado solo entre los equipos que sí tienen
  // xG cargado a mano (Paso 1) — si ninguno lo tiene todavía, esta pata
  // del diagnóstico se ignora y el cálculo sigue solo con goles reales.
  const xg = XG_DATA[team.id];
  let xgForDev = 0, xgAgainstDev = 0, hasXG = false;
  if (xg?.xGFor != null && xg?.xGAgainst != null) {
    const loaded = Object.values(XG_DATA).filter((t) => t.xGFor != null && t.xGAgainst != null);
    if (loaded.length > 0) {
      const avgXgFor = loaded.reduce((s, t) => s + (t.xGFor as number), 0) / loaded.length;
      const avgXgAgainst = loaded.reduce((s, t) => s + (t.xGAgainst as number), 0) / loaded.length;
      xgForDev = pctDeviation(xg.xGFor, avgXgFor);
      xgAgainstDev = pctDeviation(xg.xGAgainst, avgXgAgainst);
      hasXG = true;
    }
  }

  // Brecha ofensiva: solo la parte "por debajo del promedio" cuenta (un
  // equipo que marca MÁS que el promedio no tiene brecha ofensiva por
  // eso). Ídem brecha defensiva con "por encima del promedio" en contra.
  const offFromGoals = Math.max(0, -golesForDev);
  const offFromXG = hasXG ? Math.max(0, -xgForDev) : 0;
  const brechaOfensiva = hasXG ? (offFromGoals + offFromXG) / 2 : offFromGoals;

  const defFromGoals = Math.max(0, golesAgainstDev);
  const defFromXG = hasXG ? Math.max(0, xgAgainstDev) : 0;
  const brechaDefensiva = hasXG ? (defFromGoals + defFromXG) / 2 : defFromGoals;

  const diff = brechaDefensiva - brechaOfensiva;
  let composition: RMPosition[];
  if (diff > 15) composition = ["ARQ", "DEF", "DEF", "VOL"];
  else if (-diff > 15) composition = ["DEL", "DEL", "VOL", "VOL"];
  else composition = ["DEL", "VOL", "DEF", "DEF"]; // parejo: 2 ofensivos + 2 defensivos

  return { composition, teamPosition: row?.position ?? Math.ceil(rows.length / 2), totalTeams: rows.length || 30 };
}

// ── Gran DT: filtro DURO de forma (Paso 4.3) ────────────────────────────
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
// Pesos por posición — criterio futbolístico: para un delantero pesa más
// goles/90 que asistencias/90, para un mediocampista es al revés (más
// asistencias/pases de gol que goles); un defensor pondera fuerte vallas
// invictas + disciplina; un arquero, paradas/90 + vallas invictas.
const WEIGHTS: Record<RMPosition, { key: keyof RMCandidate; per90?: boolean; invert?: boolean; weight: number }[]> = {
  ARQ: [
    { key: "saves", per90: true, weight: 0.40 },
    { key: "cleanSheets", weight: 0.35 },
    { key: "yellowCards", invert: true, weight: 0.15 },
    { key: "redCards", invert: true, weight: 0.10 },
  ],
  DEF: [
    { key: "cleanSheets", weight: 0.35 },
    { key: "assists", per90: true, weight: 0.15 },
    { key: "goals", per90: true, weight: 0.10 },
    { key: "yellowCards", invert: true, weight: 0.25 },
    { key: "redCards", invert: true, weight: 0.15 },
  ],
  VOL: [
    { key: "assists", per90: true, weight: 0.45 },
    { key: "goals", per90: true, weight: 0.30 },
    { key: "yellowCards", invert: true, weight: 0.15 },
    { key: "redCards", invert: true, weight: 0.10 },
  ],
  DEL: [
    { key: "goals", per90: true, weight: 0.55 },
    { key: "assists", per90: true, weight: 0.35 },
    { key: "yellowCards", invert: true, weight: 0.10 },
  ],
};

function per90(value: number, minutes: number): number {
  return minutes > 0 ? (value / minutes) * 90 : 0;
}

// raw[candidato][dimensión] = número, o null si fichajes.com no tiene ese
// dato para ese jugador puntual (fuera del top ~20-24 de esa categoría —
// ver nota en RMCandidate). null NO es lo mismo que 0.
function scoreCandidates(candidates: RMCandidate[], position: RMPosition): RMResult[] {
  const dims = WEIGHTS[position];
  const raw: (number | null)[][] = candidates.map((c) => dims.map((d) => {
    const v = c[d.key] as number | null;
    if (v == null) return null; // sin dato para esta dimensión — no se inventa un 0
    // Vallas invictas solo pesan si el candidato tiene 900'+ en el año
    // (Paso 4.4) — se ve el número real en la ficha igual, esto solo
    // afecta el peso en el cálculo.
    if (d.key === "cleanSheets" && (c.minutes ?? 0) < MIN_MINUTES_FOR_CLEAN_SHEETS) return 0;
    return d.per90 ? per90(v, c.minutes ?? 0) : v;
  }));
  const poolMax = dims.map((_, i) => Math.max(1e-6, ...raw.map((r) => r[i] ?? 0)));
  const weightSum = dims.reduce((s, d) => s + d.weight, 0);

  return candidates.map((c, idx) => {
    let weighted = 0;
    dims.forEach((d, i) => {
      const value = raw[idx][i];
      // Sin dato = contribución neutra (ni premia ni castiga) — tratar
      // "no sabemos" como "0 tarjetas" favorecería injustamente a
      // candidatos que simplemente no están en el top de esa categoría.
      const norm = value == null ? 0.5 : (d.invert ? 1 - value / poolMax[i] : value / poolMax[i]);
      weighted += norm * d.weight;
    });
    // El ajuste de calidad de equipo (Paso 6.3) se aplica DESPUÉS, en
    // applyTeamQualityAdjustment — necesita la posición en tabla de cada
    // candidato, no solo la del equipo buscado, así que no tiene sentido
    // calcularlo acá adentro. clamp con headroom (1.3, no 1.0) para que
    // ese ajuste posterior tenga margen antes del clamp final a 100.
    const base = clamp(weightSum > 0 ? weighted / weightSum : 0, 0, 1.3);
    return { ...c, fit: { score: Math.round(clamp(base * 100, 0, 100)) } };
  });
}

// Ajuste de calidad de equipo aplicado como paso separado (necesita la
// posición en tabla de CADA candidato, no solo del equipo buscado).
function applyTeamQualityAdjustment(results: RMResult[], teamPositionById: Map<string, number>, totalTeams: number): RMResult[] {
  return results.map((r) => {
    const pos = r.teamId ? teamPositionById.get(r.teamId) : undefined;
    if (!pos || totalTeams <= 1) return r;
    const factor = 1 + (pos - 1) / (totalTeams - 1) * 0.12; // 0% arriba, +12% abajo de tabla
    return { ...r, fit: { score: Math.round(clamp(r.fit.score * factor, 0, 100)) } };
  });
}

export async function recommend(team: RMTeam): Promise<{ picks: RMResult[]; composition: RMPosition[] }> {
  const groups = await getTablaPosiciones(LEAGUE_SLUG);
  const need = await getNeedProfile(team, groups);
  const teamPositionById = new Map<string, number>();
  for (const g of groups) for (const t of g.tables) for (const r of t.rows) teamPositionById.set(r.team.id, r.position);

  const needByPosition = new Map<RMPosition, number>();
  for (const p of need.composition) needByPosition.set(p, (needByPosition.get(p) ?? 0) + 1);

  const picks: RMResult[] = [];
  for (const [position, count] of needByPosition) {
    const pool = (await getCandidatePool(position)).filter((c) => c.teamId !== team.id || position === "ARQ");
    // Para arquero no hay teamId confiable siempre (fichajes.com no
    // siempre resuelve equipo) — se excluye por NOMBRE contra el plantel
    // conocido del equipo buscado en vez de por ID, best-effort.
    const eligible = position === "ARQ"
      ? pool.filter((c) => !c.teamName || normalize(c.teamName) !== normalize(team.shortName || team.name))
      : pool;

    const grandTPoints = await getGrandTPointsBySurname(position);
    const leaderPoints = Math.max(0, ...eligible.map((c) => grandTPoints.get(normalize(c.surname)) ?? 0));
    // Filtro duro Gran DT (Paso 4.3): afuera si está por debajo del 20%
    // del líder de su posición — salvo que no haya líder con datos (nadie
    // matcheó), ahí no se aplica el filtro para no vaciar el pool entero.
    const filtered = leaderPoints > 0
      ? eligible.filter((c) => (grandTPoints.get(normalize(c.surname)) ?? 0) >= leaderPoints * 0.2)
      : eligible;

    const scored = applyTeamQualityAdjustment(scoreCandidates(filtered, position), teamPositionById, need.totalTeams);
    const top = scored.sort((a, b) => b.fit.score - a.fit.score).slice(0, count);
    picks.push(...top);
  }

  return { picks, composition: need.composition };
}
