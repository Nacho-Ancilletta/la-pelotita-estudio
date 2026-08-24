// Stats de partido y H2H desde el endpoint /summary de ESPN, vía el proxy
// existente (src/app/api/espn/route.ts). Mismo ev.id que ya usa EspnFixtures
// — no hace falta matchear contra otro proveedor por nombre de equipo.
// Reemplaza el uso de Sofascore en ese componente (bloqueado por Cloudflare).
//
// También expone standings y H2H reconstruido (para Ayudante Táctico) desde
// site.web.api.espn.com/.../standings y .../teams/{id}/schedule — ver el
// parámetro `api=web` que soporta el proxy.

export interface MatchStats {
  possession: [number, number];
  shots: [number, number];
  shotsOnTarget: [number, number];
  corners: [number, number];
  fouls: [number, number];
}

export interface H2HMatch {
  id: number;
  homeTeam: string;
  homeTeamId: number;
  awayTeam: string;
  awayTeamId: number;
  homeScore: number;
  awayScore: number;
  timestamp: number;
  tournament: string;
}

export interface H2HSummary {
  homeWins: number;
  awayWins: number;
  draws: number;
}

export interface GoalEvent {
  id: string;
  minute: string;
  scorer: string;
  teamId: number;
  ownGoal: boolean;
  penalty: boolean;
}

export interface MatchDetails {
  stats: MatchStats | null;
  h2h: H2HMatch[] | null;
  h2hSummary: H2HSummary | null;
  goals: GoalEvent[] | null;
}

export interface StandingRow {
  team: { id: number; name: string };
  position: number;
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  scoresFor: number;
  scoresAgainst: number;
}

export function espnTeamLogoUrl(teamId: number | string) {
  return `https://a.espncdn.com/i/teamlogos/soccer/500/${teamId}.png`;
}

export function summarizeH2H(matches: H2HMatch[], teamAId: number, teamBId: number): H2HSummary {
  let homeWins = 0, awayWins = 0, draws = 0;
  for (const m of matches) {
    if (m.homeScore === m.awayScore) { draws++; continue; }
    const winnerId = m.homeScore > m.awayScore ? m.homeTeamId : m.awayTeamId;
    if (winnerId === teamAId) homeWins++;
    else if (winnerId === teamBId) awayWins++;
  }
  return { homeWins, awayWins, draws };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function statValue(statistics: any[] | undefined, name: string): number {
  const item = statistics?.find((s) => s.name === name);
  return item ? parseFloat(item.displayValue) || 0 : 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseStats(boxscore: any): MatchStats | null {
  const teams = boxscore?.teams;
  if (!teams || teams.length < 2) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const home = teams.find((t: any) => t.homeAway === "home");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const away = teams.find((t: any) => t.homeAway === "away");
  if (!home || !away) return null;
  return {
    possession:    [statValue(home.statistics, "possessionPct"), statValue(away.statistics, "possessionPct")],
    shots:         [statValue(home.statistics, "totalShots"), statValue(away.statistics, "totalShots")],
    shotsOnTarget: [statValue(home.statistics, "shotsOnTarget"), statValue(away.statistics, "shotsOnTarget")],
    corners:       [statValue(home.statistics, "wonCorners"), statValue(away.statistics, "wonCorners")],
    fouls:         [statValue(home.statistics, "foulsCommitted"), statValue(away.statistics, "foulsCommitted")],
  };
}

// Goles: keyEvents trae toda la timeline del partido (kickoff, tarjetas,
// entretiempo, etc) — nos quedamos solo con las jugadas marcadas scoringPlay.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseGoals(keyEvents: any[] | undefined): GoalEvent[] {
  if (!keyEvents) return [];
  return keyEvents
    .filter((e) => e.scoringPlay)
    .map((e) => ({
      id: String(e.id),
      minute: e.clock?.displayValue ?? "",
      scorer: e.participants?.[0]?.athlete?.displayName ?? e.shortText ?? "",
      teamId: Number(e.team?.id),
      ownGoal: /own goal/i.test(e.type?.text ?? ""),
      penalty: /penalty/i.test(e.type?.text ?? ""),
    }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseSummaryH2H(headToHeadGames: any): { matches: H2HMatch[]; summary: H2HSummary } | null {
  const block = headToHeadGames?.[0];
  if (!block?.events?.length) return null;
  const meId = Number(block.team.id);
  const meName: string = block.team.displayName ?? "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const matches: H2HMatch[] = block.events.map((e: any) => {
    const homeId = Number(e.homeTeamId);
    const awayId = Number(e.awayTeamId);
    const oppName: string = e.opponent?.displayName ?? "";
    return {
      id: Number(e.id),
      homeTeamId: homeId,
      awayTeamId: awayId,
      homeTeam: homeId === meId ? meName : oppName,
      awayTeam: awayId === meId ? meName : oppName,
      homeScore: Number(e.homeTeamScore) || 0,
      awayScore: Number(e.awayTeamScore) || 0,
      timestamp: Math.floor(new Date(e.gameDate).getTime() / 1000),
      tournament: e.leagueName ?? e.competitionName ?? "",
    };
  });

  const oppId = Number(block.events[0]?.opponent?.id);
  return { matches, summary: summarizeH2H(matches, meId, oppId) };
}

// Cache corta en localStorage — durante una grabación en vivo la tarjeta se
// puede expandir/colapsar varias veces; no repetimos el pedido si pasaron
// menos de 90s, pero tampoco lo dejamos pegado como los datos de fixtures.
const CACHE_TTL_MS = 90_000;

function summaryCacheKey(league: string, eventId: string) {
  return `pelotita_espn_summary_${league}_${eventId}`;
}

function readCache(key: string): MatchDetails | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw) as { data: MatchDetails; ts: number };
    if (Date.now() - ts > CACHE_TTL_MS) return null;
    return data;
  } catch { return null; }
}

function writeCache(key: string, data: MatchDetails) {
  try { localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })); }
  catch { /* localStorage lleno o deshabilitado — no es crítico */ }
}

export async function getMatchDetails(league: string, eventId: string): Promise<MatchDetails> {
  const key = summaryCacheKey(league, eventId);
  const cached = readCache(key);
  if (cached) return cached;

  const res = await fetch(`/api/espn?league=${league}&endpoint=summary&event=${eventId}`);
  if (!res.ok) return { stats: null, h2h: null, h2hSummary: null, goals: null };

  const data = await res.json();
  const h2h = parseSummaryH2H(data.headToHeadGames);
  const details: MatchDetails = {
    stats: parseStats(data.boxscore),
    h2h: h2h?.matches ?? null,
    h2hSummary: h2h?.summary ?? null,
    goals: parseGoals(data.keyEvents),
  };
  writeCache(key, details);
  return details;
}

// ── Standings ────────────────────────────────────────────────

export async function getStandings(league: string, season: number): Promise<StandingRow[]> {
  const res = await fetch(`/api/espn?league=${league}&endpoint=standings&api=web&season=${season}`);
  if (!res.ok) throw new Error(`Standings ESPN ${res.status}`);
  const data = await res.json();
  // Algunas ligas (ej. Argentina) devuelven la tabla partida en grupos/zonas
  // en vez de un único bloque — hay que juntarlos todos o se pierde la mitad
  // de los equipos.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const groups: any[] = data?.children ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entries: any[] = groups.flatMap((g) => g?.standings?.entries ?? []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return entries.map((e: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stat = (name: string) => e.stats?.find((s: any) => s.name === name)?.value ?? 0;
    return {
      team: { id: Number(e.team.id), name: e.team.displayName },
      position: stat("rank"),
      matches: stat("gamesPlayed"),
      wins: stat("wins"),
      draws: stat("ties"),
      losses: stat("losses"),
      points: stat("points"),
      scoresFor: stat("pointsFor"),
      scoresAgainst: stat("pointsAgainst"),
    };
  }).sort((a, b) => a.team.name.localeCompare(b.team.name));
}

// ── H2H reconstruido desde el fixture histórico de un equipo ───────────────
// ESPN no tiene un endpoint directo "cruces A vs B" — se pide el calendario
// de un equipo temporada por temporada y se filtra por el rival, igual idea
// que usaba Sofascore pero sin bloqueo.

// Mismos slugs de selecciones que usan TacticoTab.tsx y EspnFixtures.tsx.
const NATIONAL_TEAM_LEAGUES = new Set([
  "fifa.world",
  "fifa.worldq.conmebol",
  "fifa.worldq.uefa",
  "conmebol.america",
  "uefa.euro",
]);

export async function getHeadToHead(
  league: string,
  meId: number, meName: string,
  oppId: number, oppName: string,
  fromSeason: number,
  maxSeasonsBack?: number,
): Promise<H2HMatch[]> {
  // Selecciones se cruzan mucho menos seguido que clubes — techo de
  // seguridad más alto para no cortar la búsqueda antes de tiempo, sin
  // arriesgar loop eterno si dos selecciones nunca jugaron entre sí.
  // Mundial es cada 4 años — en vez de recorrer año por año hasta 1930
  // (~90 pedidos), se salta directo a las ediciones reales (~24 pedidos).
  // 1942 y 1946 no se jugaron (Segunda Guerra) — se filtran del salto de
  // a 4; si igual quedara algún año sin Mundial real, ESPN no devuelve
  // eventos y el loop sigue de largo sin romper nada.
  let seasons: number[];
  if (league === "fifa.world") {
    seasons = [];
    for (let y = fromSeason; y >= 1930; y -= 4) {
      if (y !== 1942 && y !== 1946) seasons.push(y);
    }
  } else {
    const seasonsBack = maxSeasonsBack ?? (NATIONAL_TEAM_LEAGUES.has(league) ? 40 : 10);
    seasons = Array.from({ length: seasonsBack }, (_, i) => fromSeason - i);
  }

  const matches: H2HMatch[] = [];
  const seenIds = new Set<number>();

  for (let i = 0; i < seasons.length; i++) {
    if (matches.length >= 5) break; // ya alcanza para "últimos cruces" — no pedir temporadas más viejas
    if (i > 0) await new Promise(r => setTimeout(r, 250));
    const season = seasons[i];
    const res = await fetch(`/api/espn?league=${league}&endpoint=teams/${meId}/schedule&season=${season}`);
    if (res.status === 403) break;
    if (!res.ok) continue;
    const data = await res.json();
    for (const ev of data.events ?? []) {
      const comp = ev.competitions?.[0];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const competitors: any[] = comp?.competitors ?? [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const home = competitors.find((c: any) => c.homeAway === "home");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const away = competitors.find((c: any) => c.homeAway === "away");
      if (!home || !away) continue;
      const homeId = Number(home.team.id);
      const awayId = Number(away.team.id);
      if (homeId !== oppId && awayId !== oppId) continue; // no es contra el rival buscado
      if (home.score?.value == null || away.score?.value == null) continue; // no jugado todavía
      const id = Number(ev.id);
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      matches.push({
        id,
        homeTeamId: homeId,
        awayTeamId: awayId,
        homeTeam: homeId === meId ? meName : oppName,
        awayTeam: awayId === meId ? meName : oppName,
        homeScore: home.score.value,
        awayScore: away.score.value,
        timestamp: Math.floor(new Date(ev.date).getTime() / 1000),
        tournament: ev.season?.displayName ?? "",
      });
    }
  }

  // Post-procesamiento: el loop de arriba puede pasarse de 5 (una temporada
  // con 2+ cruces empuja de una todos sus partidos aunque ya hubiera 4 —
  // el `if (matches.length >= 5) break` solo frena entre temporadas, no
  // corta DENTRO de una). `seenIds` ya dedupea por id de evento. Ordenar por
  // fecha desc y recién ahí cortar a 5 asegura que sean los 5 más recientes
  // (y no una selección arbitraria) y que cualquier resumen/split calculado
  // sobre este mismo array (summarizeH2H) sume sobre los mismos 5 que se
  // muestran — nunca sobre el array sin recortar.
  matches.sort((a, b) => b.timestamp - a.timestamp);
  return matches.slice(0, 5);
}
