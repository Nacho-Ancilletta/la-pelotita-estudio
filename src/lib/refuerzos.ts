// Buscador de Refuerzos — recomendación por posición adaptada al equipo.
//
// ── Rediseño ago 2026: por qué se usa cada fuente ──────────────────────────
// El plan gratis de API-Football SOLO da acceso a temporadas 2022-2024
// (confirmado a mano: season=2025/2026 devuelven error "Free plans do not
// have access to this season"). Eso hacía que el Buscador mostrara goles/
// asistencias/tarjetas de 2024 disfrazadas de "actuales". Se corrigió así:
//
// - PROMIEDOS (lib/promiedos.ts, sin tocar) es ahora la fuente de TODO lo
//   que es estadística de rendimiento: goleadores, asistidores, tarjetas,
//   tabla de posiciones (para inferir estilo de equipo). Es 100% temporada
//   2026 en curso — el mismo dato que ya usa Gran DT.
// - API-FOOTBALL se usa SOLO para lo que NO es estadística de rendimiento:
//   foto, nacionalidad, edad — datos biográficos que no cambian de
//   temporada a temporada. Para pedirlos igual hay que mandar season=2024
//   (única que el plan gratis acepta), pero el dato que se extrae de esa
//   respuesta (player.photo/nationality/age) es el mismo sin importar qué
//   season se haya pedido — no es un dato de rendimiento "viejo", es un
//   dato biográfico que da lo mismo. Se busca por nombre (best-effort,
//   sin ID compartido entre fuentes) SOLO para los 4 finalistas + el
//   plantel actual en esa posición, no para todo el pool — para no gastar
//   cuota de más.
// - ESPN (lib/espn.ts, sin tocar): revisado, no expone estadísticas de
//   jugador por temporada (solo por partido individual — goleadores de un
//   partido puntual, stats de equipo). No se integra acá por esa razón,
//   no por elección.
//
// ── Limitaciones reales, no maquilladas ────────────────────────────────
// - Promiedos NO expone minutos jugados ni partidos jugados por jugador
//   en ningún endpoint disponible — no se puede normalizar "por 90
//   minutos" como se hacía antes con API-Football. Los puntajes usan
//   totales acumulados tal cual, lo que favorece a quien jugó más
//   partidos — no hay forma de corregir esto sin ese dato.
// - Promiedos NO tiene estadística de jugador individual para ARQUERO en
//   ninguna tabla (goleadores/asistidores/tarjetas son, lógicamente, casi
//   todos de campo) — la posición Arquero no tiene pool de candidatos
//   real, se corta antes de intentar puntuar y se avisa en la UI.
// - Para DEFENSOR no hay duelos ganados, intercepciones, despejes ni % de
//   pases en ninguna fuente 2026 — el puntaje de Defensor se arma con
//   disciplina (tarjetas, faltas) + aporte ofensivo ocasional. Es un
//   proxy más débil que el de Delantero/Mediocampista, se documenta en la
//   UI, no se disimula.
// - La columna de Promiedos rotulada "Barridas ganadas" en realidad trae
//   el campo `TotalFoulsConceded` (faltas cometidas) — el nombre de la
//   columna en el sitio está mal puesto, NO son tackles/barridas ganadas.
//   Se usa acá por lo que realmente es (faltas cometidas, menos es mejor).

import {
  getTablaPosiciones, PROMIEDOS_LEAGUES,
  type PromiedosStandingGroup,
} from "@/lib/promiedos";
import { updateQuota } from "@/components/ApiQuotaCounter";

const LEAGUE_SLUG = "arg.1" as const; // Liga Profesional Argentina — mismo scope que Gran DT
const AF_LEAGUE_ID = "128";           // id de API-Football para la misma liga
const AF_BIO_SEASON = "2024";         // única temporada que el plan gratis deja pedir — solo se usa para bio

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
  id: string; // normalize(nombre) — Promiedos no da un ID de jugador único y estable
  name: string;
  teamId: string;
  teamName: string;
  position: RefuerzoPosition;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  foulsConceded: number; // ver nota arriba sobre "Barridas ganadas"
  // Bio, best-effort vía API-Football (puede no encontrarse — nunca bloquea el resto)
  photo: string | null;
  nationality: string | null;
  age: number | null;
}

export interface FitResult { score: number; reasons: string[]; }
export type RefuerzoResult = RefuerzoCandidate & { fit: FitResult };

export interface TeamStyle { goalsForAvg: number; goalsAgainstAvg: number; played: number; }

export interface NeedProfile {
  team: RefuerzoTeam;
  position: RefuerzoPosition;
  incumbents: RefuerzoCandidate[];
  avgAge: number | null; // solo si se pudo enriquecer bio de algún incumbente
  style: TeamStyle;
  defensiveNeed: number;
  offensiveNeed: number;
  depthNeed: number;
  summary: string;
}

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

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
// El pool sale de Promiedos, que sí cambia semana a semana (a diferencia de
// la temporada 2024 congelada de API-Football) — TTL 24hs, mismo criterio
// que goleadores/asistencias en lib/promiedos.ts.
const POOL_TTL_MS = 24 * 60 * 60 * 1000;

// ── Promiedos: pool de candidatos + equipos (proxy sin tocar, mismo
// endpoint que ya usa lib/promiedos.ts — esto NO lo modifica, solo pide el
// mismo payload con su propio fetch para leer también las tablas de
// Tarjetas/Faltas que las funciones exportadas de ahí no exponen). ───────
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
    if (!name || !bucket) return null; // sin posición reconocida — se descarta, no se inventa
    const id = normalize(name);
    let c = pool.get(id);
    if (!c) {
      const teamId: string = obj.team_id ?? "";
      c = {
        id, name, teamId, teamName: teamNameById.get(teamId)?.shortName ?? teamNameById.get(teamId)?.name ?? "",
        position: bucket, goals: 0, assists: 0, yellowCards: 0, redCards: 0, foulsConceded: 0,
        photo: null, nationality: null, age: null,
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
  const key = "pelotita_refuerzos_teams_v2";
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
  const key = `pelotita_refuerzos_pool_v2_${LEAGUE_SLUG}`;
  const cached = cacheGet<RefuerzoCandidate[]>(key);
  if (cached) return cached;
  const [raw, groups] = await Promise.all([fetchRawLeagueData(), getTablaPosiciones(LEAGUE_SLUG)]);
  const pool = buildCandidatePool(raw, flattenTeams(groups));
  cacheSet(key, pool, POOL_TTL_MS);
  return pool;
}

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

// ── API-Football: SOLO bio (foto/nacionalidad/edad), best-effort por
// nombre, cacheado sin TTL (dato biográfico, no cambia). Nunca se cachea
// un resultado null crudo — se cachea siempre un objeto Bio (vacío si no
// hubo match) para distinguir "no pedido todavía" de "pedido, sin match". ──
interface Bio { photo: string | null; nationality: string | null; age: number | null; }
const EMPTY_BIO: Bio = { photo: null, nationality: null, age: null };

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

async function enrichBio(fullName: string): Promise<Bio> {
  const key = `pelotita_refuerzos_bio_${normalize(fullName)}`;
  const cached = cacheGet<Bio>(key);
  if (cached) return cached;
  try {
    const surname = fullName.trim().split(/\s+/).slice(-1)[0] ?? "";
    if (surname.length < 3) { cacheSet(key, EMPTY_BIO); return EMPTY_BIO; }
    const data = await footballGet("players", { search: surname, league: AF_LEAGUE_ID, season: AF_BIO_SEASON });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entries: any[] = data.response ?? [];
    const target = normalize(fullName);
    const match = entries.find((e) => {
      const n = normalize(e.player?.name ?? "");
      return n.includes(target) || target.includes(n);
    }) ?? entries[0];
    const bio: Bio = match?.player
      ? { photo: match.player.photo ?? null, nationality: match.player.nationality ?? null, age: match.player.age ?? null }
      : EMPTY_BIO;
    cacheSet(key, bio);
    return bio;
  } catch {
    return EMPTY_BIO; // no cachea el fallo — puede ser un problema de red puntual, no "no existe"
  }
}

function clamp(v: number, min: number, max: number) { return Math.min(max, Math.max(min, v)); }

function buildSummary(team: RefuerzoTeam, position: RefuerzoPosition, count: number, avgAge: number | null, style: TeamStyle): string {
  const posLabel = REFUERZO_POSITIONS.find((p) => p.key === position)?.label ?? position;
  const parts = [
    `${team.name} tiene ${count} jugador${count === 1 ? "" : "es"} con participación registrada como ${posLabel.toLowerCase()} esta temporada`,
    avgAge != null ? `edad promedio ${avgAge} años (dato biográfico, no de rendimiento)` : null,
    `${style.goalsForAvg.toFixed(1)} goles a favor y ${style.goalsAgainstAvg.toFixed(1)} en contra por partido en ${style.played} PJ`,
  ].filter((p): p is string => !!p);
  return parts.join(" · ");
}

// ── Paso 1: perfil de necesidad ─────────────────────────────────────────
export async function getNeedProfile(team: RefuerzoTeam, position: RefuerzoPosition): Promise<NeedProfile> {
  const [pool, groups] = await Promise.all([getCandidatePool(), getTablaPosiciones(LEAGUE_SLUG)]);
  const incumbents = pool.filter((c) => c.teamId === team.id && c.position === position);
  const style = styleFromStandings(team.id, groups);

  // Bio de incumbentes acotada (típicamente pocos jugadores) — best-effort,
  // no bloquea si no hay match.
  const bios = await Promise.all(incumbents.map((c) => enrichBio(c.name)));
  const ages = bios.map((b) => b.age).filter((a): a is number => a != null);
  const avgAge = ages.length ? Math.round((ages.reduce((s, a) => s + a, 0) / ages.length) * 10) / 10 : null;

  const defensiveNeed = clamp(0.7 + style.goalsAgainstAvg * 0.5, 0.7, 1.5);
  const offensiveNeed = clamp(1.5 - style.goalsForAvg * 0.4, 0.7, 1.5);
  const depthNeed = incumbents.length <= 1 ? 1.3 : incumbents.length <= 3 ? 1.1 : 1.0;

  return {
    team, position, incumbents, avgAge, style,
    defensiveNeed, offensiveNeed, depthNeed,
    summary: buildSummary(team, position, incumbents.length, avgAge, style),
  };
}

// ── Paso 3: scoring ──────────────────────────────────────────────────────
// Sin datos de minutos jugados en ninguna fuente 2026 disponible: no se
// puede normalizar "por 90 minutos" (a diferencia del diseño anterior
// sobre API-Football) — se usan totales acumulados tal cual, lo que
// favorece a quien jugó más partidos. Documentado, no corregido (no hay
// con qué corregirlo sin ese dato).
// ARQ queda sin entrada: Promiedos no tiene estadística de arquero por
// jugador en ninguna tabla — se corta antes de intentar puntuar (ver
// recommend() más abajo), no se arma un ranking vacío disimulado.
const WEIGHTS: Record<RefuerzoPosition, { key: keyof RefuerzoCandidate; invert?: boolean; weight: number; label: string; kind: "def" | "off" }[]> = {
  ARQ: [],
  DEF: [
    { key: "yellowCards",    invert: true, weight: 0.35, label: "menos tarjetas amarillas", kind: "def" },
    { key: "redCards",       invert: true, weight: 0.25, label: "menos tarjetas rojas", kind: "def" },
    { key: "foulsConceded",  invert: true, weight: 0.20, label: "menos faltas cometidas", kind: "def" },
    { key: "goals",          weight: 0.10, label: "goles", kind: "off" },
    { key: "assists",        weight: 0.10, label: "asistencias", kind: "off" },
  ],
  VOL: [
    { key: "assists",     weight: 0.45, label: "asistencias", kind: "off" },
    { key: "goals",       weight: 0.30, label: "goles", kind: "off" },
    { key: "yellowCards", invert: true, weight: 0.15, label: "menos tarjetas amarillas", kind: "def" },
    { key: "redCards",    invert: true, weight: 0.10, label: "menos tarjetas rojas", kind: "def" },
  ],
  DEL: [
    { key: "goals",       weight: 0.55, label: "goles", kind: "off" },
    { key: "assists",     weight: 0.35, label: "asistencias", kind: "off" },
    { key: "yellowCards", invert: true, weight: 0.10, label: "menos tarjetas amarillas", kind: "def" },
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
  const raw = candidates.map((c) => dims.map((d) => c[d.key] as number));
  const maxes = dims.map((_, i) => Math.max(1e-6, ...raw.map((r) => r[i])));

  return candidates.map((c, idx) => {
    let weighted = 0;
    const reasons: string[] = [];
    dims.forEach((d, i) => {
      const ratio = raw[idx][i] / maxes[i];
      const norm = d.invert ? 1 - ratio : ratio; // invert: menos es mejor (tarjetas/faltas)
      weighted += norm * d.effectiveWeight;
      if (norm > 0.6) reasons.push(d.label);
    });
    const base = weightSum > 0 ? weighted / weightSum : 0;
    const boosted = base * need.depthNeed;
    return { ...c, fit: { score: Math.round(clamp(boosted * 100, 0, 100)), reasons } };
  });
}

// ── Punto de entrada: perfil de necesidad + top 4 candidatos ───────────
export async function recommend(team: RefuerzoTeam, position: RefuerzoPosition): Promise<{ need: NeedProfile; candidates: RefuerzoResult[]; noDataForPosition: boolean }> {
  const key = `pelotita_refuerzos_reco_v2_${team.id}_${position}`;
  const cached = cacheGet<{ need: NeedProfile; candidates: RefuerzoResult[]; noDataForPosition: boolean }>(key);
  if (cached) return cached;

  const need = await getNeedProfile(team, position);

  if (position === "ARQ") {
    // Sin estadística de arquero por jugador en ninguna fuente 2026 — no
    // se arma ranking con datos de otra posición ni de otra temporada.
    const result = { need, candidates: [], noDataForPosition: true };
    cacheSet(key, result, POOL_TTL_MS);
    return result;
  }

  const pool = await getCandidatePool();
  const eligible = pool.filter((c) => c.position === position && c.teamId !== team.id);
  const top4 = scoreCandidates(eligible, position, need).sort((a, b) => b.fit.score - a.fit.score).slice(0, 4);

  // Bio SOLO de los 4 finalistas (no de todo el pool) — acota cuota de API-Football.
  const candidates = await Promise.all(top4.map(async (c) => ({ ...c, ...(await enrichBio(c.name)) })));

  const result = { need, candidates, noDataForPosition: false };
  cacheSet(key, result, POOL_TTL_MS);
  return result;
}

export async function refreshRecommendation(team: RefuerzoTeam, position: RefuerzoPosition) {
  localStorage.removeItem(`pelotita_refuerzos_reco_v2_${team.id}_${position}`);
  localStorage.removeItem(`pelotita_refuerzos_pool_v2_${LEAGUE_SLUG}`);
  return recommend(team, position);
}
