// Cliente directo a Sofascore — CORS abierto, corre en el browser (no server-side, ahí bloquean con 403).
export const SFS_BASE = "https://api.sofascore.com/api/v1";

// Mismos IDs de liga que usa API-Football (LEAGUES en los tabs) → tournament id de Sofascore.
export const SOFA_TOURNAMENTS: Record<string, number> = {
  "128": 155,   // Argentina — Primera División
  "131": 384,   // Copa Libertadores
  "71":  325,   // Brasil — Série A
  "262": 11621, // México — Liga MX (Apertura)
  "39":  17,    // Inglaterra — Premier League
  "140": 8,     // España — La Liga
  "135": 23,    // Italia — Serie A
  "78":  35,    // Alemania — Bundesliga
  "61":  34,    // Francia — Ligue 1
  "2":   7,     // Champions League
  "3":   679,   // Europa League
};

export interface SofaTeam {
  id: number;
  name: string;
}

export interface SofaStandingRow {
  team: SofaTeam;
  position: number;
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  scoresFor: number;
  scoresAgainst: number;
}

export interface SofaOverall {
  matches: number;
  avgRating: number;
  goalsScored: number;
  goalsConceded: number;
  cleanSheets: number;
  averageBallPossession: number;
  accuratePassesPercentage: number;
}

async function sofaGet<T>(path: string): Promise<T> {
  const res = await fetch(`${SFS_BASE}/${path}`);
  if (!res.ok) throw new Error(`Sofascore ${res.status}`);
  return res.json();
}

export function teamLogoUrl(teamId: number) {
  return `${SFS_BASE}/team/${teamId}/image`;
}

export interface SofaSeason {
  id: number;
  name: string;
  year: string;
}

export async function getCurrentSeason(tournamentId: number): Promise<SofaSeason> {
  const data = await sofaGet<{ seasons: SofaSeason[] }>(`unique-tournament/${tournamentId}/seasons`);
  const season = data.seasons[0];
  if (!season) throw new Error("Sin temporadas disponibles");
  return season;
}

// "2024" → 2024 · "19/20" → 2019 (año de inicio de la temporada)
function seasonStartYear(year: string): number {
  const plain = /^(\d{4})$/.exec(year);
  if (plain) return Number(plain[1]);
  const split = /^(\d{2})\/(\d{2})$/.exec(year);
  if (split) return 2000 + Number(split[1]);
  return NaN;
}

export async function getSeasons(tournamentId: number, minYear = 2020): Promise<SofaSeason[]> {
  const data = await sofaGet<{ seasons: SofaSeason[] }>(`unique-tournament/${tournamentId}/seasons`);
  return data.seasons.filter(s => seasonStartYear(s.year) >= minYear);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseStandingRow(r: any): SofaStandingRow {
  return {
    team: { id: r.team.id, name: r.team.name },
    position: r.position,
    matches: r.matches,
    wins: r.wins,
    draws: r.draws,
    losses: r.losses,
    points: r.points,
    scoresFor: r.scoresFor,
    scoresAgainst: r.scoresAgainst,
  };
}

export async function getStandings(tournamentId: number, seasonId: number): Promise<SofaStandingRow[]> {
  const data = await sofaGet<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    standings: { rows: any[] }[];
  }>(`unique-tournament/${tournamentId}/season/${seasonId}/standings/total`);
  const seen = new Set<number>();
  const rows: SofaStandingRow[] = [];
  for (const group of data.standings ?? []) {
    for (const raw of group.rows ?? []) {
      const row = parseStandingRow(raw);
      if (seen.has(row.team.id)) continue;
      seen.add(row.team.id);
      rows.push(row);
    }
  }
  return rows.sort((a, b) => a.team.name.localeCompare(b.team.name));
}

export interface SofaPlayerStat {
  id: number;
  name: string;
  team: string;
  teamId: number;
  goals: number;
  assists: number;
  rating: number;
  cleanSheet: number;
  appearances: number;
  minutesPlayed: number;
  yellowCards: number;
  redCards: number;
  // Arqueros
  saves: number;
  goalsConceded: number;
  savePercentage: number;      // calculado: saves / (saves + goalsConceded)
  successfulRunsOut: number;
  // Defensores
  interceptions: number;
  clearances: number;
  tacklesWon: number;
  totalDuelsWonPercentage: number;
  // Mediocampistas
  keyPasses: number;
  accuratePassesPercentage: number;
  duelsWon: number;            // calculado: groundDuelsWon + aerialDuelsWon
  ballRecovery: number;
  // Delanteros
  successfulDribbles: number;
  totalShots: number;
  shotsOnTarget: number;
  shotsOnTargetPercentage: number; // calculado: shotsOnTarget / totalShots
  bigChancesCreated: number;
  aerialDuelsWon: number;
}

export type SofaPosition = "G" | "D" | "M" | "F";

const PLAYER_FIELDS = [
  "goals", "assists", "rating", "cleanSheet", "appearances", "minutesPlayed", "yellowCards", "redCards",
  "saves", "goalsConceded", "successfulRunsOut",
  "interceptions", "clearances", "tacklesWon", "totalDuelsWonPercentage",
  "keyPasses", "accuratePassesPercentage", "groundDuelsWon", "aerialDuelsWon", "ballRecovery",
  "successfulDribbles", "totalShots", "shotsOnTarget", "bigChancesCreated",
].join(",");

export async function getPlayerStats(
  tournamentId: number,
  seasonId: number,
  order: string = "-rating",
  limit = 20,
  position?: SofaPosition,
): Promise<SofaPlayerStat[]> {
  const posFilter = position ? `&filters=position.in.${position}` : "";
  const data = await sofaGet<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    results: any[];
  }>(`unique-tournament/${tournamentId}/season/${seasonId}/statistics?limit=${limit}&order=${order}&offset=0&accumulation=total&fields=${PLAYER_FIELDS}${posFilter}`);
  return data.results.map(r => {
    const saves = r.saves ?? 0;
    const goalsConceded = r.goalsConceded ?? 0;
    const groundDuelsWon = r.groundDuelsWon ?? 0;
    const aerialDuelsWon = r.aerialDuelsWon ?? 0;
    const totalShots = r.totalShots ?? 0;
    const shotsOnTarget = r.shotsOnTarget ?? 0;
    return {
      id: r.player.id,
      name: r.player.name,
      team: r.team.name,
      teamId: r.team.id,
      goals: r.goals ?? 0,
      assists: r.assists ?? 0,
      rating: r.rating ?? 0,
      cleanSheet: r.cleanSheet ?? 0,
      appearances: r.appearances ?? 0,
      minutesPlayed: r.minutesPlayed ?? 0,
      yellowCards: r.yellowCards ?? 0,
      redCards: r.redCards ?? 0,
      saves,
      goalsConceded,
      savePercentage: (saves + goalsConceded) > 0 ? Math.round((saves / (saves + goalsConceded)) * 100) : 0,
      successfulRunsOut: r.successfulRunsOut ?? 0,
      interceptions: r.interceptions ?? 0,
      clearances: r.clearances ?? 0,
      tacklesWon: r.tacklesWon ?? 0,
      totalDuelsWonPercentage: r.totalDuelsWonPercentage ?? 0,
      keyPasses: r.keyPasses ?? 0,
      accuratePassesPercentage: r.accuratePassesPercentage ?? 0,
      duelsWon: groundDuelsWon + aerialDuelsWon,
      ballRecovery: r.ballRecovery ?? 0,
      successfulDribbles: r.successfulDribbles ?? 0,
      totalShots,
      shotsOnTarget,
      shotsOnTargetPercentage: totalShots > 0 ? Math.round((shotsOnTarget / totalShots) * 100) : 0,
      bigChancesCreated: r.bigChancesCreated ?? 0,
      aerialDuelsWon,
    };
  });
}

export interface SofaH2HMatch {
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

export interface SofaH2HSummary {
  homeWins: number;
  awayWins: number;
  draws: number;
}

export async function getH2HSummary(eventId: number): Promise<SofaH2HSummary | null> {
  try {
    const data = await sofaGet<{ teamDuel?: SofaH2HSummary }>(`event/${eventId}/h2h`);
    return data.teamDuel ?? null;
  } catch {
    return null;
  }
}

// Resume V/E/D de una lista de cruces (getHeadToHead) desde la perspectiva de
// dos equipos puntuales — misma cuenta que usan Ayudante Táctico y las tarjetas
// del Fixture, para que ambas pantallas siempre muestren el mismo número.
export function summarizeH2H(matches: SofaH2HMatch[], teamAId: number, teamBId: number): SofaH2HSummary {
  let homeWins = 0, awayWins = 0, draws = 0;
  for (const m of matches) {
    if (m.homeScore === m.awayScore) { draws++; continue; }
    const winnerId = m.homeScore > m.awayScore ? m.homeTeamId : m.awayTeamId;
    if (winnerId === teamAId) homeWins++;
    else if (winnerId === teamBId) awayWins++;
  }
  return { homeWins, awayWins, draws };
}

// Arma el historial de cruces recorriendo el historial de partidos del equipo A
// y filtrando los que fueron contra el equipo B (no hay endpoint directo con la lista).
export async function getHeadToHead(teamAId: number, teamBId: number, limit = 10): Promise<SofaH2HMatch[]> {
  const results: SofaH2HMatch[] = [];
  let page = 0;
  while (results.length < limit && page < 8) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await sofaGet<{ events: any[]; hasNextPage?: boolean }>(`team/${teamAId}/events/last/${page}`);
    for (const e of data.events ?? []) {
      if (e.homeTeam?.id !== teamBId && e.awayTeam?.id !== teamBId) continue;
      results.push({
        id: e.id,
        homeTeam: e.homeTeam?.name ?? "",
        homeTeamId: e.homeTeam?.id ?? 0,
        awayTeam: e.awayTeam?.name ?? "",
        awayTeamId: e.awayTeam?.id ?? 0,
        homeScore: e.homeScore?.current ?? 0,
        awayScore: e.awayScore?.current ?? 0,
        timestamp: e.startTimestamp,
        tournament: e.tournament?.name ?? "",
      });
      if (results.length >= limit) break;
    }
    if (!data.hasNextPage) break;
    page++;
  }
  return results;
}

export async function getTeamOverall(teamId: number, tournamentId: number, seasonId: number): Promise<SofaOverall> {
  const data = await sofaGet<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    statistics: any;
  }>(`team/${teamId}/unique-tournament/${tournamentId}/season/${seasonId}/statistics/overall`);
  const s = data.statistics;
  return {
    matches: s.matches ?? 0,
    avgRating: s.avgRating ?? 0,
    goalsScored: s.goalsScored ?? 0,
    goalsConceded: s.goalsConceded ?? 0,
    cleanSheets: s.cleanSheets ?? 0,
    averageBallPossession: s.averageBallPossession ?? 0,
    accuratePassesPercentage: s.accuratePassesPercentage ?? 0,
  };
}
