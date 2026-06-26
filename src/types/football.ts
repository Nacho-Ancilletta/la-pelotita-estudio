export interface PlayerStat {
  id: number;
  name: string;
  age: number;
  nationality: string;
  photo: string;
  team: string;
  teamId: number;
  position: string;
  appearances: number;
  goals: number;
  assists: number;
  minutesPlayed: number;
  yellowCards: number;
  redCards: number;
  passAccuracy: number | null;
}

export interface PlayerPool {
  players: PlayerStat[];
  meta: {
    leagueId: string;
    leagueName: string;
    season: string;
    loadedAt: string;
    pagesLoaded: number;
  };
}
