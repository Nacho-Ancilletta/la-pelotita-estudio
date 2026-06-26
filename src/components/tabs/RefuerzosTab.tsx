"use client";

import { useEffect, useMemo, useState } from "react";
import type { PlayerStat, PlayerPool } from "@/types/football";
import { savePool, loadPool, clearPool, timeAgo } from "@/lib/playerCache";
import { updateQuota } from "@/components/ApiQuotaCounter";

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

const SEASONS = ["2025", "2024", "2023", "2022", "2021"];

const POSITIONS: { value: string; label: string }[] = [
  { value: "",            label: "Todas las posiciones" },
  { value: "Goalkeeper",  label: "Arquero" },
  { value: "Defender",    label: "Defensor" },
  { value: "Midfielder",  label: "Mediocampista" },
  { value: "Attacker",    label: "Delantero" },
];

const SORT_OPTIONS: { value: keyof PlayerStat; label: string }[] = [
  { value: "goals",        label: "Goles" },
  { value: "assists",      label: "Asistencias" },
  { value: "minutesPlayed",label: "Minutos" },
  { value: "appearances",  label: "Partidos" },
  { value: "yellowCards",  label: "Tarjetas amarillas" },
  { value: "redCards",     label: "Tarjetas rojas" },
  { value: "passAccuracy", label: "Pase %" },
  { value: "age",          label: "Edad" },
];

// ── Helpers ────────────────────────────────────────────────────

function parseRawPlayer(entry: {
  player: { id: number; name: string; age: number; nationality: string; photo: string };
  statistics: {
    team: { id: number; name: string };
    games: { position: string; minutes: number; appearences: number };
    goals: { total: number | null; assists: number | null };
    cards: { yellow: number; red: number };
    passes: { accuracy: string | number | null } | null;
  }[];
}): PlayerStat | null {
  const s = entry.statistics?.[0];
  if (!s) return null;
  return {
    id:           entry.player.id,
    name:         entry.player.name,
    age:          entry.player.age,
    nationality:  entry.player.nationality,
    photo:        entry.player.photo,
    team:         s.team.name,
    teamId:       s.team.id,
    position:     s.games?.position ?? "",
    appearances:  s.games?.appearences ?? 0,
    goals:        s.goals?.total ?? 0,
    assists:      s.goals?.assists ?? 0,
    minutesPlayed:s.games?.minutes ?? 0,
    yellowCards:  s.cards?.yellow ?? 0,
    redCards:     s.cards?.red ?? 0,
    passAccuracy: s.passes?.accuracy != null ? parseFloat(String(s.passes.accuracy)) : null,
  };
}

// ── Componentes de UI ──────────────────────────────────────────

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
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

function NumberInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[10px] text-orange/70 tracking-widest">{label}</span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-bg-deep border border-bg-card text-cream text-xs font-mono rounded px-2 py-1.5 focus:outline-none focus:border-orange/50 w-full placeholder-cream/20"
      />
    </label>
  );
}

function posLabel(pos: string) {
  const found = POSITIONS.find((p) => p.value === pos);
  return found ? found.label : pos;
}

// ── Componente principal ───────────────────────────────────────

export default function RefuerzosTab() {
  // Estado del pozo
  const [pool, setPool]         = useState<PlayerPool | null>(null);
  const [loading, setLoading]   = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ page: number; total: number } | null>(null);

  // Formulario de carga
  const [leagueId, setLeagueId] = useState("128");
  const [season, setSeason]     = useState("2024");
  const [pages, setPages]       = useState("2");

  // Filtros locales
  const [filterPos, setFilterPos]           = useState("");
  const [filterMinAge, setFilterMinAge]     = useState("");
  const [filterMaxAge, setFilterMaxAge]     = useState("");
  const [filterMinGoals, setFilterMinGoals] = useState("");
  const [filterMinAssists, setFilterMinAssists] = useState("");
  const [sortBy, setSortBy]     = useState<keyof PlayerStat>("goals");
  const [sortDir, setSortDir]   = useState<"asc" | "desc">("desc");

  // Carga desde localStorage al montar
  useEffect(() => {
    const cached = loadPool();
    if (cached) setPool(cached);
  }, []);

  // ── Carga del pozo desde la API ────────────────────────────
  async function cargarPozo() {
    setLoading(true);
    setLoadError(null);
    setProgress(null);

    const totalPages = Math.min(Math.max(parseInt(pages) || 1, 1), 5);
    const allPlayers: PlayerStat[] = [];

    try {
      for (let page = 1; page <= totalPages; page++) {
        setProgress({ page, total: totalPages });

        const res = await fetch(
          `/api/football?endpoint=players&league=${leagueId}&season=${season}&page=${page}`
        );

        if (!res.ok) {
          throw new Error(`Error ${res.status} en página ${page}`);
        }

        const { data, quotaRemaining } = await res.json();

        if (quotaRemaining !== null) updateQuota(quotaRemaining);

        if (data.errors && Object.keys(data.errors).length > 0) {
          const errMsg = Object.values(data.errors).join(", ");
          throw new Error(errMsg);
        }

        if (!data.response || data.response.length === 0) break;

        for (const entry of data.response) {
          const parsed = parseRawPlayer(entry);
          if (parsed) allPlayers.push(parsed);
        }

        // Si hay más páginas, respeta el rate limit (10 req/min)
        if (page < totalPages) {
          await new Promise((r) => setTimeout(r, 6500));
        }
      }

      const leagueName = LEAGUES.find((l) => l.id === leagueId)?.name ?? leagueId;
      const newPool: PlayerPool = {
        players: allPlayers,
        meta: {
          leagueId,
          leagueName,
          season,
          loadedAt: new Date().toISOString(),
          pagesLoaded: totalPages,
        },
      };

      savePool(newPool);
      setPool(newPool);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }

  function borrarPozo() {
    clearPool();
    setPool(null);
    setLoadError(null);
  }

  // ── Filtrado y orden local (instantáneo) ───────────────────
  const filtered = useMemo(() => {
    if (!pool) return [];
    let players = [...pool.players];

    if (filterPos)        players = players.filter((p) => p.position === filterPos);
    if (filterMinAge)     players = players.filter((p) => p.age >= parseInt(filterMinAge));
    if (filterMaxAge)     players = players.filter((p) => p.age <= parseInt(filterMaxAge));
    if (filterMinGoals)   players = players.filter((p) => p.goals >= parseInt(filterMinGoals));
    if (filterMinAssists) players = players.filter((p) => p.assists >= parseInt(filterMinAssists));

    players.sort((a, b) => {
      const aVal = (a[sortBy] as number) ?? 0;
      const bVal = (b[sortBy] as number) ?? 0;
      return sortDir === "desc" ? bVal - aVal : aVal - bVal;
    });

    return players;
  }, [pool, filterPos, filterMinAge, filterMaxAge, filterMinGoals, filterMinAssists, sortBy, sortDir]);

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* ── Header del tab ── */}
      <div className="border-b border-bg-card px-6 py-4">
        <h2 className="font-mono text-orange text-xs tracking-widest mb-1">
          TRACK 02 · BUSCADOR DE REFUERZOS
        </h2>
        <p className="text-cream/50 text-sm">
          Cargá un pozo de jugadores en preparación · filtrá y ordená localmente sin gastar cuota
        </p>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Sidebar izquierdo ── */}
        <aside className="w-64 shrink-0 border-r border-bg-card overflow-y-auto flex flex-col">

          {/* Sección: Cargar pozo */}
          <div className="p-4 border-b border-bg-card/60 space-y-3">
            <div className="font-mono text-orange text-[10px] tracking-widest">
              ⚽  CARGAR POZO
            </div>

            <Select label="LIGA" value={leagueId} onChange={setLeagueId}>
              {LEAGUES.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </Select>

            <Select label="TEMPORADA" value={season} onChange={setSeason}>
              {SEASONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>

            <Select label="PÁGINAS (20 jugadores c/u)" value={pages} onChange={setPages}>
              {["1", "2", "3", "4", "5"].map((p) => (
                <option key={p} value={p}>{p} pág. · {parseInt(p) * 20} jugadores · {p} pedidos</option>
              ))}
            </Select>

            <button
              onClick={cargarPozo}
              disabled={loading}
              className="w-full bg-orange text-bg-deep font-mono font-bold text-xs py-2 rounded tracking-widest hover:bg-orange/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading
                ? progress
                  ? `CARGANDO PÁG. ${progress.page}/${progress.total}...`
                  : "CARGANDO..."
                : "▶  CARGAR POZO"}
            </button>

            {loadError && (
              <div className="text-red-400 font-mono text-[10px] bg-red-900/20 rounded p-2 border border-red-900/40">
                {loadError}
              </div>
            )}
          </div>

          {/* Estado del pozo actual */}
          {pool && (
            <div className="p-4 border-b border-bg-card/60 space-y-1">
              <div className="font-mono text-[10px] text-orange/70 tracking-widest">POZO ACTUAL</div>
              <div className="text-cream font-mono text-xs font-bold">{pool.players.length} jugadores</div>
              <div className="text-cream/50 text-xs">{pool.meta.leagueName}</div>
              <div className="text-cream/40 text-xs">Temp. {pool.meta.season}</div>
              <div className="text-cream/30 text-[10px]">{timeAgo(pool.meta.loadedAt)}</div>
              <button
                onClick={borrarPozo}
                className="mt-2 text-[10px] font-mono text-cream/30 hover:text-red-400 transition-colors"
              >
                ✕ borrar pozo
              </button>
            </div>
          )}

          {/* Sección: Filtros locales */}
          {pool && (
            <div className="p-4 space-y-3">
              <div className="font-mono text-orange text-[10px] tracking-widest">
                FILTRAR (local · sin API)
              </div>

              <Select label="POSICIÓN" value={filterPos} onChange={setFilterPos}>
                {POSITIONS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </Select>

              <div className="grid grid-cols-2 gap-2">
                <NumberInput label="EDAD MÍN" value={filterMinAge} onChange={setFilterMinAge} placeholder="ej: 20" />
                <NumberInput label="EDAD MÁX" value={filterMaxAge} onChange={setFilterMaxAge} placeholder="ej: 30" />
              </div>

              <NumberInput label="MÍN. GOLES" value={filterMinGoals} onChange={setFilterMinGoals} placeholder="ej: 5" />
              <NumberInput label="MÍN. ASISTENCIAS" value={filterMinAssists} onChange={setFilterMinAssists} placeholder="ej: 3" />

              <div className="pt-1 space-y-2">
                <div className="font-mono text-[10px] text-orange/70 tracking-widest">ORDENAR POR</div>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as keyof PlayerStat)}
                  className="w-full bg-bg-deep border border-bg-card text-cream text-xs font-mono rounded px-2 py-1.5 focus:outline-none focus:border-orange/50"
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <div className="flex gap-2">
                  {(["desc", "asc"] as const).map((dir) => (
                    <button
                      key={dir}
                      onClick={() => setSortDir(dir)}
                      className={[
                        "flex-1 py-1 text-xs font-mono rounded border transition-colors",
                        sortDir === dir
                          ? "bg-orange/20 border-orange text-orange"
                          : "border-bg-card text-cream/30 hover:text-cream/60",
                      ].join(" ")}
                    >
                      {dir === "desc" ? "↓ MAYOR" : "↑ MENOR"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reset filtros */}
              <button
                onClick={() => {
                  setFilterPos(""); setFilterMinAge(""); setFilterMaxAge("");
                  setFilterMinGoals(""); setFilterMinAssists("");
                }}
                className="text-[10px] font-mono text-cream/30 hover:text-cream/60 transition-colors"
              >
                ✕ limpiar filtros
              </button>
            </div>
          )}
        </aside>

        {/* ── Panel de resultados ── */}
        <main className="flex-1 overflow-auto">
          {!pool && !loading && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
              <div className="text-4xl opacity-20">⚽</div>
              <div className="font-mono text-cream/30 text-sm">Pozo vacío</div>
              <div className="text-cream/20 text-xs max-w-xs">
                Elegí liga, temporada y páginas a cargar. Cada página = 1 pedido a la API.
                Hacé esto en preparación, no en vivo.
              </div>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <div className="font-mono text-orange text-sm animate-pulse">
                {progress
                  ? `Cargando página ${progress.page} de ${progress.total}...`
                  : "Conectando..."}
              </div>
              {progress && progress.page > 1 && (
                <div className="text-cream/30 text-xs font-mono">
                  Esperando rate limit entre páginas (6 seg.)
                </div>
              )}
            </div>
          )}

          {pool && !loading && (
            <>
              {/* Barra de estado */}
              <div className="sticky top-0 bg-bg-deep border-b border-bg-card px-4 py-2 flex items-center gap-4">
                <span className="font-mono text-xs text-orange">
                  {filtered.length}
                  <span className="text-cream/40"> / {pool.players.length} jugadores</span>
                </span>
                {filtered.length !== pool.players.length && (
                  <span className="font-mono text-[10px] text-cream/30">
                    filtros activos · {filterPos ? posLabel(filterPos) : ""}
                    {filterMinGoals ? ` · +${filterMinGoals} gol` : ""}
                    {filterMinAssists ? ` · +${filterMinAssists} asi` : ""}
                    {filterMinAge ? ` · ≥${filterMinAge}a` : ""}
                    {filterMaxAge ? ` · ≤${filterMaxAge}a` : ""}
                  </span>
                )}
              </div>

              {/* Tabla */}
              {filtered.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-cream/30 font-mono text-sm">
                  Ningún jugador cumple los filtros
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="border-b border-bg-card bg-bg-card/30 font-mono text-[10px] text-orange/70 tracking-widest">
                      <tr>
                        <th className="px-4 py-2 text-left">#</th>
                        <th className="px-4 py-2 text-left">JUGADOR</th>
                        <th className="px-4 py-2 text-left">EQUIPO</th>
                        <th className="px-3 py-2 text-center">POS</th>
                        <th className="px-3 py-2 text-center">EDAD</th>
                        <th className="px-3 py-2 text-center">PJ</th>
                        <th className="px-3 py-2 text-center text-warm-white">GOL</th>
                        <th className="px-3 py-2 text-center text-warm-white">ASI</th>
                        <th className="px-3 py-2 text-center">MIN</th>
                        <th className="px-3 py-2 text-center">TA</th>
                        <th className="px-3 py-2 text-center">TR</th>
                        <th className="px-3 py-2 text-center">PASE%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((player, i) => (
                        <tr
                          key={player.id}
                          className="border-b border-bg-card/40 hover:bg-bg-card/30 transition-colors"
                        >
                          <td className="px-4 py-2 font-mono text-cream/30">{i + 1}</td>
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-2">
                              {player.photo && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={player.photo}
                                  alt=""
                                  className="w-6 h-6 rounded-full bg-bg-card opacity-80"
                                />
                              )}
                              <div>
                                <div className="text-cream font-medium">{player.name}</div>
                                <div className="text-cream/30 text-[10px]">{player.nationality}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-2 text-cream/70">{player.team}</td>
                          <td className="px-3 py-2 text-center font-mono text-[10px] text-cream/50">
                            {player.position === "Goalkeeper"  ? "ARQ" :
                             player.position === "Defender"    ? "DEF" :
                             player.position === "Midfielder"  ? "MED" :
                             player.position === "Attacker"    ? "DEL" : "—"}
                          </td>
                          <td className="px-3 py-2 text-center text-cream/70">{player.age}</td>
                          <td className="px-3 py-2 text-center text-cream/50">{player.appearances}</td>
                          <td className="px-3 py-2 text-center font-bold text-warm-white">{player.goals}</td>
                          <td className="px-3 py-2 text-center font-bold text-warm-white">{player.assists}</td>
                          <td className="px-3 py-2 text-center text-cream/50">{player.minutesPlayed}</td>
                          <td className="px-3 py-2 text-center text-yellow-500/70">{player.yellowCards}</td>
                          <td className="px-3 py-2 text-center text-red-500/70">{player.redCards}</td>
                          <td className="px-3 py-2 text-center text-cream/50">
                            {player.passAccuracy != null ? `${player.passAccuracy}%` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
