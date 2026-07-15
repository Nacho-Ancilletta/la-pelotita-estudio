"use client";

import { useEffect, useState } from "react";
import {
  fetchTopPlayers, searchKeeper, fetchStandingsDefense, fetchTeamCleanSheets,
  type FootballPlayerStat, type KeeperStat, type TeamDefenseStat, type TopKind,
} from "@/lib/football";

const LEAGUES = [
  { id: "128", name: "Argentina — Primera División" },
  { id: "131", name: "Copa Libertadores" },
  { id: "71",  name: "Brasil — Série A" },
  { id: "262", name: "México — Liga MX" },
  { id: "39",  name: "Inglaterra — Premier League" },
  { id: "140", name: "España — La Liga" },
  { id: "135", name: "Italia — Serie A" },
  { id: "78",  name: "Alemania — Bundesliga" },
  { id: "61",  name: "Francia — Ligue 1" },
  { id: "2",   name: "Champions League" },
  { id: "3",   name: "Europa League" },
];

const SEASONS = ["2025", "2024", "2023", "2022", "2021"];

type Position = "F" | "M" | "D" | "G";

interface PlayerCategoryOpt {
  kind: "player";
  value: keyof FootballPlayerStat;
  label: string;
  source: TopKind;
  approx: boolean; // false = ranking exacto (viene ordenado así de la API) · true = reordenado local sobre un pool ajeno
  fmt?: (v: number) => string;
}
interface TeamCategoryOpt {
  kind: "team-goals" | "team-clean";
  value: "goalsAgainst" | "cleanSheets";
  label: string;
}
type CategoryOpt = PlayerCategoryOpt | TeamCategoryOpt;

const CATEGORIES_BY_POSITION: Record<Position, CategoryOpt[]> = {
  F: [
    { kind: "player", value: "goals",                    label: "GOLES",                 source: "topscorers", approx: false },
    { kind: "player", value: "assists",                   label: "ASISTENCIAS",           source: "topassists", approx: false },
    { kind: "player", value: "rating",                     label: "RATING (entre goleadores)", source: "topscorers", approx: true },
    { kind: "player", value: "shotsOnTargetPercentage",   label: "% TIROS AL ARCO",       source: "topscorers", approx: true, fmt: v => `${v}%` },
    { kind: "player", value: "successfulDribbles",        label: "GAMBETAS EXITOSAS",     source: "topscorers", approx: true },
  ],
  M: [
    { kind: "player", value: "assists",                   label: "ASISTENCIAS",           source: "topassists", approx: false },
    { kind: "player", value: "keyPasses",                  label: "PASES CLAVE",           source: "topassists", approx: true },
    { kind: "player", value: "rating",                     label: "RATING (entre asistidores)", source: "topassists", approx: true },
    { kind: "player", value: "totalDuelsWonPercentage",    label: "% DUELOS GANADOS",      source: "topassists", approx: true, fmt: v => `${v}%` },
  ],
  D: [
    { kind: "player", value: "interceptions",              label: "INTERCEPCIONES",        source: "topyellowcards", approx: true },
    { kind: "player", value: "yellowCards",                label: "TARJETAS AMARILLAS",    source: "topyellowcards", approx: false },
    { kind: "player", value: "redCards",                   label: "TARJETAS ROJAS",        source: "topredcards", approx: false },
    { kind: "team-goals", value: "goalsAgainst",            label: "GOLES RECIBIDOS (equipo)" },
    { kind: "team-clean", value: "cleanSheets",             label: "ARCOS EN 0 (equipo)" },
  ],
  G: [
    { kind: "team-goals", value: "goalsAgainst",            label: "GOLES RECIBIDOS (equipo)" },
    { kind: "team-clean", value: "cleanSheets",             label: "ARCOS EN 0 (equipo)" },
  ],
};

// ── Caché local (misma convención que Sofa: indefinida, se refresca a mano) ──
function cacheGet<T>(key: string): T | null {
  try { return JSON.parse(localStorage.getItem(key) ?? "null") as T; }
  catch { return null; }
}
function cacheSet(key: string, d: unknown) {
  localStorage.setItem(key, JSON.stringify(d));
}

function Select({
  label, value, onChange, children,
}: {
  label: string; value: string; onChange: (v: string) => void; children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[10px] text-orange/70 tracking-widest">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-bg-deep border border-bg-card text-cream text-xs font-mono rounded px-2 py-1.5 focus:outline-none focus:border-orange/50"
      >
        {children}
      </select>
    </label>
  );
}

export default function RefuerzosFootballPanel({ onVolverSofa }: { onVolverSofa: () => void }) {
  const [leagueId, setLeagueId] = useState("128");
  const [season, setSeason]     = useState("2024");
  const [position, setPosition] = useState<Position>("F");
  const [category, setCategory] = useState<CategoryOpt>(CATEGORIES_BY_POSITION.F[0]);

  const [players, setPlayers]   = useState<FootballPlayerStat[] | null>(null);
  const [teams, setTeams]       = useState<TeamDefenseStat[] | null>(null);
  const [sortCol, setSortCol]   = useState<string | null>(null);
  const [sortDir, setSortDir]   = useState<"asc" | "desc">("desc");

  const [loading, setLoading]   = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ── Búsqueda puntual de arquero ──
  const [keeperName, setKeeperName] = useState("");
  const [keeperResults, setKeeperResults] = useState<KeeperStat[] | null>(null);
  const [keeperLoading, setKeeperLoading] = useState(false);
  const [keeperError, setKeeperError] = useState<string | null>(null);

  useEffect(() => {
    setCategory(CATEGORIES_BY_POSITION[position][0]);
    setPlayers(null); setTeams(null); setSortCol(null); setLoadError(null);
    setKeeperResults(null); setKeeperError(null);
  }, [position]);

  useEffect(() => {
    setPlayers(null); setTeams(null); setSortCol(null); setLoadError(null);
  }, [category]);

  function sortBy(col: string) {
    if (sortCol === col) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortCol(col); setSortDir("desc"); }
  }

  async function buscarJugadores(cat: PlayerCategoryOpt) {
    setLoading(true); setLoadError(null); setSortCol(cat.approx ? cat.value : null); setSortDir("desc");
    const key = `pelotita_football_${cat.source}_${leagueId}_${season}`;
    try {
      let pool = cacheGet<FootballPlayerStat[]>(key);
      if (!pool || !pool.length) {
        pool = await fetchTopPlayers(cat.source, leagueId, season);
        cacheSet(key, pool);
      }
      if (!pool.length) throw new Error("Sin datos para esa búsqueda");
      setPlayers(pool);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  async function buscarGolesRecibidos() {
    setLoading(true); setLoadError(null);
    const key = `pelotita_football_standings_${leagueId}_${season}`;
    try {
      let table = cacheGet<TeamDefenseStat[]>(key);
      if (!table || !table.length) {
        table = await fetchStandingsDefense(leagueId, season);
        cacheSet(key, table);
      }
      setTeams(table);
      setSortCol("goalsAgainst"); setSortDir("asc");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  // Progresivo: primero standings (gratis), después clean_sheet equipo por equipo,
  // 1 pedido cada uno, respetando 10/min. Cachea cada equipo para no repetir.
  async function cargarArcosEnCero() {
    setLoading(true); setLoadError(null); setProgress(null);
    const standingsKey = `pelotita_football_standings_${leagueId}_${season}`;
    const cleanKey = `pelotita_football_cleansheets_${leagueId}_${season}`;
    try {
      let table = cacheGet<TeamDefenseStat[]>(standingsKey);
      if (!table || !table.length) {
        table = await fetchStandingsDefense(leagueId, season);
        cacheSet(standingsKey, table);
      }
      const cleanCache = cacheGet<Record<number, number>>(cleanKey) ?? {};
      const pending = table.filter(t => cleanCache[t.teamId] === undefined);

      for (let i = 0; i < pending.length; i++) {
        setProgress({ done: i, total: pending.length });
        const cs = await fetchTeamCleanSheets(pending[i].teamId, leagueId, season);
        cleanCache[pending[i].teamId] = cs;
        cacheSet(cleanKey, cleanCache);
        if (i < pending.length - 1) await new Promise(r => setTimeout(r, 6500)); // rate limit 10/min
      }

      const merged = table.map(t => ({ ...t, cleanSheets: cleanCache[t.teamId] ?? null }));
      setTeams(merged);
      setSortCol("cleanSheets"); setSortDir("desc");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false); setProgress(null);
    }
  }

  function buscar() {
    if (category.kind === "player") buscarJugadores(category);
    else if (category.kind === "team-goals") buscarGolesRecibidos();
    else cargarArcosEnCero();
  }

  async function buscarArquero() {
    if (!keeperName.trim()) return;
    setKeeperLoading(true); setKeeperError(null);
    const key = `pelotita_football_keeper_${leagueId}_${season}_${keeperName.trim().toLowerCase()}`;
    try {
      let results = cacheGet<KeeperStat[]>(key);
      if (!results) {
        results = await searchKeeper(keeperName.trim(), leagueId, season);
        cacheSet(key, results);
      }
      if (!results.length) throw new Error("No se encontró arquero con ese nombre en esta liga/temporada");
      setKeeperResults(results);
    } catch (err) {
      setKeeperError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setKeeperLoading(false);
    }
  }

  const displayedPlayers = (() => {
    if (!players || !sortCol) return players ?? [];
    const copy = [...players];
    copy.sort((a, b) => {
      const av = (a[sortCol as keyof FootballPlayerStat] as number) ?? 0;
      const bv = (b[sortCol as keyof FootballPlayerStat] as number) ?? 0;
      return sortDir === "desc" ? bv - av : av - bv;
    });
    return copy;
  })();

  const displayedTeams = (() => {
    if (!teams || !sortCol) return teams ?? [];
    const copy = [...teams];
    copy.sort((a, b) => {
      const av = (a[sortCol as keyof TeamDefenseStat] as number) ?? -1;
      const bv = (b[sortCol as keyof TeamDefenseStat] as number) ?? -1;
      return sortDir === "desc" ? bv - av : av - bv;
    });
    return copy;
  })();

  const isTeamMode = category.kind !== "player";
  const availableCategories = CATEGORIES_BY_POSITION[position];

  return (
    <div className="flex flex-1 overflow-hidden">
      <aside className="w-64 shrink-0 border-r border-bg-card overflow-y-auto flex flex-col">
        <div className="p-3 border-b border-bg-card/60 flex items-center justify-between">
          <span className="font-mono text-[10px] text-red-400 tracking-widest">MODO RESPALDO</span>
          <button onClick={onVolverSofa} className="text-[10px] font-mono text-cream/40 hover:text-orange transition-colors">
            ← volver a SOFA
          </button>
        </div>

        <div className="p-3 border-b border-bg-card/60 space-y-2">
          <div className="font-mono text-orange text-[10px] tracking-widest">⚽ BUSCAR</div>

          <Select label="LIGA" value={leagueId} onChange={setLeagueId}>
            {LEAGUES.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </Select>

          <Select label="TEMPORADA" value={season} onChange={setSeason}>
            {SEASONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>

          <div className="space-y-1">
            <span className="font-mono text-[10px] text-orange/70 tracking-widest">POSICIÓN</span>
            <div className="grid grid-cols-2 gap-1">
              {(["G", "D", "M", "F"] as Position[]).map(p => (
                <button key={p} onClick={() => setPosition(p)}
                  className={["py-1.5 text-[10px] font-mono rounded border transition-colors",
                    position === p ? "bg-orange/20 border-orange text-orange" : "border-bg-card text-cream/40 hover:text-cream/70"].join(" ")}>
                  {p === "G" ? "ARQUEROS" : p === "D" ? "DEFENSORES" : p === "M" ? "MEDIOCAMPISTAS" : "DELANTEROS"}
                </button>
              ))}
            </div>
          </div>

          {availableCategories.length > 0 && (
            <div className="space-y-1">
              <span className="font-mono text-[10px] text-orange/70 tracking-widest">ORDENAR POR</span>
              <div className="flex flex-col gap-1">
                {availableCategories.map(c => (
                  <button key={c.label} onClick={() => setCategory(c)}
                    className={["py-1.5 px-2 text-left text-[10px] font-mono rounded border transition-colors",
                      category.label === c.label ? "bg-orange/20 border-orange text-orange" : "border-bg-card text-cream/40 hover:text-cream/70"].join(" ")}>
                    {c.label}{c.kind === "player" && c.approx && <span className="text-cream/25"> *</span>}
                  </button>
                ))}
              </div>
              {category.kind === "player" && category.approx && (
                <p className="text-cream/25 text-[9px] leading-snug">
                  * API-Football no tiene ranking exacto para esto en plan gratis — se reordena
                  localmente dentro del top 20 de {category.source === "topscorers" ? "goleadores" : category.source === "topassists" ? "asistidores" : "amonestados"}.
                </p>
              )}
              {category.kind === "team-clean" && (
                <p className="text-cream/25 text-[9px] leading-snug">
                  Dato de EQUIPO, no de un arquero puntual — la API no distingue qué arquero atajó cada partido.
                  Carga ~{LEAGUES.length && "20-28"} pedidos la primera vez (después queda cacheado).
                </p>
              )}
            </div>
          )}

          {position === "G" && (
            <div className="pt-1 space-y-1 border-t border-bg-card/60">
              <span className="font-mono text-[10px] text-orange/70 tracking-widest">RATING DE ARQUERO (búsqueda puntual)</span>
              <div className="flex gap-1">
                <input
                  value={keeperName}
                  onChange={e => setKeeperName(e.target.value)}
                  placeholder="apellido..."
                  onKeyDown={e => e.key === "Enter" && buscarArquero()}
                  className="flex-1 bg-bg-deep border border-bg-card text-cream text-xs font-mono rounded px-2 py-1.5 focus:outline-none focus:border-orange/50 placeholder-cream/20"
                />
                <button onClick={buscarArquero} disabled={keeperLoading}
                  className="bg-orange/20 border border-orange text-orange text-[10px] font-mono px-2 rounded hover:bg-orange/30 transition-colors disabled:opacity-40">
                  {keeperLoading ? "..." : "IR"}
                </button>
              </div>
              {keeperError && <div className="text-red-400 font-mono text-[10px]">{keeperError}</div>}
              {keeperResults && (
                <div className="space-y-1.5 pt-1">
                  {keeperResults.map(k => (
                    <div key={k.id} className="bg-bg-card/30 rounded p-2 space-y-0.5">
                      <div className="text-cream font-mono text-xs font-bold">{k.name}</div>
                      <div className="text-cream/50 text-[10px]">{k.team}</div>
                      <div className="text-[10px] text-cream/70 font-mono">
                        RATING {k.rating.toFixed(2)} · PJ {k.appearances} · ATAJADAS {k.saves} · RECIBIDOS {k.goalsConceded} · %AT {k.savePercentage}%
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {availableCategories.length > 0 && (
            <button
              onClick={buscar}
              disabled={loading}
              className="w-full bg-orange text-bg-deep font-mono font-bold text-xs py-2 rounded tracking-widest hover:bg-orange/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? (progress ? `CARGANDO ${progress.done}/${progress.total}...` : "CARGANDO...") : "BUSCAR TOP 10"}
            </button>
          )}

          {loadError && (
            <div className="text-red-400 font-mono text-[10px] bg-red-900/20 rounded p-2 border border-red-900/40">
              {loadError}
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        {!players && !teams && !loading && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <div className="text-4xl opacity-20">⚽</div>
            <div className="font-mono text-cream/30 text-sm">Sin resultados</div>
            <div className="text-cream/20 text-xs max-w-xs">
              Elegí posición y categoría, después BUSCAR TOP 10.
            </div>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="font-mono text-orange text-sm animate-pulse">
              {progress ? `Cargando equipo ${progress.done + 1} de ${progress.total}...` : "Conectando con API-Football..."}
            </div>
            {progress && <div className="text-cream/30 text-xs font-mono">Esperando rate limit entre pedidos (6 seg.)</div>}
          </div>
        )}

        {!isTeamMode && players && !loading && (
          <>
            <div className="sticky top-0 bg-bg-deep border-b border-bg-card px-4 py-1.5 flex items-center gap-3">
              <span className="font-mono text-xs text-orange">{players.length} jugadores</span>
              <span className="font-mono text-[10px] text-cream/30">{category.label} · {LEAGUES.find(l => l.id === leagueId)?.name}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b border-bg-card bg-bg-card/30 font-mono text-[10px] text-orange/70 tracking-widest">
                  <tr>
                    <th className="px-4 py-1.5 text-left">#</th>
                    <th className="px-4 py-1.5 text-left">JUGADOR</th>
                    <th className="px-4 py-1.5 text-left">EQUIPO</th>
                    {([
                      { value: "rating", label: "RATING" },
                      { value: "appearances", label: "PJ" },
                      { value: "goals", label: "GOL" },
                      { value: "assists", label: "ASI" },
                      { value: "yellowCards", label: "TA" },
                      { value: "redCards", label: "TR" },
                    ] as { value: keyof FootballPlayerStat; label: string }[]).map(c => {
                      const active = sortCol === c.value;
                      return (
                        <th key={c.value} onClick={() => sortBy(c.value)}
                          className={`px-3 py-1.5 text-center cursor-pointer select-none hover:text-orange transition-colors ${active ? "text-orange" : ""}`}>
                          {c.label}{active && <span className="ml-0.5">{sortDir === "desc" ? "▼" : "▲"}</span>}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {displayedPlayers.map((p, i) => (
                    <tr key={p.id} className="border-b border-bg-card/40 hover:bg-bg-card/30 transition-colors">
                      <td className="px-4 py-1.5 font-mono text-cream/30">{i + 1}</td>
                      <td className="px-4 py-1.5 text-cream font-medium">{p.name}</td>
                      <td className="px-4 py-1.5 text-cream/70">{p.team}</td>
                      <td className="px-3 py-1.5 text-center font-mono font-bold text-orange">{p.rating ? p.rating.toFixed(2) : "—"}</td>
                      <td className="px-3 py-1.5 text-center text-cream/50">{p.appearances}</td>
                      <td className="px-3 py-1.5 text-center font-bold text-warm-white">{p.goals}</td>
                      <td className="px-3 py-1.5 text-center font-bold text-warm-white">{p.assists}</td>
                      <td className="px-3 py-1.5 text-center text-yellow-500/70">{p.yellowCards}</td>
                      <td className="px-3 py-1.5 text-center text-red-500/70">{p.redCards}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {isTeamMode && teams && !loading && (
          <>
            <div className="sticky top-0 bg-bg-deep border-b border-bg-card px-4 py-1.5 flex items-center gap-3">
              <span className="font-mono text-xs text-orange">{teams.length} equipos</span>
              <span className="font-mono text-[10px] text-cream/30">{category.label} · {LEAGUES.find(l => l.id === leagueId)?.name}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b border-bg-card bg-bg-card/30 font-mono text-[10px] text-orange/70 tracking-widest">
                  <tr>
                    <th className="px-4 py-1.5 text-left">#</th>
                    <th className="px-4 py-1.5 text-left">EQUIPO</th>
                    <th className="px-3 py-1.5 text-center">PJ</th>
                    <th onClick={() => sortBy("goalsAgainst")} className={`px-3 py-1.5 text-center cursor-pointer hover:text-orange transition-colors ${sortCol === "goalsAgainst" ? "text-orange" : ""}`}>
                      GOLES RECIBIDOS{sortCol === "goalsAgainst" && <span className="ml-0.5">{sortDir === "desc" ? "▼" : "▲"}</span>}
                    </th>
                    <th className="px-3 py-1.5 text-center">PROM/PJ</th>
                    <th onClick={() => sortBy("cleanSheets")} className={`px-3 py-1.5 text-center cursor-pointer hover:text-orange transition-colors ${sortCol === "cleanSheets" ? "text-orange" : ""}`}>
                      ARCOS EN 0{sortCol === "cleanSheets" && <span className="ml-0.5">{sortDir === "desc" ? "▼" : "▲"}</span>}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {displayedTeams.map((t, i) => (
                    <tr key={t.teamId} className="border-b border-bg-card/40 hover:bg-bg-card/30 transition-colors">
                      <td className="px-4 py-1.5 font-mono text-cream/30">{i + 1}</td>
                      <td className="px-4 py-1.5 text-cream font-medium">{t.teamName}</td>
                      <td className="px-3 py-1.5 text-center text-cream/50">{t.played}</td>
                      <td className="px-3 py-1.5 text-center font-bold text-warm-white">{t.goalsAgainst}</td>
                      <td className="px-3 py-1.5 text-center text-cream/50">{t.goalsAgainstAvg}</td>
                      <td className="px-3 py-1.5 text-center font-bold text-warm-white">{t.cleanSheets ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
