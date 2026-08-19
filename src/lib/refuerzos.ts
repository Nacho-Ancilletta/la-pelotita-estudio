// Buscador de Refuerzos — recomendación por posición adaptada al equipo,
// sobre API-Football (api-sports.io). NO se toca src/app/api/football/route.ts
// (el proxy sigue igual); este archivo es 100% independiente de src/lib/
// football.ts para no arriesgar el panel viejo (RefuerzosFootballPanel.tsx,
// hoy inalcanzable desde la UI pero se deja intacto) — llama al mismo proxy
// con su propio fetch helper.
//
// ── Investigación previa (importante, condiciona todo el diseño) ──────────
// 1) Plan gratis de API-Football SOLO da acceso a temporadas 2022-2024
//    (confirmado a mano: season=2025 y 2026 devuelven error "Free plans do
//    not have access to this season, try from 2022 to 2024"). SEASON acá es
//    2024 — la última disponible, NO la temporada 2026 en curso. El "perfil
//    de necesidad actual" es entonces el de la última temporada accesible,
//    no de la fecha vigente — se lo aclara en la UI, no se lo disimula.
// 2) games.position es grueso: solo "Goalkeeper"/"Defender"/"Midfielder"/
//    "Attacker" — no hay forma de distinguir Lateral de Central, ni Extremo
//    de Delantero centro con estos datos. Se usan las 4 posiciones gruesas
//    (mismo criterio que Gran DT y Fantasy Premier), no las 6-7 pedidas
//    originalmente — inventar la subdivisión sería mostrar un dato falso.
// 3) passes.accuracy existe en el schema pero devuelve null siempre en plan
//    gratis (mismo hallazgo ya documentado en lib/football.ts) — no se
//    muestra "% de pases completados" en ningún lado.
// 4) No existe "despejes" (clearances) como campo — se usa tackles.blocks
//    como proxy más cercano, marcado como tal en la UI.
// 5) Clean sheets / arco en 0 solo están a nivel EQUIPO (teams/statistics),
//    no por arquero individual — se muestra como dato de CONTEXTO del
//    equipo, nunca como estadística personal de un candidato.
// 6) Estilo de equipo: teams/statistics no tiene posesión (ni ninguna otra
//    fuente del proyecto la tiene a nivel de temporada completa — ESPN solo
//    la expone por partido individual, promediarla implicaría decenas de
//    pedidos extra por equipo). Se infiere el estilo de goles a favor/en
//    contra por partido + la formación más usada (sí disponible), no de
//    posesión.
// 7) No hay endpoint "top defensores" en el plan gratis (solo topscorers/
//    topassists/topyellowcards/topredcards) — el pool de candidatos para
//    Defensor y Mediocampista sale de esas 4 listas filtradas por posición,
//    lo cual sesga a jugadores notorios por goles/asistencias/tarjetas. Es
//    una limitación real de la fuente, no un bug — se aclara en la UI.

import { updateQuota } from "@/components/ApiQuotaCounter";

const LEAGUE_ID = "128"; // Liga Profesional Argentina — mismo scope que Gran DT/Ayudante Táctico
const SEASON = "2024";   // última temporada accesible en el plan free de API-Football

export type RefuerzoPosition = "ARQ" | "DEF" | "VOL" | "DEL";

const POSITION_TO_API: Record<RefuerzoPosition, string> = {
  ARQ: "Goalkeeper",
  DEF: "Defender",
  VOL: "Midfielder",
  DEL: "Attacker",
};

export const REFUERZO_POSITIONS: { key: RefuerzoPosition; label: string }[] = [
  { key: "ARQ", label: "Arquero" },
  { key: "DEF", label: "Defensor / Lateral" },
  { key: "VOL", label: "Mediocampista" },
  { key: "DEL", label: "Delantero / Extremo" },
];

export interface RefuerzoTeam { id: number; name: string; logo: string; }

export interface RefuerzoCandidate {
  id: number;
  name: string;
  photo: string | null;
  age: number | null;
  injured: boolean;
  teamId: number;
  teamName: string;
  position: RefuerzoPosition;
  appearances: number;
  minutes: number;
  rating: number | null;
  goals: number;
  assists: number;
  shotsOn: number;
  shotsTotal: number;
  keyPasses: number;
  dribblesSuccess: number;
  duelsTotal: number;
  duelsWon: number;
  duelsWonPct: number;
  interceptions: number;
  blocks: number;        // tackles.blocks — proxy de "despejes", no es el mismo dato
  tacklesTotal: number;
  saves: number;
  goalsConceded: number;
  savePct: number;
  yellowCards: number;
  redCards: number;
}

export interface FitResult { score: number; reasons: string[]; }
export type RefuerzoResult = RefuerzoCandidate & { fit: FitResult };

export interface TeamStyle {
  goalsForAvg: number;
  goalsAgainstAvg: number;
  played: number;
  cleanSheets: number;      // dato de EQUIPO, no atribuible a un arquero puntual
  mainFormation: string | null;
}

export interface NeedProfile {
  team: RefuerzoTeam;
  position: RefuerzoPosition;
  incumbents: RefuerzoCandidate[];
  avgAge: number | null;
  avgMinutes: number | null;
  style: TeamStyle;
  defensiveNeed: number;
  offensiveNeed: number;
  depthNeed: number;
  summary: string;
}

// ── Fetch + caché (mismo patrón cacheGet/cacheSet {data,ts,ttlMs} que el
// resto de la app) ──────────────────────────────────────────────────────
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
// La temporada 2024 ya terminó — sus stats no cambian más. Sin ttlMs (no
// expira nunca) para que la última búsqueda de cada equipo/posición quede
// disponible offline en la grabación, sin gastar cuota de nuevo.

async function footballGet(endpoint: string, params: Record<string, string>) {
  const qs = new URLSearchParams({ endpoint, ...params }).toString();
  const res = await fetch(`/api/football?${qs}`);
  if (!res.ok) throw new Error(`API-Football ${res.status}`);
  const { data, quotaRemaining } = await res.json();
  if (quotaRemaining !== null) updateQuota(quotaRemaining);
  if (data.errors && Object.keys(data.errors).length > 0) {
    const msg = Array.isArray(data.errors) ? data.errors.join(", ") : Object.values(data.errors).join(", ");
    throw new Error(String(msg));
  }
  return data;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pickLeagueStats(entry: any): any | null {
  const stats: unknown[] = entry.statistics ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (stats as any[]).find((s) => s.league?.id === Number(LEAGUE_ID)) ?? stats[0] ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toCandidate(entry: any): RefuerzoCandidate | null {
  const p = entry.player;
  const s = pickLeagueStats(entry);
  if (!p || !s) return null;
  const apiPos: string | undefined = s.games?.position;
  const position = (Object.keys(POSITION_TO_API) as RefuerzoPosition[]).find((k) => POSITION_TO_API[k] === apiPos);
  if (!position) return null; // posición no reconocida (null / "Coach" / etc.) — se descarta, no se inventa

  const duelsTotal = s.duels?.total ?? 0;
  const duelsWon = s.duels?.won ?? 0;
  const saves = s.goals?.saves ?? 0;
  const conceded = s.goals?.conceded ?? 0;

  return {
    id: p.id,
    name: p.name,
    photo: p.photo ?? null,
    age: p.age ?? null,
    injured: !!p.injured,
    teamId: s.team?.id ?? 0,
    teamName: s.team?.name ?? "",
    position,
    appearances: s.games?.appearences ?? 0,
    minutes: s.games?.minutes ?? 0,
    rating: s.games?.rating != null ? parseFloat(s.games.rating) : null,
    goals: s.goals?.total ?? 0,
    assists: s.goals?.assists ?? 0,
    shotsOn: s.shots?.on ?? 0,
    shotsTotal: s.shots?.total ?? 0,
    keyPasses: s.passes?.key ?? 0,
    dribblesSuccess: s.dribbles?.success ?? 0,
    duelsTotal,
    duelsWon,
    duelsWonPct: duelsTotal > 0 ? Math.round((duelsWon / duelsTotal) * 100) : 0,
    interceptions: s.tackles?.interceptions ?? 0,
    blocks: s.tackles?.blocks ?? 0,
    tacklesTotal: s.tackles?.total ?? 0,
    saves,
    goalsConceded: conceded,
    savePct: saves + conceded > 0 ? Math.round((saves / (saves + conceded)) * 100) : 0,
    yellowCards: s.cards?.yellow ?? 0,
    redCards: s.cards?.red ?? 0,
  };
}

// ── Equipos de la liga (para el selector) ───────────────────────────────
export async function getTeams(): Promise<RefuerzoTeam[]> {
  const key = `pelotita_refuerzos_teams_${LEAGUE_ID}_${SEASON}`;
  const cached = cacheGet<RefuerzoTeam[]>(key);
  if (cached) return cached;
  const data = await footballGet("teams", { league: LEAGUE_ID, season: SEASON });
  const teams: RefuerzoTeam[] = (data.response ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((t: any) => ({ id: t.team.id, name: t.team.name, logo: t.team.logo }))
    .sort((a: RefuerzoTeam, b: RefuerzoTeam) => a.name.localeCompare(b.name));
  cacheSet(key, teams);
  return teams;
}

// ── Plantel actual del equipo (página 1 = hasta 20 jugadores; los planteles
// completos de Liga Profesional entran casi siempre en 1-2 páginas, se
// limita a la primera para no duplicar cuota en cada búsqueda) ──────────
export async function getTeamSquad(teamId: number): Promise<RefuerzoCandidate[]> {
  const key = `pelotita_refuerzos_squad_${teamId}_${SEASON}`;
  const cached = cacheGet<RefuerzoCandidate[]>(key);
  if (cached) return cached;
  const data = await footballGet("players", { team: String(teamId), season: SEASON, page: "1" });
  const list = (data.response ?? []).map(toCandidate).filter((c: RefuerzoCandidate | null): c is RefuerzoCandidate => c !== null);
  cacheSet(key, list);
  return list;
}

// ── Estilo del equipo (goles por partido + formación más usada) ────────
export async function getTeamStyle(teamId: number): Promise<TeamStyle> {
  const key = `pelotita_refuerzos_style_${teamId}_${SEASON}`;
  const cached = cacheGet<TeamStyle>(key);
  if (cached) return cached;
  const data = await footballGet("teams/statistics", { team: String(teamId), league: LEAGUE_ID, season: SEASON });
  const r = data.response ?? {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const formations: any[] = r.lineups ?? [];
  const mainFormation = [...formations].sort((a, b) => (b.played ?? 0) - (a.played ?? 0))[0]?.formation ?? null;
  const style: TeamStyle = {
    goalsForAvg: parseFloat(r.goals?.for?.average?.total ?? "0") || 0,
    goalsAgainstAvg: parseFloat(r.goals?.against?.average?.total ?? "0") || 0,
    played: r.fixtures?.played?.total ?? 0,
    cleanSheets: r.clean_sheet?.total ?? 0,
    mainFormation,
  };
  cacheSet(key, style);
  return style;
}

// ── Pool de candidatos liga-wide: las 4 listas "top" que da el plan
// gratis, combinadas y sin duplicados. Un solo pool sirve para las 4
// posiciones y cualquier equipo — se pide una vez por temporada, no una
// vez por búsqueda. ──────────────────────────────────────────────────────
const POOL_KINDS = ["topscorers", "topassists", "topyellowcards", "topredcards"] as const;

export async function getCandidatePool(): Promise<RefuerzoCandidate[]> {
  const key = `pelotita_refuerzos_pool_${LEAGUE_ID}_${SEASON}`;
  const cached = cacheGet<RefuerzoCandidate[]>(key);
  if (cached) return cached;
  const byId = new Map<number, RefuerzoCandidate>();
  for (const kind of POOL_KINDS) {
    const data = await footballGet(`players/${kind}`, { league: LEAGUE_ID, season: SEASON });
    for (const entry of data.response ?? []) {
      const c = toCandidate(entry);
      if (c && !byId.has(c.id)) byId.set(c.id, c);
    }
  }
  const pool = [...byId.values()];
  cacheSet(key, pool);
  return pool;
}

function clamp(v: number, min: number, max: number) { return Math.min(max, Math.max(min, v)); }

function buildSummary(team: RefuerzoTeam, position: RefuerzoPosition, count: number, avgAge: number | null, style: TeamStyle): string {
  const posLabel = REFUERZO_POSITIONS.find((p) => p.key === position)?.label ?? position;
  const parts = [
    `${team.name} tiene ${count} jugador${count === 1 ? "" : "es"} registrados como ${posLabel.toLowerCase()} en el plantel 2024`,
    avgAge != null ? `edad promedio ${avgAge} años` : null,
    `${style.goalsForAvg.toFixed(1)} goles a favor y ${style.goalsAgainstAvg.toFixed(1)} en contra por partido`,
    style.mainFormation ? `formación más usada: ${style.mainFormation}` : null,
  ].filter((p): p is string => !!p);
  return parts.join(" · ");
}

// ── Paso 1: perfil de necesidad del equipo para una posición ───────────
// defensiveNeed / offensiveNeed / depthNeed son multiplicadores manuales
// (no un modelo estadístico) pensados para poder ajustarse a mano con el
// tiempo — ver el comentario en WEIGHTS más abajo sobre cómo se aplican.
export async function getNeedProfile(team: RefuerzoTeam, position: RefuerzoPosition): Promise<NeedProfile> {
  const [squad, style] = await Promise.all([getTeamSquad(team.id), getTeamStyle(team.id)]);
  const incumbents = squad.filter((p) => p.position === position);
  const ages = incumbents.map((p) => p.age).filter((a): a is number => a != null);
  const avgAge = ages.length ? Math.round((ages.reduce((s, a) => s + a, 0) / ages.length) * 10) / 10 : null;
  const minutesList = incumbents.map((p) => p.minutes).filter((m) => m > 0);
  const avgMinutes = minutesList.length ? Math.round(minutesList.reduce((s, m) => s + m, 0) / minutesList.length) : null;

  // Más goles en contra por partido → más peso a stats defensivas al puntuar.
  // Menos goles a favor por partido → más peso a stats ofensivas.
  // Rango 0.7-1.5 para que nunca anule ni triplique el peso base de una dimensión.
  const defensiveNeed = clamp(0.7 + style.goalsAgainstAvg * 0.5, 0.7, 1.5);
  const offensiveNeed = clamp(1.5 - style.goalsForAvg * 0.4, 0.7, 1.5);
  // Pocos jugadores en el plantel en esa posición → boost general al puntaje
  // final (urge cubrir el puesto, cualquier candidato razonable suma).
  const depthNeed = incumbents.length <= 2 ? 1.3 : incumbents.length <= 4 ? 1.1 : 1.0;

  return {
    team, position, incumbents, avgAge, avgMinutes, style,
    defensiveNeed, offensiveNeed, depthNeed,
    summary: buildSummary(team, position, incumbents.length, avgAge, style),
  };
}

// ── Paso 3: scoring ──────────────────────────────────────────────────────
// Por posición: qué estadísticas entran y cuánto pesa cada una (los pesos
// de una posición suman 1.0). Los conteos acumulados (goles, intercepciones,
// etc.) se normalizan "por 90 minutos" antes de compararse, para no premiar
// solo por haber jugado más minutos — los % (duelos ganados, atajadas) ya
// vienen normalizados de por sí, se usan tal cual. Después de sumar los
// pesos se normaliza contra el mejor valor del pool de esa búsqueda (0-1),
// se aplican los multiplicadores de necesidad del equipo (defensiveNeed/
// offensiveNeed) a las dimensiones que correspondan, y por último
// depthNeed empuja el puntaje final entero. Para ajustar el algoritmo a
// futuro: tocar los `weight` acá abajo (deben sumar 1.0 por posición).
const WEIGHTS: Record<RefuerzoPosition, { key: keyof RefuerzoCandidate; per90: boolean; weight: number; label: string; kind: "def" | "off" | "neutral" }[]> = {
  ARQ: [
    { key: "savePct", per90: false, weight: 0.45, label: "% de atajadas", kind: "def" },
    { key: "saves",   per90: true,  weight: 0.35, label: "atajadas por 90'", kind: "def" },
    { key: "rating",  per90: false, weight: 0.20, label: "rating promedio", kind: "neutral" },
  ],
  DEF: [
    { key: "duelsWonPct",   per90: false, weight: 0.30, label: "% de duelos ganados", kind: "def" },
    { key: "interceptions", per90: true,  weight: 0.30, label: "intercepciones por 90'", kind: "def" },
    { key: "blocks",        per90: true,  weight: 0.20, label: "bloqueos por 90' (proxy de despejes)", kind: "def" },
    { key: "rating",        per90: false, weight: 0.20, label: "rating promedio", kind: "neutral" },
  ],
  VOL: [
    { key: "keyPasses",     per90: true,  weight: 0.30, label: "pases clave por 90'", kind: "off" },
    { key: "duelsWonPct",   per90: false, weight: 0.25, label: "% de duelos ganados", kind: "def" },
    { key: "interceptions", per90: true,  weight: 0.25, label: "recuperaciones por 90' (intercepciones)", kind: "def" },
    { key: "rating",        per90: false, weight: 0.20, label: "rating promedio", kind: "neutral" },
  ],
  DEL: [
    { key: "goals",       per90: true,  weight: 0.35, label: "goles por 90'", kind: "off" },
    { key: "assists",     per90: true,  weight: 0.20, label: "asistencias por 90'", kind: "off" },
    { key: "shotsOn",     per90: true,  weight: 0.20, label: "tiros al arco por 90'", kind: "off" },
    { key: "duelsWonPct", per90: false, weight: 0.25, label: "% de duelos ganados", kind: "neutral" },
  ],
};

function per90(value: number, minutes: number): number {
  return minutes > 0 ? (value / minutes) * 90 : 0;
}

function scoreCandidates(candidates: RefuerzoCandidate[], position: RefuerzoPosition, need: NeedProfile): RefuerzoResult[] {
  const baseDims = WEIGHTS[position];
  const dims = baseDims.map((d) => {
    let effectiveWeight = d.weight;
    if (d.kind === "def") effectiveWeight *= need.defensiveNeed;
    if (d.kind === "off") effectiveWeight *= need.offensiveNeed;
    return { ...d, effectiveWeight };
  });
  const weightSum = dims.reduce((s, d) => s + d.effectiveWeight, 0);

  const raw = candidates.map((c) => dims.map((d) => {
    const v = c[d.key] as number;
    return d.per90 ? per90(v, c.minutes) : v;
  }));
  const maxes = dims.map((_, i) => Math.max(1e-6, ...raw.map((r) => r[i])));

  return candidates.map((c, idx) => {
    let weighted = 0;
    const reasons: string[] = [];
    dims.forEach((d, i) => {
      const norm = raw[idx][i] / maxes[i]; // 0-1 relativo al mejor candidato de este pool
      weighted += norm * d.effectiveWeight;
      if (norm > 0.6) reasons.push(d.label);
    });
    const base = weightSum > 0 ? weighted / weightSum : 0; // 0-1
    const boosted = base * need.depthNeed; // puede superar 1 si el puesto está flaco de plantel
    const score = Math.round(clamp(boosted * 100, 0, 100));
    return { ...c, fit: { score, reasons } };
  });
}

// ── Punto de entrada: perfil de necesidad + top 4 candidatos ───────────
export async function recommend(team: RefuerzoTeam, position: RefuerzoPosition): Promise<{ need: NeedProfile; candidates: RefuerzoResult[] }> {
  const key = `pelotita_refuerzos_reco_${team.id}_${position}`;
  const cached = cacheGet<{ need: NeedProfile; candidates: RefuerzoResult[] }>(key);
  if (cached) return cached;

  const [need, pool] = await Promise.all([getNeedProfile(team, position), getCandidatePool()]);
  const eligible = pool.filter((c) => c.position === position && c.teamId !== team.id);
  const candidates = scoreCandidates(eligible, position, need)
    .sort((a, b) => b.fit.score - a.fit.score)
    .slice(0, 4);

  const result = { need, candidates };
  cacheSet(key, result);
  return result;
}

// Fuerza a recalcular ignorando la caché de resultado (no la de plantel/
// estilo/pool, esas siguen siendo válidas — son datos de la misma
// temporada 2024, no hay nada que "revisar" ahí).
export async function refreshRecommendation(team: RefuerzoTeam, position: RefuerzoPosition): Promise<{ need: NeedProfile; candidates: RefuerzoResult[] }> {
  localStorage.removeItem(`pelotita_refuerzos_reco_${team.id}_${position}`);
  return recommend(team, position);
}
