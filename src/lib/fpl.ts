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

export interface FplPlayer {
  id: number;
  name: string;
  clubId: number;
  club: string;
  points: number;
  goals: number;
  assists: number;
  elementType: number;
}

export interface FplData {
  players: FplPlayer[]; // todas las posiciones juntas, sin filtrar
  nextOpponentByTeamId: Record<number, string>;
}

interface FplBootstrapTeam { id: number; name: string; short_name: string; }
interface FplBootstrapElement {
  id: number; web_name: string; team: number; element_type: number;
  total_points: number; goals_scored: number; assists: number;
}
interface FplFixture { team_h: number; team_a: number; }

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
  }));

  // Un solo pase por el fixture list (ya viene ordenado por fecha, ?future=1
  // filtra lo no jugado): el primer partido encontrado por equipo es el
  // próximo rival — no hace falta más que eso.
  const nextOpponentByTeamId: Record<number, string> = {};
  if (fixRes.ok) {
    const fixtures = await fixRes.json() as FplFixture[];
    for (const f of fixtures) {
      if (!(f.team_h in nextOpponentByTeamId)) nextOpponentByTeamId[f.team_h] = teamNameById.get(f.team_a) ?? "";
      if (!(f.team_a in nextOpponentByTeamId)) nextOpponentByTeamId[f.team_a] = teamNameById.get(f.team_h) ?? "";
    }
  }

  return { players, nextOpponentByTeamId };
}

export function rankFplPlayers(data: FplData, position: FplPosition, limit = 30): FplPlayer[] {
  const pos = FPL_POSITIONS.find((p) => p.key === position);
  if (!pos) return [];
  return data.players
    .filter((p) => p.elementType === pos.elementType)
    .sort((a, b) => b.points - a.points)
    .slice(0, limit);
}
