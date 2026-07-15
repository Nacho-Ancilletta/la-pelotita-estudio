// Respaldo vía API-Football (api-sports.io) — server-side, cuota limitada
// (plan gratis: 100 pedidos/día, 10/min). Se usa cuando Sofascore está bloqueado
// (pasa fuera de localhost, ver comentario en sofascore.ts).
//
// Campos verificados contra la API real (no solo docs, que bloquean bots):
// disponibles → rating, goles, asistencias, pases clave, duelos (total/ganados,
// sin separar aéreo/piso), gambetas (intentos/exitosas), tiros (total/al arco),
// tackles (total/intercepciones/bloqueos), tarjetas, faltas.
// NO disponibles en el schema (no es límite de plan, no existe el campo):
// despejes, salidas exitosas del arquero, arco en 0 por jugador, grandes
// ocasiones, duelos aéreos separados, tackles ganados (solo hay "total").
// passes.accuracy existe en el schema pero devuelve null siempre en plan gratis.
//
// Arcos en 0 / goles recibidos SÍ existen pero a nivel EQUIPO (teams/statistics,
// clean_sheet.total), no por arquero individual — no hay forma de saber qué
// arquero atajó cada partido sin tirar de cada fixture. goals.against de
// standings es gratis (1 pedido, toda la liga); clean_sheet hay que pedirlo
// equipo por equipo.
import { updateQuota } from "@/components/ApiQuotaCounter";

export interface FootballPlayerStat {
  id: number;
  name: string;
  team: string;
  teamId: number;
  rating: number;
  appearances: number;
  minutesPlayed: number;
  goals: number;
  assists: number;
  keyPasses: number;
  totalDuelsWonPercentage: number;   // duels.won / duels.total * 100 — combinado, no separa aéreo/piso
  successfulDribbles: number;        // dribbles.success
  shotsOnTargetPercentage: number;   // shots.on / shots.total * 100
  interceptions: number;             // tackles.interceptions
  yellowCards: number;
  redCards: number;
}

export type TopKind = "topscorers" | "topassists" | "topyellowcards" | "topredcards";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseTopPlayer(entry: any): FootballPlayerStat | null {
  const s = entry.statistics?.[0];
  if (!s) return null;
  const duelsTotal = s.duels?.total ?? 0;
  const duelsWon = s.duels?.won ?? 0;
  const shotsTotal = s.shots?.total ?? 0;
  const shotsOn = s.shots?.on ?? 0;
  return {
    id: entry.player.id,
    name: entry.player.name,
    team: s.team?.name ?? "",
    teamId: s.team?.id ?? 0,
    rating: s.games?.rating != null ? parseFloat(s.games.rating) : 0,
    appearances: s.games?.appearences ?? 0,
    minutesPlayed: s.games?.minutes ?? 0,
    goals: s.goals?.total ?? 0,
    assists: s.goals?.assists ?? 0,
    keyPasses: s.passes?.key ?? 0,
    totalDuelsWonPercentage: duelsTotal > 0 ? Math.round((duelsWon / duelsTotal) * 100) : 0,
    successfulDribbles: s.dribbles?.success ?? 0,
    shotsOnTargetPercentage: shotsTotal > 0 ? Math.round((shotsOn / shotsTotal) * 100) : 0,
    interceptions: s.tackles?.interceptions ?? 0,
    yellowCards: s.cards?.yellow ?? 0,
    redCards: s.cards?.red ?? 0,
  };
}

async function footballGet(endpoint: string, params: Record<string, string>) {
  const qs = new URLSearchParams({ endpoint, ...params }).toString();
  const res = await fetch(`/api/football?${qs}`);
  if (!res.ok) throw new Error(`API-Football ${res.status}`);
  const { data, quotaRemaining } = await res.json();
  if (quotaRemaining !== null) updateQuota(quotaRemaining);
  if (data.errors && Object.keys(data.errors).length > 0) {
    throw new Error(Object.values(data.errors).join(", "));
  }
  return data;
}

/** Trae el top-20 de una categoría "rankeable" (goles, asistencias, amarillas, rojas).
 *  Para las demás columnas (rating, pases clave, duelos, gambetas, tiros) el
 *  ranking es aproximado: son esos mismos 20 jugadores reordenados localmente. */
export async function fetchTopPlayers(kind: TopKind, leagueId: string, season: string): Promise<FootballPlayerStat[]> {
  const data = await footballGet(`players/${kind}`, { league: leagueId, season });
  return (data.response ?? []).map(parseTopPlayer).filter((p: FootballPlayerStat | null): p is FootballPlayerStat => p !== null);
}

// ── Búsqueda puntual de arquero (rating/atajadas no son rankeables sin gastar cuota) ──
export interface KeeperStat {
  id: number;
  name: string;
  team: string;
  rating: number;
  appearances: number;
  minutesPlayed: number;
  saves: number;
  goalsConceded: number;
  savePercentage: number;
}

export async function searchKeeper(name: string, leagueId: string, season: string): Promise<KeeperStat[]> {
  const data = await footballGet("players", { search: name, league: leagueId, season });
  const out: KeeperStat[] = [];
  for (const entry of data.response ?? []) {
    const s = entry.statistics?.[0];
    if (!s || s.games?.position !== "Goalkeeper") continue;
    const saves = s.goals?.saves ?? 0;
    const conceded = s.goals?.conceded ?? 0;
    out.push({
      id: entry.player.id,
      name: entry.player.name,
      team: s.team?.name ?? "",
      rating: s.games?.rating != null ? parseFloat(s.games.rating) : 0,
      appearances: s.games?.appearences ?? 0,
      minutesPlayed: s.games?.minutes ?? 0,
      saves,
      goalsConceded: conceded,
      savePercentage: (saves + conceded) > 0 ? Math.round((saves / (saves + conceded)) * 100) : 0,
    });
  }
  return out;
}

// ── Tabla defensiva por equipo (arcos en 0 / goles recibidos) ──
// goles recibidos: gratis, 1 pedido para toda la liga (standings).
// arcos en 0: NO está en standings — hay que pedir teams/statistics equipo
// por equipo (clean_sheet.total). Carga progresiva, cacheada, para no gastar
// cuota de más ni pasarse del rate limit de 10/min.
export interface TeamDefenseStat {
  teamId: number;
  teamName: string;
  played: number;
  goalsAgainst: number;
  goalsAgainstAvg: number;
  cleanSheets: number | null; // null = todavía no cargado
}

export async function fetchStandingsDefense(leagueId: string, season: string): Promise<TeamDefenseStat[]> {
  const data = await footballGet("standings", { league: leagueId, season });
  const rows = data.response?.[0]?.league?.standings?.[0] ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((r: any) => ({
    teamId: r.team.id,
    teamName: r.team.name,
    played: r.all.played,
    goalsAgainst: r.all.goals.against,
    goalsAgainstAvg: r.all.played > 0 ? Math.round((r.all.goals.against / r.all.played) * 100) / 100 : 0,
    cleanSheets: null,
  }));
}

export async function fetchTeamCleanSheets(teamId: number, leagueId: string, season: string): Promise<number> {
  const data = await footballGet("teams/statistics", { league: leagueId, season, team: String(teamId) });
  return data.response?.clean_sheet?.total ?? 0;
}
