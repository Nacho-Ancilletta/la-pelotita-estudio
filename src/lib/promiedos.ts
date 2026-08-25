// Promiedos como fuente de datos adicional/respaldo — no reemplaza ESPN
// (src/lib/espn.ts) ni API-Football (src/app/api/football/route.ts), se
// suma para Fixture (respaldo si ESPN da 403), Gran DT (goleadores/
// asistencias reales cruzados con los paneles por posición) y a futuro
// Buscador de Refuerzos.
//
// Investigación (antes de escribir esto): promiedos.com.ar es un sitio
// Next.js. La página /league/{urlName}/{id} es SSR y trae en
// <script id="__NEXT_DATA__"> un JSON con props.pageProps.data =
// { TTL, league, tables_groups, games, players_statistics }. Esa data ya
// viene resuelta del lado del servidor de Promiedos, así que nuestro proxy
// (src/app/api/promiedos/route.ts, endpoint=data) pide esa página y
// devuelve ese objeto tal cual — un solo request trae standings completos
// (todas las zonas/grupos) Y goleadores/asistencias/amarillas/rojas
// completos (no truncados, aunque el front les ponga "ver más" con
// preview_rows_num).
//
// tables_groups: array de grupos (ej. "Clausura", "Apertura", "Promedios",
// "Tabla Anual"), cada uno con tables (ej. "Zona A"/"Zona B"), cada tabla
// con table.rows: fila = { num, entity.object: equipo, values: [{key,value}] }
// con keys Points/GamePlayed/Goals("6:2")/GamesWon/GamesEven/GamesLost.
//
// players_statistics.tables: array con name "Goles"/"Asistencias"/
// "Tarjetas Rojas"/"Tarjetas Amarillas"/"Barridas ganadas", cada una con
// rows = { entity.object: {name,sname,team_id,position}, values:[{value}] }.
//
// Fixture por fecha: NO existe un endpoint por fecha calendario. El sitio
// organiza los partidos por "filterKey" opaco (ej. "72_228_8_5" = Fecha 5),
// listados en games.filters dentro del mismo payload de /league/{slug}/{id}
// (el filter con selected:true trae ya los partidos de esa fecha). Para
// partidos del día hay un filterKey especial "latest" ("Partidos
// actuales") — se pega directo a la API real que usa el selector de fecha
// del sitio: https://api.promiedos.com.ar/league/games/{id}/{filterKey}
// (requiere header X-VER, confirmado a mano). Por eso getFixtureLiga acá
// no recibe una fecha calendario como ESPN — recibe un filterKey opcional
// (default "latest"), que es lo que realmente soporta esta API.

export type PromiedosLeagueSlug =
  | "arg.1" | "conmebol.libertadores" | "conmebol.sudamericana"
  | "bra.1" | "eng.1" | "esp.1" | "ger.1" | "ita.1" | "fra.1"
  | "uefa.champions" | "uefa.europa"
  | "fifa.world" | "fifa.worldq.conmebol" | "fifa.worldq.uefa"
  | "conmebol.america" | "uefa.euro";

// Mismos slugs que usa el resto de la app (EspnFixtures.tsx, TacticoTab.tsx)
// para poder buscar por liga sin traducir nombres en cada lugar que integra
// Promiedos como respaldo.
export const PROMIEDOS_LEAGUES: Record<PromiedosLeagueSlug, { urlName: string; id: string; name: string }> = {
  "arg.1":                 { urlName: "liga-profesional",           id: "hc",   name: "Liga Profesional" },
  "conmebol.libertadores": { urlName: "libertadores",                id: "bac",  name: "Libertadores" },
  "conmebol.sudamericana": { urlName: "conmebol-sudamericana",       id: "dij",  name: "Sudamericana" },
  "bra.1":                 { urlName: "brasileirao-serie-a",         id: "bbd",  name: "Brasileirao" },
  "eng.1":                 { urlName: "premier-league",              id: "h",    name: "Premier League" },
  "esp.1":                 { urlName: "laliga",                      id: "bb",   name: "La Liga" },
  "ger.1":                 { urlName: "bundesliga",                  id: "cf",   name: "Bundesliga" },
  "ita.1":                 { urlName: "serie-a",                     id: "bh",   name: "Serie A" },
  "fra.1":                 { urlName: "ligue-1",                     id: "df",   name: "Ligue 1" },
  "uefa.champions":        { urlName: "uefa-champions-league",       id: "fhc",  name: "Champions League" },
  "uefa.europa":           { urlName: "uefa-europa-league",          id: "fhd",  name: "Europa League" },
  "fifa.world":            { urlName: "fifa-world-cup",              id: "fjda", name: "Mundial" },
  "fifa.worldq.conmebol":  { urlName: "conmebol-wc-qualification",   id: "gbd",  name: "Eliminatorias Sudamericanas" },
  "fifa.worldq.uefa":      { urlName: "uefa-world-cup-qualification",id: "fecb", name: "Eliminatorias Europeas" },
  "conmebol.america":      { urlName: "copa-america",                id: "fjf",  name: "Copa América" },
  "uefa.euro":              { urlName: "euro",                       id: "gdbg", name: "Eurocopa" },
};

export interface PromiedosTeam { id: string; name: string; shortName: string; urlName: string; }

export interface PromiedosStandingRow {
  position: number;
  team: PromiedosTeam;
  points: number;
  played: number;
  goalsFor: number;
  goalsAgainst: number;
  wins: number;
  draws: number;
  losses: number;
}

export interface PromiedosStandingTable { name: string; rows: PromiedosStandingRow[]; }
export interface PromiedosStandingGroup { name: string; tables: PromiedosStandingTable[]; }

export interface PromiedosPlayerStat {
  name: string;
  shortName: string;
  teamId: string;
  position: string;
  value: number;
}

export interface PromiedosGame {
  id: string;
  urlName: string;
  homeTeam: PromiedosTeam;
  awayTeam: PromiedosTeam;
  startTime: string; // "DD-MM-YYYY HH:mm", formato propio de Promiedos
  statusName: string;
  // Jornada real del torneo (ej. "Fecha 6") — confirmado a mano que el
  // filterKey "latest" es una VENTANA que puede traer partidos de 2
  // jornadas distintas mezclados en la misma respuesta (ej. quedan
  // partidos de "Fecha 6" sin jugar todavía junto con "Fecha 7" ya
  // empezando) — este campo es la única forma confiable de agrupar por
  // jornada real, no por rango de días calendario.
  roundName: string;
  // Resultado — presente solo si el partido ya se jugó (confirmado a mano:
  // "scores" no viene en absoluto en partidos todavía programados).
  homeScore: number | null;
  awayScore: number | null;
}

// ── Cache localStorage — mismo patrón {data,ts,ttlMs} que TacticoTab.tsx /
// EspnFixtures.tsx / GrandTTab.tsx, pero interno acá (no en el caller) para
// que cada función use el TTL que le corresponde a su tipo de dato, igual
// que ya hace getMatchDetails en espn.ts.
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
  try { localStorage.setItem(key, JSON.stringify({ data, ts: Date.now(), ttlMs })); }
  catch { /* localStorage lleno o deshabilitado — no es crítico */ }
}

const STANDINGS_TTL_MS = 5 * 60 * 1000;        // cambia seguido durante la fecha en vivo
const PLAYER_STATS_TTL_MS = 24 * 60 * 60 * 1000; // goleadores/asistencias se actualizan ~1 vez por fecha
const GAMES_TTL_MS = 5 * 60 * 1000;
const SQUAD_TTL_MS = 30 * 24 * 60 * 60 * 1000; // edad/altura de un jugador casi no cambia

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function valuesMap(values: any[] | undefined): Record<string, unknown> {
  const m: Record<string, unknown> = {};
  for (const v of values ?? []) m[v.key] = v.value;
  return m;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseStandingGroups(tablesGroups: any[] | undefined): PromiedosStandingGroup[] {
  return (tablesGroups ?? []).map((g) => ({
    name: g.name ?? "",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tables: (g.tables ?? []).map((t: any) => ({
      name: t.name ?? "",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rows: (t.table?.rows ?? []).map((r: any) => {
        const v = valuesMap(r.values);
        const [gf, ga] = String(v.Goals ?? "0:0").split(":").map((n) => parseInt(n, 10) || 0);
        return {
          position: r.num ?? 0,
          team: {
            id: r.entity?.object?.id ?? "",
            name: r.entity?.object?.name ?? "",
            shortName: r.entity?.object?.short_name ?? "",
            urlName: r.entity?.object?.url_name ?? "",
          },
          points: parseInt(String(v.Points ?? "0"), 10) || 0,
          played: parseInt(String(v.GamePlayed ?? "0"), 10) || 0,
          goalsFor: gf,
          goalsAgainst: ga,
          wins: parseInt(String(v.GamesWon ?? "0"), 10) || 0,
          draws: parseInt(String(v.GamesEven ?? "0"), 10) || 0,
          losses: parseInt(String(v.GamesLost ?? "0"), 10) || 0,
        };
      }),
    })),
  }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parsePlayerStatTable(tables: any[] | undefined, tableName: string): PromiedosPlayerStat[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = (tables ?? []).find((t: any) => t.name === tableName);
  if (!t) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (t.rows ?? []).map((r: any) => ({
    name: r.entity?.object?.name ?? "",
    shortName: r.entity?.object?.sname ?? "",
    teamId: r.entity?.object?.team_id ?? "",
    position: r.entity?.object?.position ?? "",
    value: parseInt(String(r.values?.[0]?.value ?? "0"), 10) || 0,
  }));
}

async function getLeagueData(league: PromiedosLeagueSlug) {
  const meta = PROMIEDOS_LEAGUES[league];
  const res = await fetch(`/api/promiedos?endpoint=data&slug=${meta.urlName}&id=${meta.id}`);
  if (!res.ok) throw new Error(`Promiedos ${res.status}`);
  return res.json();
}

// season: aceptado por paridad de firma con el resto de la app, pero
// Promiedos no tiene selector de temporada en esta URL — siempre devuelve
// la temporada/torneo en curso. Se ignora, queda documentado acá para no
// sorprender a quien lo use esperando historial.
export async function getTablaPosiciones(league: PromiedosLeagueSlug, _season?: number | string): Promise<PromiedosStandingGroup[]> {
  void _season;
  const key = `pelotita_promiedos_standings_${league}`;
  const cached = cacheGet<PromiedosStandingGroup[]>(key);
  if (cached) return cached;
  const data = await getLeagueData(league);
  const groups = parseStandingGroups(data.tables_groups);
  cacheSet(key, groups, STANDINGS_TTL_MS);
  return groups;
}

export async function getGoleadores(league: PromiedosLeagueSlug, _season?: number | string): Promise<PromiedosPlayerStat[]> {
  void _season;
  const key = `pelotita_promiedos_goleadores_${league}`;
  const cached = cacheGet<PromiedosPlayerStat[]>(key);
  if (cached) return cached;
  const data = await getLeagueData(league);
  const list = parsePlayerStatTable(data.players_statistics?.tables, "Goles");
  cacheSet(key, list, PLAYER_STATS_TTL_MS);
  return list;
}

export async function getAsistencias(league: PromiedosLeagueSlug, _season?: number | string): Promise<PromiedosPlayerStat[]> {
  void _season;
  const key = `pelotita_promiedos_asistencias_${league}`;
  const cached = cacheGet<PromiedosPlayerStat[]>(key);
  if (cached) return cached;
  const data = await getLeagueData(league);
  const list = parsePlayerStatTable(data.players_statistics?.tables, "Asistencias");
  cacheSet(key, list, PLAYER_STATS_TTL_MS);
  return list;
}

// Respaldo de fixture si ESPN falla. filterKey: "latest" (partidos
// actuales, default) o una key tipo "72_228_8_5" sacada de
// getFixtureFilters(). No es un filtro por fecha calendario — ver nota
// arriba sobre cómo organiza Promiedos las fechas.
export async function getFixtureLiga(league: PromiedosLeagueSlug, filterKey = "latest"): Promise<PromiedosGame[]> {
  const meta = PROMIEDOS_LEAGUES[league];
  const key = `pelotita_promiedos_games_${league}_${filterKey}`;
  const cached = cacheGet<PromiedosGame[]>(key);
  if (cached) return cached;

  const res = await fetch(`/api/promiedos?endpoint=games&id=${meta.id}&key=${encodeURIComponent(filterKey)}`);
  if (!res.ok) throw new Error(`Promiedos ${res.status}`);
  const data = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const games: PromiedosGame[] = (data.games ?? []).map((g: any) => ({
    id: g.id,
    urlName: g.url_name ?? "",
    homeTeam: { id: g.teams?.[0]?.id ?? "", name: g.teams?.[0]?.name ?? "", shortName: g.teams?.[0]?.short_name ?? "" },
    awayTeam: { id: g.teams?.[1]?.id ?? "", name: g.teams?.[1]?.name ?? "", shortName: g.teams?.[1]?.short_name ?? "" },
    startTime: g.start_time ?? "",
    statusName: g.status?.short_name ?? g.status?.name ?? "",
    roundName: g.stage_round_name ?? "",
    homeScore: typeof g.scores?.[0] === "number" ? g.scores[0] : null,
    awayScore: typeof g.scores?.[1] === "number" ? g.scores[1] : null,
  }));
  cacheSet(key, games, GAMES_TTL_MS);
  return games;
}

// ── Plantel por equipo — /team/{urlName}/{id} (investigado a mano, ago
// 2026: página Next.js SSR igual que /league/{slug}/{id}, mismo
// __NEXT_DATA__, pageProps.data.squad.groups[] con un grupo "Dirección"
// (cuerpo técnico, entity.object.is_staff:true — se excluye acá) y un
// grupo por posición ("Arqueros"/"Defensores"/etc). Cada fila trae
// entity.object.{name,sname,age,height,birthdate}. height viene como
// string en metros ("1.90") o "" si no está cargado — se descarta ahí
// también, nunca se estima. ──────────────────────────────────────────
export interface PromiedosSquadPlayer {
  name: string;
  surname: string;
  age: number | null;
  height: number | null; // metros
  birthdate: string | null;
}

export async function getSquad(teamUrlName: string, teamId: string): Promise<PromiedosSquadPlayer[]> {
  const key = `pelotita_promiedos_squad_${teamId}`;
  const cached = cacheGet<PromiedosSquadPlayer[]>(key);
  if (cached) return cached;

  const res = await fetch(`/api/promiedos?endpoint=team&slug=${teamUrlName}&id=${teamId}`);
  if (!res.ok) throw new Error(`Promiedos ${res.status}`);
  const data = await res.json();

  const players: PromiedosSquadPlayer[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const groups: any[] = data.squad?.groups ?? [];
  for (const g of groups) {
    for (const row of g.rows ?? []) {
      const obj = row.entity?.object;
      if (!obj || obj.is_staff) continue; // cuerpo técnico, no jugadores
      const ageNum = parseInt(String(obj.age ?? ""), 10);
      const heightNum = parseFloat(String(obj.height ?? "").replace(",", "."));
      players.push({
        name: obj.name ?? "",
        surname: obj.sname ?? obj.name ?? "",
        age: Number.isFinite(ageNum) && ageNum > 0 ? ageNum : null,
        height: Number.isFinite(heightNum) && heightNum > 0 ? heightNum : null,
        birthdate: obj.birthdate || null,
      });
    }
  }
  cacheSet(key, players, SQUAD_TTL_MS);
  return players;
}
