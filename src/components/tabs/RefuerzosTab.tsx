"use client";

import { useEffect, useState } from "react";
import type { PlayerStat, PlayerPool } from "@/types/football";
import { savePool, loadPool, clearPool, timeAgo } from "@/lib/playerCache";
import { SOFA_TOURNAMENTS, getSeasons, getPlayerStats, type SofaSeason, type SofaPosition } from "@/lib/sofascore";
import RefuerzosFootballPanel from "@/components/tabs/RefuerzosFootballPanel";

// ── Ligas disponibles ──────────────────────────────────────────
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

const POSITIONS: { value: SofaPosition; label: string }[] = [
  { value: "G", label: "ARQUEROS" },
  { value: "D", label: "DEFENSORES" },
  { value: "M", label: "MEDIOCAMPISTAS" },
  { value: "F", label: "DELANTEROS" },
];

// Los campos de % (savePercentage, shotsOnTargetPercentage, totalDuelsWonPercentage,
// accuratePassesPercentage) y duelsWon (suma calculada) no se pueden ordenar de forma
// confiable directo en la API de Sofascore — un jugador con 11 minutos y 100% de
// pases queda primero. Para esos, se trae un pool más grande ordenado por rating,
// se filtra por minutos mínimos y se reordena acá.
const MIN_MINUTES_FOR_PCT = 270;

interface CategoryOpt {
  value: keyof PlayerStat;
  label: string;
  fetchOrder: string;   // orden real que se le pide a la API
  clientSort?: boolean; // si true, se trae un pool grande y se reordena localmente
  fmt?: (v: number) => string;
}

const CATEGORIES_BY_POSITION: Record<SofaPosition, CategoryOpt[]> = {
  G: [
    { value: "rating",            label: "RATING",            fetchOrder: "-rating" },
    { value: "savePercentage",    label: "% ATAJADAS",        fetchOrder: "-rating", clientSort: true, fmt: v => `${v}%` },
    { value: "cleanSheet",        label: "ARCO EN 0",         fetchOrder: "-cleanSheet" },
    { value: "successfulRunsOut", label: "SALIDAS EXITOSAS",  fetchOrder: "-successfulRunsOut" },
  ],
  D: [
    { value: "rating",                  label: "RATING",             fetchOrder: "-rating" },
    { value: "totalDuelsWonPercentage", label: "% DUELOS GANADOS",   fetchOrder: "-rating", clientSort: true, fmt: v => `${v}%` },
    { value: "interceptions",           label: "INTERCEPCIONES",     fetchOrder: "-interceptions" },
    { value: "clearances",              label: "DESPEJES",           fetchOrder: "-clearances" },
    { value: "tacklesWon",              label: "TACKLES EXITOSOS",   fetchOrder: "-tacklesWon" },
  ],
  M: [
    { value: "rating",                    label: "RATING",              fetchOrder: "-rating" },
    { value: "keyPasses",                 label: "PASES CLAVE",         fetchOrder: "-keyPasses" },
    { value: "accuratePassesPercentage",  label: "% PASES COMPLETADOS", fetchOrder: "-rating", clientSort: true, fmt: v => `${v}%` },
    { value: "duelsWon",                  label: "DUELOS GANADOS",      fetchOrder: "-rating", clientSort: true },
    { value: "ballRecovery",              label: "RECUPERACIONES",      fetchOrder: "-ballRecovery" },
  ],
  F: [
    { value: "rating",                  label: "RATING",              fetchOrder: "-rating" },
    { value: "successfulDribbles",      label: "GAMBETAS EXITOSAS",   fetchOrder: "-successfulDribbles" },
    { value: "shotsOnTargetPercentage", label: "% TIROS AL ARCO",     fetchOrder: "-rating", clientSort: true, fmt: v => `${v}%` },
    { value: "bigChancesCreated",       label: "GRANDES OCASIONES",   fetchOrder: "-bigChancesCreated" },
    { value: "aerialDuelsWon",          label: "DUELOS AÉREOS GANADOS", fetchOrder: "-aerialDuelsWon" },
  ],
};

// ── Cache de temporadas por liga ────────────────────────────────
function cacheGet<T>(key: string): T | null {
  try { return JSON.parse(localStorage.getItem(key) ?? "null") as T; }
  catch { return null; }
}
function cacheSet(key: string, d: unknown) {
  localStorage.setItem(key, JSON.stringify(d));
}

// ── Componentes de UI ──────────────────────────────────────────

function Select({
  label, value, onChange, disabled, children,
}: {
  label: string; value: string; onChange: (v: string) => void; disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[10px] text-orange/70 tracking-widest">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="bg-bg-deep border border-bg-card text-cream text-xs font-mono rounded px-2 py-1.5 focus:outline-none focus:border-orange/50 disabled:opacity-40"
      >
        {children}
      </select>
    </label>
  );
}

// ── Componente principal ───────────────────────────────────────

export default function RefuerzosTab() {
  const [mode, setMode] = useState<"sofa" | "football">("sofa");

  const [pool, setPool]         = useState<PlayerPool | null>(null);
  const [loading, setLoading]   = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [blocked, setBlocked]   = useState(false);

  const [leagueId, setLeagueId] = useState("128");
  const [seasons,  setSeasons]  = useState<SofaSeason[]>([]);
  const [seasonId, setSeasonId] = useState<number | null>(null);
  const [seasonsLoading, setSeasonsLoading] = useState(false);

  const [position, setPosition] = useState<SofaPosition>("F");
  const [category,  setCategory] = useState<CategoryOpt>(CATEGORIES_BY_POSITION.F[0]);

  const [sortCol, setSortCol] = useState<keyof PlayerStat | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    const cached = loadPool();
    if (cached) setPool(cached);
  }, []);

  // Al cambiar de liga: traer temporadas 2020-2026 disponibles
  useEffect(() => {
    setSeasons([]); setSeasonId(null); setLoadError(null);
    const tournamentId = SOFA_TOURNAMENTS[leagueId];
    if (!tournamentId) { setLoadError("Esta liga todavía no tiene mapeo a Sofascore"); return; }

    const key = `pelotita_sofa_seasons_${tournamentId}`;
    const cached = cacheGet<SofaSeason[]>(key);
    if (cached && cached.length) {
      setSeasons(cached);
      setSeasonId(cached[0].id);
      return;
    }
    setSeasonsLoading(true);
    getSeasons(tournamentId, 2020)
      .then(list => {
        cacheSet(key, list);
        setSeasons(list);
        setSeasonId(list[0]?.id ?? null);
      })
      .catch(e => setLoadError(e instanceof Error ? e.message : "Error cargando temporadas"))
      .finally(() => setSeasonsLoading(false));
  }, [leagueId]);

  // Al cambiar de posición: las categorías son otras — volver a RATING
  useEffect(() => {
    setCategory(CATEGORIES_BY_POSITION[position][0]);
  }, [position]);

  const availableCategories = CATEGORIES_BY_POSITION[position];

  function sortBy(col: keyof PlayerStat) {
    if (sortCol === col) {
      setSortDir(d => d === "desc" ? "asc" : "desc");
    } else {
      setSortCol(col);
      setSortDir("desc");
    }
  }

  const displayedPlayers = (() => {
    if (!pool) return [];
    if (!sortCol) return pool.players;
    const copy = [...pool.players];
    copy.sort((a, b) => {
      const av = (a[sortCol] as number) ?? 0;
      const bv = (b[sortCol] as number) ?? 0;
      return sortDir === "desc" ? bv - av : av - bv;
    });
    return copy;
  })();

  async function buscar() {
    if (seasonId == null) return;
    setLoading(true);
    setLoadError(null);
    setBlocked(false);
    setSortCol(null);
    setSortDir("desc");

    const tournamentId = SOFA_TOURNAMENTS[leagueId];
    const seasonInfo = seasons.find(s => s.id === seasonId);
    const key = `pelotita_sofa_leaderboard_${tournamentId}_${seasonId}_${position}_${category.value}_10`;

    try {
      let players = cacheGet<PlayerStat[]>(key);
      if (!players || !players.length) {
        if (category.clientSort) {
          // pool más grande, ordenado por rating, filtrado por minutos mínimos y reordenado acá
          const pool50 = await getPlayerStats(tournamentId, seasonId, category.fetchOrder, 50, position);
          players = pool50
            .filter(p => p.minutesPlayed >= MIN_MINUTES_FOR_PCT)
            .sort((a, b) => (b[category.value] as number) - (a[category.value] as number))
            .slice(0, 10);
        } else {
          players = await getPlayerStats(tournamentId, seasonId, category.fetchOrder, 10, position);
        }
        cacheSet(key, players);
      }
      if (!players.length) throw new Error("Sin datos para esa búsqueda");

      const newPool: PlayerPool = {
        players,
        meta: {
          leagueId,
          leagueName: LEAGUES.find(l => l.id === leagueId)?.name ?? leagueId,
          seasonId,
          seasonName: seasonInfo?.name ?? String(seasonId),
          positionLabel: POSITIONS.find(p => p.value === position)?.label ?? position,
          categoryLabel: category.label,
          loadedAt: new Date().toISOString(),
        },
      };

      savePool(newPool);
      setPool(newPool);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      setLoadError(msg);
      if (/403|503/.test(msg)) setBlocked(true);
    } finally {
      setLoading(false);
    }
  }

  function borrarPozo() {
    clearPool();
    setPool(null);
    setLoadError(null);
  }

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* ── Header del tab ── */}
      <div className="border-b border-bg-card px-6 py-2.5 flex items-center justify-between">
        <div>
          <h2 className="font-mono text-orange text-xs tracking-widest mb-0.5">
            TRACK 02 · BUSCADOR DE REFUERZOS
          </h2>
          <p className="text-cream/50 text-xs">
            Elegí posición y categoría · top 10 de Sofascore, 1 pedido por búsqueda
          </p>
        </div>
        {mode === "sofa" && (
          <button
            onClick={() => setMode("football")}
            className="shrink-0 text-[10px] font-mono text-cream/30 hover:text-red-400 border border-bg-card hover:border-red-900/50 rounded px-2 py-1 transition-colors"
          >
            ver modo respaldo →
          </button>
        )}
      </div>

      {mode === "football" ? (
        <RefuerzosFootballPanel onVolverSofa={() => setMode("sofa")} />
      ) : (
      <div className="flex flex-1 overflow-hidden">
        {/* ── Sidebar izquierdo ── */}
        <aside className="w-64 shrink-0 border-r border-bg-card overflow-y-auto flex flex-col">
          <div className="p-3 border-b border-bg-card/60 space-y-2">
            <div className="font-mono text-orange text-[10px] tracking-widest">
              ⚽  BUSCAR
            </div>

            <Select label="LIGA" value={leagueId} onChange={setLeagueId}>
              {LEAGUES.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </Select>

            <Select label="TEMPORADA" value={String(seasonId ?? "")} onChange={v => setSeasonId(Number(v))} disabled={!seasons.length}>
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>

            {/* Posición */}
            <div className="space-y-1">
              <span className="font-mono text-[10px] text-orange/70 tracking-widest">POSICIÓN</span>
              <div className="grid grid-cols-2 gap-1">
                {POSITIONS.map(p => (
                  <button key={p.value} onClick={() => setPosition(p.value)}
                    className={["py-1.5 text-[10px] font-mono rounded border transition-colors",
                      position === p.value ? "bg-orange/20 border-orange text-orange" : "border-bg-card text-cream/40 hover:text-cream/70"].join(" ")}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Categoría */}
            <div className="space-y-1">
              <span className="font-mono text-[10px] text-orange/70 tracking-widest">ORDENAR POR</span>
              <div className="flex flex-col gap-1">
                {availableCategories.map(c => (
                  <button key={c.value} onClick={() => setCategory(c)}
                    className={["py-1.5 px-2 text-left text-[10px] font-mono rounded border transition-colors",
                      category.value === c.value ? "bg-orange/20 border-orange text-orange" : "border-bg-card text-cream/40 hover:text-cream/70"].join(" ")}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={buscar}
              disabled={loading || seasonId == null}
              className="w-full bg-orange text-bg-deep font-mono font-bold text-xs py-2 rounded tracking-widest hover:bg-orange/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {seasonsLoading ? "BUSCANDO TEMPORADAS..." : loading ? "CARGANDO..." : "BUSCAR TOP 10"}
            </button>

            {loadError && (
              <div className="text-red-400 font-mono text-[10px] bg-red-900/20 rounded p-2 border border-red-900/40 space-y-1.5">
                <div>{loadError}</div>
                {blocked && (
                  <button
                    onClick={() => setMode("football")}
                    className="w-full bg-red-900/40 border border-red-700/50 text-cream/80 font-mono text-[10px] py-1.5 rounded hover:bg-red-900/60 transition-colors"
                  >
                    Sofascore bloqueado acá → usar respaldo API-FOOTBALL
                  </button>
                )}
              </div>
            )}
          </div>

          {pool && (
            <div className="p-3 space-y-1">
              <div className="font-mono text-[10px] text-orange/70 tracking-widest">ÚLTIMA BÚSQUEDA</div>
              <div className="text-cream font-mono text-xs font-bold">{pool.meta.positionLabel} · {pool.meta.categoryLabel}</div>
              <div className="text-cream/50 text-xs">{pool.meta.leagueName}</div>
              <div className="text-cream/40 text-xs">{pool.meta.seasonName}</div>
              <div className="text-cream/30 text-[10px]">{timeAgo(pool.meta.loadedAt)}</div>
              <button
                onClick={borrarPozo}
                className="mt-2 text-[10px] font-mono text-cream/30 hover:text-red-400 transition-colors"
              >
                ✕ borrar
              </button>
            </div>
          )}
        </aside>

        {/* ── Panel de resultados ── */}
        <main className="flex-1 overflow-auto">
          {!pool && !loading && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
              <div className="text-4xl opacity-20">⚽</div>
              <div className="font-mono text-cream/30 text-sm">Sin resultados</div>
              <div className="text-cream/20 text-xs max-w-xs">
                Elegí posición y categoría, después BUSCAR TOP 10. 1 solo pedido por búsqueda.
              </div>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <div className="font-mono text-orange text-sm animate-pulse">Conectando con Sofascore...</div>
            </div>
          )}

          {pool && !loading && (
            <>
              <div className="sticky top-0 bg-bg-deep border-b border-bg-card px-4 py-1.5 flex items-center gap-3">
                <span className="font-mono text-xs text-orange">{pool.players.length} jugadores</span>
                <span className="font-mono text-[10px] text-cream/30">{pool.meta.positionLabel} · {pool.meta.categoryLabel} · {pool.meta.leagueName}</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="border-b border-bg-card bg-bg-card/30 font-mono text-[10px] text-orange/70 tracking-widest">
                    <tr>
                      <th className="px-4 py-1.5 text-left">#</th>
                      <th className="px-4 py-1.5 text-left">JUGADOR</th>
                      <th className="px-4 py-1.5 text-left">EQUIPO</th>
                      {(
                        [{ value: "rating" as const, label: "RATING" },
                         { value: "appearances" as const, label: "PJ" },
                         { value: "minutesPlayed" as const, label: "MIN" },
                         ...availableCategories.slice(1)]
                      ).map(c => {
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
                    {displayedPlayers.map((player, i) => (
                      <tr key={player.id} className="border-b border-bg-card/40 hover:bg-bg-card/30 transition-colors">
                        <td className="px-4 py-1.5 font-mono text-cream/30">{i + 1}</td>
                        <td className="px-4 py-1.5 text-cream font-medium">{player.name}</td>
                        <td className="px-4 py-1.5 text-cream/70">{player.team}</td>
                        <td className="px-3 py-1.5 text-center font-mono font-bold text-orange">{player.rating.toFixed(2)}</td>
                        <td className="px-3 py-1.5 text-center text-cream/50">{player.appearances}</td>
                        <td className="px-3 py-1.5 text-center text-cream/50">{player.minutesPlayed}</td>
                        {availableCategories.slice(1).map(c => {
                          const raw = player[c.value] as number;
                          return (
                            <td key={c.value} className="px-3 py-1.5 text-center font-bold text-warm-white">
                              {c.fmt ? c.fmt(raw) : raw}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </main>
      </div>
      )}
    </div>
  );
}
