import type { SofaPlayerStat } from "@/lib/sofascore";

export type PlayerStat = SofaPlayerStat;

export interface PlayerPool {
  players: PlayerStat[];
  meta: {
    leagueId: string;
    leagueName: string;
    seasonId: number;
    seasonName: string;
    positionLabel: string;
    categoryLabel: string;
    loadedAt: string;
  };
}
