// LA COMBINADA DE LA FECHA — análisis puramente estadístico (sin cuotas) de
// Más/Menos 2.5 goles y Ambos Equipos Marcan para todos los partidos de la
// fecha actual de Liga Profesional Argentina. Fuente: src/data/combinada-
// fecha-data-2026.json (FootyStats, captura manual que Ignacio actualiza a
// mano y redeploya — mismo patrón que refuerzo-magico-data-2026.json).
//
// Fixture: getFixtureLiga("arg.1", "latest") de lib/promiedos.ts — misma
// fuente que ya usa Gran DT/Fantasy para "próximos partidos" ("fecha" acá es
// jornada/matchday, no día calendario, por eso "latest" y no el scoreboard
// ESPN de un día puntual). El cruce de nombre de equipo Promiedos → nombre
// del JSON (FootyStats, ej. "CA River Plate") reusa PROMIEDOS_ID_TO_JSON_TEAM
// de lib/refuerzo-magico.ts (mapeo de los 30 equipos ya validado a mano) en
// vez de duplicarlo — es un dato, no lógica de otro tab.
//
// No arma combinadas automáticas: por partido se calcula un lean (favorable/
// desfavorable/parejo) por mercado, la UI se limita a mostrarlo. El usuario
// arma su propia combinada seleccionando partidos a mano.

import { getFixtureLiga, type PromiedosGame } from "@/lib/promiedos";
import { PROMIEDOS_ID_TO_JSON_TEAM } from "@/lib/refuerzo-magico";
import { getStandings, espnTeamLogoUrl } from "@/lib/espn";
import COMBINADA_DATA_RAW from "@/data/combinada-fecha-data-2026.json";

// ── Shape del JSON — solo se tipan los campos que el algoritmo realmente usa
// (menos_de_X_goles/disparos_over/aem_primera_segunda_mitad/sin_marcar_split
// quedan en el archivo para uso futuro, no entran en el cálculo acá). ──────
interface PctRow { equipo: string; pj: number; cant: number; pct: number; local_pct: number; visitante_pct: number; }
interface GoalsRow { equipo: string; pj: number; total: number; avg: number; local: number; visitante: number; }
interface FormRow {
  equipo: string; v: number; e: number; d: number; gf: number; gc: number; pts: number; ppp: number;
  pa0_pct: number; psm_pct: number; aem_pct: number; mas2_5_pct: number;
}
interface VentajaLocalRow { equipo: string; ventaja_local_pct: number; marcados_pct: number; defensa_pct: number; ppp_local: number; ppp_visitante: number; }

interface CombinadaDataFile {
  mas_de_2_5_goles: PctRow[];
  ambos_marcan_AEM: PctRow[];
  goles_marcados_actualizado: GoalsRow[];
  goles_encajados_actualizado: GoalsRow[];
  forma_reciente_ultimos_6_local: FormRow[];
  forma_reciente_ultimos_6_visitante: FormRow[];
  ventaja_local: { general: VentajaLocalRow[] };
}
const DATA = COMBINADA_DATA_RAW as unknown as CombinadaDataFile;

function byTeam<T extends { equipo: string }>(rows: T[]): Map<string, T> {
  return new Map(rows.map((r) => [r.equipo, r]));
}
const OVER25_BY_TEAM = byTeam(DATA.mas_de_2_5_goles);
const AEM_BY_TEAM = byTeam(DATA.ambos_marcan_AEM);
const SCORED_BY_TEAM = byTeam(DATA.goles_marcados_actualizado);
const CONCEDED_BY_TEAM = byTeam(DATA.goles_encajados_actualizado);
const FORM_LOCAL_BY_TEAM = byTeam(DATA.forma_reciente_ultimos_6_local);
const FORM_VISITANTE_BY_TEAM = byTeam(DATA.forma_reciente_ultimos_6_visitante);
const VENTAJA_LOCAL_BY_TEAM = byTeam(DATA.ventaja_local.general);

function clamp(v: number, min: number, max: number) { return Math.min(max, Math.max(min, v)); }
function round1(v: number) { return Math.round(v * 10) / 10; }

// ── Scoring por mercado ──────────────────────────────────────────────────
export type MarketLean = "favorable" | "desfavorable" | "parejo";
const LEAN_HIGH = 58;
const LEAN_LOW = 42;
function leanFromPct(pct: number): MarketLean {
  if (pct >= LEAN_HIGH) return "favorable";
  if (pct <= LEAN_LOW) return "desfavorable";
  return "parejo";
}

export interface MarketSignal {
  seasonPct: number;
  recentFormPct: number | null;
  adjustedPct: number;
  lean: MarketLean;
}

// Paso 5: pondera cuánto pesa el local_pct del local vs el visitante_pct del
// visitante según qué tan "explotable" es la localía de ese equipo puntual
// (ventaja_local_pct alto → se confía más en su número de local; bajo/negativo
// → se acerca al promedio simple). Rango de tilt acotado (0.35-0.65) para
// nunca invertir el peso del otro lado.
function localWeight(homeVentajaLocalPct: number | undefined): number {
  return clamp(0.5 + (homeVentajaLocalPct ?? 0) / 200, 0.35, 0.65);
}
function blendSeason(homeLocalPct: number, awayVisitantePct: number, homeVentajaLocalPct: number | undefined): number {
  const w = localWeight(homeVentajaLocalPct);
  return homeLocalPct * w + awayVisitantePct * (1 - w);
}

// Paso 4: si la forma reciente (últimos 6 en esa condición) difiere fuerte
// del promedio de temporada ya combinado, se le da más peso — nunca se
// oculta la tensión, se devuelve como nota para mostrar en la UI.
function blendWithForm(seasonPct: number, homeFormPct: number | undefined, awayFormPct: number | undefined): { pct: number; recentFormPct: number | null; note: string | null } {
  if (homeFormPct == null || awayFormPct == null) return { pct: seasonPct, recentFormPct: null, note: null };
  const recentPct = (homeFormPct + awayFormPct) / 2;
  const diff = Math.abs(recentPct - seasonPct);
  const formWeight = diff >= 25 ? 0.45 : 0.2;
  const blended = seasonPct * (1 - formWeight) + recentPct * formWeight;
  const note = diff >= 25 ? `forma reciente (últimos 6) ${Math.round(recentPct)}% vs ${Math.round(seasonPct)}% de temporada` : null;
  return { pct: blended, recentFormPct: round1(recentPct), note };
}

// Paso 3: goles esperados del partido cruzando ataque de uno vs defensa del
// otro (local: promedio de lo que mete de local y lo que le hacen de
// visitante al rival; visitante: al revés) — nudge chico sobre Más/Menos 2.5
// nomás, es el mercado que depende directo de la cantidad de goles.
function expectedTotalGoals(homeScored: GoalsRow, homeConceded: GoalsRow, awayScored: GoalsRow, awayConceded: GoalsRow): number {
  const homeExpected = (homeScored.local + awayConceded.visitante) / 2;
  const awayExpected = (awayScored.visitante + homeConceded.local) / 2;
  return round1(homeExpected + awayExpected);
}

export interface MatchAnalysis {
  // Cada mercado es independiente — ambos_marcan_AEM del JSON solo cubre
  // 18/30 equipos (cobertura despareja de la fuente, confirmado: River,
  // Argentinos, Central Córdoba, Instituto y otros faltan), mientras que
  // mas_de_2_5_goles sí cubre los 30. Si el mercado no tiene cobertura para
  // alguno de los 2 equipos queda en null y la UI muestra "—" solo en ESE
  // mercado — el otro se sigue mostrando normal, nunca se oculta la
  // tarjeta entera por un dato parcial (mismo criterio que Refuerzo Mágico).
  over25: MarketSignal | null;
  aem: MarketSignal | null;
  expectedTotalGoals: number | null;
  formTensionNotes: string[];
  ventajaLocalNote: string | null;
}

function computeMarketSignal(
  homeRow: PctRow | undefined, awayRow: PctRow | undefined,
  homeVentajaLocalPct: number | undefined,
  homeFormPct: number | undefined, awayFormPct: number | undefined,
  goalsNudge: number,
): { signal: MarketSignal; note: string | null } | null {
  if (!homeRow || !awayRow) return null;
  const seasonPct = blendSeason(homeRow.local_pct, awayRow.visitante_pct, homeVentajaLocalPct);
  const formBlend = blendWithForm(seasonPct, homeFormPct, awayFormPct);
  const adjustedPct = clamp(formBlend.pct + goalsNudge, 0, 100);
  return {
    signal: { seasonPct: round1(seasonPct), recentFormPct: formBlend.recentFormPct, adjustedPct: round1(adjustedPct), lean: leanFromPct(adjustedPct) },
    note: formBlend.note,
  };
}

// Nunca devuelve null entero: cada mercado se resuelve por separado, "sin
// datos" es un estado por-mercado, no de la tarjeta completa.
// homeDisplayName: nombre corto de Promiedos (ej. "River") solo para el texto
// de ventajaLocalNote — el nombre del JSON (ej. "CA River Plate") no separa
// bien por último token ("Plate"), así que no se usa para mostrar.
export function analyzeMatch(homeJsonTeam: string, awayJsonTeam: string, homeDisplayName: string): MatchAnalysis {
  const homeOver = OVER25_BY_TEAM.get(homeJsonTeam);
  const awayOver = OVER25_BY_TEAM.get(awayJsonTeam);
  const homeAem = AEM_BY_TEAM.get(homeJsonTeam);
  const awayAem = AEM_BY_TEAM.get(awayJsonTeam);
  const homeScored = SCORED_BY_TEAM.get(homeJsonTeam);
  const awayScored = SCORED_BY_TEAM.get(awayJsonTeam);
  const homeConceded = CONCEDED_BY_TEAM.get(homeJsonTeam);
  const awayConceded = CONCEDED_BY_TEAM.get(awayJsonTeam);

  const homeVentaja = VENTAJA_LOCAL_BY_TEAM.get(homeJsonTeam);
  const homeFormLocal = FORM_LOCAL_BY_TEAM.get(homeJsonTeam);
  const awayFormVisitante = FORM_VISITANTE_BY_TEAM.get(awayJsonTeam);

  // Paso 3: el ajuste de goles esperados solo aplica al mercado de goles
  // (Más/Menos 2.5) — no tiene sentido semántico nudgear AEM con esto.
  const expGoals = homeScored && homeConceded && awayScored && awayConceded
    ? expectedTotalGoals(homeScored, homeConceded, awayScored, awayConceded)
    : null;
  const goalsNudge = expGoals != null ? clamp((expGoals - 2.5) * 12, -10, 10) : 0;

  const over25Result = computeMarketSignal(homeOver, awayOver, homeVentaja?.ventaja_local_pct, homeFormLocal?.mas2_5_pct, awayFormVisitante?.mas2_5_pct, goalsNudge);
  const aemResult = computeMarketSignal(homeAem, awayAem, homeVentaja?.ventaja_local_pct, homeFormLocal?.aem_pct, awayFormVisitante?.aem_pct, 0);

  const formTensionNotes = [
    over25Result?.note ? `Más/Menos 2.5: ${over25Result.note}` : null,
    aemResult?.note ? `AEM: ${aemResult.note}` : null,
  ].filter((n): n is string => n != null);

  const ventajaLocalNote = homeVentaja && homeVentaja.ventaja_local_pct >= 30
    ? `${homeDisplayName} rinde bastante más de local (+${homeVentaja.ventaja_local_pct}%)`
    : homeVentaja && homeVentaja.ventaja_local_pct <= 5
    ? `localía casi no le pesa a ${homeDisplayName} (+${homeVentaja.ventaja_local_pct}%)`
    : null;

  return { over25: over25Result?.signal ?? null, aem: aemResult?.signal ?? null, expectedTotalGoals: expGoals, formTensionNotes, ventajaLocalNote };
}

// ── Escudos vía ESPN — mismo patrón que getEspnTeamLogos en
// refuerzo-magico.ts (cruce por nombre, best-effort), copiado acá en vez de
// importado porque es un detalle interno de esa función, no algo exportado. ─
function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}
interface EspnTeamLite { name: string; logo: string; }
function resolveLogo(teamName: string, teamShortName: string, espnTeams: EspnTeamLite[]): string | null {
  const n = normalize(teamName);
  const sn = normalize(teamShortName);
  const exact = espnTeams.find((t) => normalize(t.name) === n || normalize(t.name) === sn);
  if (exact) return exact.logo;
  const partial = espnTeams.find((t) => {
    const tn = normalize(t.name);
    return tn.includes(n) || n.includes(tn) || (sn.length > 0 && (tn.includes(sn) || sn.includes(tn)));
  });
  return partial?.logo ?? null;
}

// ── Caché — mismo patrón {data,ts,ttlMs} que el resto de la app ──────────
function cacheGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { data, ts, ttlMs } = JSON.parse(raw) as { data: T; ts: number; ttlMs: number };
    if (Date.now() - ts > ttlMs) return null;
    return data;
  } catch { return null; }
}
function cacheSet(key: string, data: unknown, ttlMs: number) {
  try { localStorage.setItem(key, JSON.stringify({ data, ts: Date.now(), ttlMs })); } catch { /* localStorage lleno o deshabilitado */ }
}
const LOGOS_TTL_MS = 24 * 60 * 60 * 1000;
const LOGOS_KEY = "pelotita_combinada_espn_logos_v1";

async function getEspnLogos(): Promise<EspnTeamLite[]> {
  const cached = cacheGet<EspnTeamLite[]>(LOGOS_KEY);
  if (cached) return cached;
  try {
    const season = new Date().getFullYear() - 1; // misma quirk de temporada que TacticoTab/RefuerzoMagicoTab para arg.1
    const rows = await getStandings("arg.1", season);
    const list = rows.map((r) => ({ name: r.team.name, logo: espnTeamLogoUrl(r.team.id) }));
    cacheSet(LOGOS_KEY, list, LOGOS_TTL_MS);
    return list;
  } catch {
    return [];
  }
}

export interface ComboTeam { id: string; name: string; shortName: string; logo: string | null; }
export interface ComboMatch {
  id: string;
  homeTeam: ComboTeam;
  awayTeam: ComboTeam;
  startTime: string; // "DD-MM-YYYY HH:mm", formato Promiedos
  statusName: string;
  homeScore: number | null;
  awayScore: number | null;
  analysis: MatchAnalysis | null;
}

function toComboTeam(t: PromiedosGame["homeTeam"], logos: EspnTeamLite[]): ComboTeam {
  return { id: t.id, name: t.name, shortName: t.shortName, logo: resolveLogo(t.name, t.shortName, logos) };
}

// Todos los partidos de la fecha (jornada) actual de Liga Profesional
// Argentina, con el análisis de los 2 mercados ya calculado por partido.
export async function getCombinadaFechaMatches(): Promise<ComboMatch[]> {
  const [games, logos] = await Promise.all([getFixtureLiga("arg.1", "latest"), getEspnLogos()]);
  return games.map((g) => {
    const homeJsonTeam = PROMIEDOS_ID_TO_JSON_TEAM[g.homeTeam.id];
    const awayJsonTeam = PROMIEDOS_ID_TO_JSON_TEAM[g.awayTeam.id];
    const analysis = homeJsonTeam && awayJsonTeam ? analyzeMatch(homeJsonTeam, awayJsonTeam, g.homeTeam.shortName || g.homeTeam.name) : null;
    return {
      id: g.id,
      homeTeam: toComboTeam(g.homeTeam, logos),
      awayTeam: toComboTeam(g.awayTeam, logos),
      startTime: g.startTime,
      statusName: g.statusName,
      homeScore: g.homeScore,
      awayScore: g.awayScore,
      analysis,
    };
  });
}

// ── Selección manual del usuario (Paso "recomendador manual") — persistida
// en localStorage sin TTL, es una preferencia de UI, no un dato de fuente. ──
const SELECTION_KEY = "pelotita_combinada_selection_v1";
export function getSelectedMatchIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SELECTION_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch { return new Set(); }
}
export function saveSelectedMatchIds(ids: Set<string>) {
  try { localStorage.setItem(SELECTION_KEY, JSON.stringify([...ids])); } catch { /* localStorage lleno o deshabilitado */ }
}
