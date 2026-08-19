// Ranking Fantasy Premier League — bootstrap-static trae TODOS los
// jugadores de la temporada en un solo pedido (a diferencia de Gran DT, que
// necesita un fetch por pestaña/posición de la planilla), así que acá se
// pide una sola vez y se filtra/ordena client-side por posición.

export type FplPosition = "ARQ" | "DEF" | "VOL" | "DEL";

export const FPL_POSITIONS: { key: FplPosition; label: string; elementType: number }[] = [
  { key: "ARQ", label: "Arquero",       elementType: 1 },
  { key: "DEF", label: "Defensor",      elementType: 2 },
  { key: "VOL", label: "Mediocampista", elementType: 3 },
  { key: "DEL", label: "Delantero",     elementType: 4 },
];

// status: "a" disponible, "d" duda, "i" lesionado, "s" suspendido,
// "u" no disponible (se fue del club) — códigos propios de la API de FPL,
// confirmados a mano contra bootstrap-static.
export type FplStatus = "a" | "d" | "i" | "s" | "u";

export interface FplPlayer {
  id: number;
  name: string;
  clubId: number;
  club: string;
  points: number;
  goals: number;
  assists: number;
  elementType: number;
  status: FplStatus;
  chanceOfPlayingNextRound: number | null; // 0-100, null = sin duda (status "a")
  selectedByPercent: number;
}

// Disponible sin duda ("a", chance null o >=75) = ok; duda (status "d" o
// chance intermedio) = doubt; lesionado/suspendido/afuera del club = out.
export type FplFitness = "ok" | "doubt" | "out";

export function fplFitness(p: Pick<FplPlayer, "status" | "chanceOfPlayingNextRound">): FplFitness {
  if (p.status === "i" || p.status === "s" || p.status === "u") return "out";
  if (p.status === "d") return "doubt";
  if (p.chanceOfPlayingNextRound != null && p.chanceOfPlayingNextRound < 75) return "doubt";
  return "ok";
}

export interface FplUpcomingFixture {
  event: number | null;
  teamH: string;
  teamA: string;
  kickoffTime: string | null;
}

export interface FplData {
  players: FplPlayer[]; // todas las posiciones juntas, sin filtrar
  nextOpponentByTeamId: Record<number, string>;
  // Dificultad (1 fácil a 5 difícil) del próximo fixture de cada equipo —
  // mismo criterio que usa la propia FPL para el "FDR".
  nextFixtureDifficultyByTeamId: Record<number, number>;
  // Solo la fecha (gameweek) más próxima entre los fixtures futuros — panel
  // compacto de "próximos partidos", no el fixture completo de la temporada.
  upcomingFixtures: FplUpcomingFixture[];
}

interface FplBootstrapTeam { id: number; name: string; short_name: string; }
interface FplBootstrapElement {
  id: number; web_name: string; team: number; element_type: number;
  total_points: number; goals_scored: number; assists: number;
  status: FplStatus; chance_of_playing_next_round: number | null; selected_by_percent: string;
}
interface FplFixture {
  event: number | null; team_h: number; team_a: number; kickoff_time: string | null;
  team_h_difficulty: number; team_a_difficulty: number;
}

export async function getFplData(): Promise<FplData> {
  const [bootRes, fixRes] = await Promise.all([
    fetch(`/api/fpl?endpoint=bootstrap`),
    fetch(`/api/fpl?endpoint=fixtures`),
  ]);
  if (!bootRes.ok) throw new Error(`FPL ${bootRes.status}`);
  const boot = await bootRes.json() as { teams: FplBootstrapTeam[]; elements: FplBootstrapElement[] };

  const teamNameById = new Map<number, string>(boot.teams.map((t) => [t.id, t.name]));

  const players: FplPlayer[] = boot.elements.map((e) => ({
    id: e.id,
    name: e.web_name,
    clubId: e.team,
    club: teamNameById.get(e.team) ?? "",
    points: e.total_points ?? 0,
    goals: e.goals_scored ?? 0,
    assists: e.assists ?? 0,
    elementType: e.element_type,
    status: e.status,
    chanceOfPlayingNextRound: e.chance_of_playing_next_round,
    selectedByPercent: parseFloat(e.selected_by_percent) || 0,
  }));

  // Un solo pase por el fixture list (ya viene ordenado por fecha, ?future=1
  // filtra lo no jugado): el primer partido encontrado por equipo es el
  // próximo rival (y su dificultad, del lado que le toca a ese equipo) —
  // no hace falta más que eso. De paso, junta los fixtures de la gameweek
  // más próxima (menor "event") para el panel compacto.
  const nextOpponentByTeamId: Record<number, string> = {};
  const nextFixtureDifficultyByTeamId: Record<number, number> = {};
  let upcomingFixtures: FplUpcomingFixture[] = [];
  if (fixRes.ok) {
    const fixtures = await fixRes.json() as FplFixture[];
    for (const f of fixtures) {
      if (!(f.team_h in nextOpponentByTeamId)) {
        nextOpponentByTeamId[f.team_h] = teamNameById.get(f.team_a) ?? "";
        nextFixtureDifficultyByTeamId[f.team_h] = f.team_h_difficulty;
      }
      if (!(f.team_a in nextOpponentByTeamId)) {
        nextOpponentByTeamId[f.team_a] = teamNameById.get(f.team_h) ?? "";
        nextFixtureDifficultyByTeamId[f.team_a] = f.team_a_difficulty;
      }
    }
    const events = fixtures.map((f) => f.event).filter((e): e is number => e != null);
    const minEvent = events.length ? Math.min(...events) : null;
    upcomingFixtures = fixtures
      .filter((f) => f.event === minEvent)
      .map((f) => ({
        event: f.event,
        teamH: teamNameById.get(f.team_h) ?? "",
        teamA: teamNameById.get(f.team_a) ?? "",
        kickoffTime: f.kickoff_time,
      }))
      .sort((a, b) => (a.kickoffTime ?? "").localeCompare(b.kickoffTime ?? ""));
  }

  return { players, nextOpponentByTeamId, nextFixtureDifficultyByTeamId, upcomingFixtures };
}

export function rankFplPlayers(data: FplData, position: FplPosition, limit = 30): FplPlayer[] {
  const pos = FPL_POSITIONS.find((p) => p.key === position);
  if (!pos) return [];
  return data.players
    .filter((p) => p.elementType === pos.elementType)
    .sort((a, b) => b.points - a.points)
    .slice(0, limit);
}

export function topScorers(data: FplData, limit = 15): FplPlayer[] {
  return [...data.players].sort((a, b) => b.goals - a.goals).slice(0, limit);
}

export function topAssisters(data: FplData, limit = 15): FplPlayer[] {
  return [...data.players].sort((a, b) => b.assists - a.assists).slice(0, limit);
}
