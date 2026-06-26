"use client";

import { useEffect, useState } from "react";
import { updateQuota } from "@/components/ApiQuotaCounter";

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

interface TeamEntry {
  id: number;
  name: string;
  logo: string;
}

interface TeamStats {
  team: TeamEntry;
  formation: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  avgFor: number;
  avgAgainst: number;
  cleanSheets: number;
  failedToScore: number;
  homeWins: number;
  awayWins: number;
}

// ── Cache ──────────────────────────────────────────────────────

function cacheGet<T>(key: string): T | null {
  try { return JSON.parse(localStorage.getItem(key) ?? "null") as T; }
  catch { return null; }
}
function cacheSet(key: string, d: unknown) {
  localStorage.setItem(key, JSON.stringify(d));
}

// ── API parsers ───────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseTeams(data: any): TeamEntry[] {
  return (data?.response?.[0]?.league?.standings?.[0] ?? []).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (e: any) => ({ id: e.team.id, name: e.team.name, logo: e.team.logo })
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseStats(data: any): TeamStats {
  const r = data?.response;
  if (!r) throw new Error("Respuesta vacía de la API");
  const lineups: { formation: string; played: number }[] = r.lineups ?? [];
  const topF = [...lineups].sort((a, b) => b.played - a.played)[0]?.formation ?? "—";
  return {
    team: { id: r.team.id, name: r.team.name, logo: r.team.logo },
    formation: topF,
    played:        r.fixtures.played.total ?? 0,
    wins:          r.fixtures.wins.total   ?? 0,
    draws:         r.fixtures.draws.total  ?? 0,
    losses:        r.fixtures.loses.total  ?? 0,
    goalsFor:      r.goals.for.total.total    ?? 0,
    goalsAgainst:  r.goals.against.total.total ?? 0,
    goalDiff:     (r.goals.for.total.total ?? 0) - (r.goals.against.total.total ?? 0),
    avgFor:        parseFloat(r.goals.for.average.total    ?? "0"),
    avgAgainst:    parseFloat(r.goals.against.average.total ?? "0"),
    cleanSheets:   r.clean_sheet?.total   ?? 0,
    failedToScore: r.failed_to_score?.total ?? 0,
    homeWins:      r.fixtures.wins.home ?? 0,
    awayWins:      r.fixtures.wins.away ?? 0,
  };
}

// ── Stat row UI ───────────────────────────────────────────────

function StatRow({
  label,
  a,
  b,
  higherIsBetter = true,
  fmt,
}: {
  label: string;
  a: number;
  b: number;
  higherIsBetter?: boolean;
  fmt?: (v: number) => string;
}) {
  const max = Math.max(Math.abs(a), Math.abs(b), 1);
  const pctA = Math.abs(a) / max;
  const pctB = Math.abs(b) / max;
  const aWins = higherIsBetter ? a > b : a < b;
  const bWins = higherIsBetter ? b > a : b < a;
  const da = fmt ? fmt(a) : String(a);
  const db = fmt ? fmt(b) : String(b);

  return (
    <div className="grid grid-cols-[1fr_140px_1fr] items-center py-1.5 border-b border-bg-card/40">
      <div className="flex items-center justify-end gap-2 pr-2">
        <span className={`font-mono text-sm font-bold tabular-nums ${aWins ? "text-warm-white" : "text-cream/50"}`}>{da}</span>
        <div className="w-20 h-1.5 bg-bg-deep rounded-full overflow-hidden flex justify-end">
          <div className={`h-full rounded-full ${aWins ? "bg-orange" : "bg-bg-card"}`} style={{ width: `${pctA * 100}%` }} />
        </div>
      </div>
      <div className="font-mono text-[10px] text-cream/35 tracking-wider text-center">{label}</div>
      <div className="flex items-center gap-2 pl-2">
        <div className="w-20 h-1.5 bg-bg-deep rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${bWins ? "bg-cream/70" : "bg-bg-card"}`} style={{ width: `${pctB * 100}%` }} />
        </div>
        <span className={`font-mono text-sm font-bold tabular-nums ${bWins ? "text-warm-white" : "text-cream/50"}`}>{db}</span>
      </div>
    </div>
  );
}

function TextRow({ label, a, b }: { label: string; a: string; b: string }) {
  return (
    <div className="grid grid-cols-[1fr_140px_1fr] items-center py-1.5 border-b border-bg-card/40">
      <div className="text-right pr-2 font-mono text-sm text-orange font-bold">{a}</div>
      <div className="font-mono text-[10px] text-cream/35 tracking-wider text-center">{label}</div>
      <div className="text-left pl-2 font-mono text-sm text-cream font-bold">{b}</div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────

export default function ComparadorEquipos() {
  const [leagueId, setLeagueId] = useState("128");
  const [season,   setSeason]   = useState("2024");
  const [teams,    setTeams]    = useState<TeamEntry[]>([]);
  const [teamAId,  setTeamAId]  = useState("");
  const [teamBId,  setTeamBId]  = useState("");
  const [statsA,   setStatsA]   = useState<TeamStats | null>(null);
  const [statsB,   setStatsB]   = useState<TeamStats | null>(null);
  const [loading,  setLoading]  = useState<"teams" | "stats" | null>(null);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    setTeamAId("");
    setTeamBId("");
    setStatsA(null);
    setStatsB(null);
    setError(null);
    const cached = cacheGet<TeamEntry[]>(`pelotita_standings_${leagueId}_${season}`);
    setTeams(cached && cached.length > 0 ? cached : []);
  }, [leagueId, season]);

  async function cargarEquipos() {
    setError(null);
    const key = `pelotita_standings_${leagueId}_${season}`;
    const cached = cacheGet<TeamEntry[]>(key);
    if (cached && cached.length > 0) {
      setTeams(cached);
      return;
    }
    setLoading("teams");
    try {
      const res  = await fetch(`/api/football?endpoint=standings&league=${leagueId}&season=${season}`);
      const json = await res.json();
      if (json.quotaRemaining !== null) updateQuota(json.quotaRemaining);
      if (json.data?.errors && Object.keys(json.data.errors).length) throw new Error(Object.values(json.data.errors).join(", "));
      const list = parseTeams(json.data);
      if (!list.length) throw new Error("Sin datos para esa liga/temporada");
      cacheSet(key, list);
      setTeams(list);
      setStatsA(null); setStatsB(null);
      setTeamAId(""); setTeamBId("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error cargando equipos");
    } finally {
      setLoading(null);
    }
  }

  async function fetchOne(teamId: string): Promise<TeamStats> {
    const key = `pelotita_teamstats_${teamId}_${leagueId}_${season}`;
    const cached = cacheGet<TeamStats>(key);
    if (cached) return cached;
    const res  = await fetch(`/api/football?endpoint=teams/statistics&league=${leagueId}&season=${season}&team=${teamId}`);
    const json = await res.json();
    if (json.quotaRemaining !== null) updateQuota(json.quotaRemaining);
    if (json.data?.errors && Object.keys(json.data.errors).length) throw new Error(Object.values(json.data.errors).join(", "));
    const stats = parseStats(json.data);
    cacheSet(key, stats);
    return stats;
  }

  async function comparar() {
    if (!teamAId || !teamBId) return;
    setError(null);
    setLoading("stats");
    try {
      const [a, b] = await Promise.all([fetchOne(teamAId), fetchOne(teamBId)]);
      setStatsA(a); setStatsB(b);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error cargando stats");
    } finally {
      setLoading(null);
    }
  }

  const hasTeams = teams.length > 0;
  const hasStats = statsA !== null && statsB !== null;

  return (
    <div className="p-5 overflow-y-auto space-y-4">
      <div className="border-b border-bg-card pb-3">
        <h3 className="font-mono text-orange text-xs tracking-widest mb-1">B] COMPARADOR DE EQUIPOS</h3>
        <p className="text-cream/40 text-xs">Cargá los equipos de una liga (1 pedido) · comparalos (2 pedidos) · queda en caché</p>
      </div>

      {/* Paso 1 */}
      <div className="flex items-end gap-3 flex-wrap">
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] text-orange/70 tracking-widest">LIGA</span>
          <select value={leagueId} onChange={e => setLeagueId(e.target.value)}
            className="bg-bg-deep border border-bg-card text-cream text-xs font-mono rounded px-2 py-1.5 focus:outline-none focus:border-orange/50">
            {LEAGUES.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] text-orange/70 tracking-widest">TEMPORADA</span>
          <select value={season} onChange={e => setSeason(e.target.value)}
            className="bg-bg-deep border border-bg-card text-cream text-xs font-mono rounded px-2 py-1.5 focus:outline-none focus:border-orange/50">
            {SEASONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <button onClick={cargarEquipos} disabled={loading === "teams"}
          className="px-4 py-1.5 border border-orange text-orange font-mono text-xs rounded tracking-wider hover:bg-orange/20 transition-colors disabled:opacity-40">
          {loading === "teams" ? "CARGANDO..." : "⚽  CARGAR EQUIPOS · 1 PEDIDO"}
        </button>
        {hasTeams && <span className="font-mono text-[10px] text-cream/30">{teams.length} equipos · caché</span>}
      </div>

      {/* Paso 2 */}
      {hasTeams && (
        <div className="flex items-end gap-3 flex-wrap">
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] text-orange tracking-widest">LOCAL (A)</span>
            <select value={teamAId} onChange={e => setTeamAId(e.target.value)}
              className="bg-bg-deep border border-orange/40 text-cream text-xs font-mono rounded px-2 py-1.5 focus:outline-none focus:border-orange min-w-[200px]">
              <option value="">— elegir equipo —</option>
              {teams.map(t => {
                const cached = !!cacheGet(`pelotita_teamstats_${t.id}_${leagueId}_${season}`);
                return <option key={t.id} value={String(t.id)}>{cached ? "✓ " : ""}{t.name}</option>;
              })}
            </select>
          </label>
          <span className="font-mono text-cream/20 text-sm pb-1">VS</span>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] text-cream/50 tracking-widest">VISITANTE (B)</span>
            <select value={teamBId} onChange={e => setTeamBId(e.target.value)}
              className="bg-bg-deep border border-cream/20 text-cream text-xs font-mono rounded px-2 py-1.5 focus:outline-none focus:border-cream/50 min-w-[200px]">
              <option value="">— elegir equipo —</option>
              {teams.map(t => {
                const cached = !!cacheGet(`pelotita_teamstats_${t.id}_${leagueId}_${season}`);
                return <option key={t.id} value={String(t.id)}>{cached ? "✓ " : ""}{t.name}</option>;
              })}
            </select>
          </label>
          <button onClick={comparar} disabled={!teamAId || !teamBId || loading === "stats"}
            className="px-4 py-1.5 bg-orange text-bg-deep font-mono font-bold text-xs rounded tracking-wider hover:bg-orange/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            {loading === "stats"
              ? "CARGANDO..."
              : (cacheGet(`pelotita_teamstats_${teamAId}_${leagueId}_${season}`) && cacheGet(`pelotita_teamstats_${teamBId}_${leagueId}_${season}`))
                ? "▶  COMPARAR · CACHÉ"
                : "▶  COMPARAR · 2 PEDIDOS"}
          </button>
        </div>
      )}

      {error && (
        <div className="text-red-400 font-mono text-xs bg-red-900/20 rounded p-2 border border-red-900/40">{error}</div>
      )}

      {/* Tabla de stats */}
      {hasStats && statsA && statsB && (
        <div className="bg-bg-card rounded-lg p-5 border border-bg-card/60">
          {/* Headers */}
          <div className="grid grid-cols-[1fr_140px_1fr] gap-2 mb-3 pb-3 border-b border-bg-card/60">
            <div className="flex items-center justify-end gap-3">
              {statsA.team.logo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={statsA.team.logo} alt="" className="w-7 h-7 object-contain" />
              )}
              <span className="font-mono font-bold text-orange text-sm text-right">{statsA.team.name}</span>
            </div>
            <div className="font-mono text-cream/20 text-xs text-center self-center">VS</div>
            <div className="flex items-center gap-3">
              <span className="font-mono font-bold text-cream text-sm">{statsB.team.name}</span>
              {statsB.team.logo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={statsB.team.logo} alt="" className="w-7 h-7 object-contain" />
              )}
            </div>
          </div>

          {/* Stats */}
          <TextRow label="FORMACIÓN"       a={statsA.formation}                          b={statsB.formation} />
          <StatRow label="PJ"              a={statsA.played}    b={statsB.played} />
          <StatRow label="VICTORIAS"       a={statsA.wins}      b={statsB.wins} />
          <StatRow label="EMPATES"         a={statsA.draws}     b={statsB.draws} />
          <StatRow label="DERROTAS"        a={statsA.losses}    b={statsB.losses}     higherIsBetter={false} />
          <StatRow label="GOLES A FAVOR"   a={statsA.goalsFor}  b={statsB.goalsFor} />
          <StatRow label="GOLES EN CONTRA" a={statsA.goalsAgainst} b={statsB.goalsAgainst} higherIsBetter={false} />
          <StatRow label="DIF. GOLES"      a={statsA.goalDiff}  b={statsB.goalDiff}
            fmt={v => v > 0 ? `+${v}` : String(v)} />
          <StatRow label="PROM. GOL/PJ"    a={statsA.avgFor}    b={statsB.avgFor} />
          <StatRow label="PROM. EN CONTRA" a={statsA.avgAgainst} b={statsB.avgAgainst} higherIsBetter={false} />
          <StatRow label="ARCO EN 0"       a={statsA.cleanSheets} b={statsB.cleanSheets} />
          <StatRow label="NO CONVIRTIÓ"    a={statsA.failedToScore} b={statsB.failedToScore} higherIsBetter={false} />
          <StatRow label="VICTORIAS LOCAL" a={statsA.homeWins}  b={statsB.homeWins} />
          <StatRow label="VICTORIAS VISITA" a={statsA.awayWins} b={statsB.awayWins} />
        </div>
      )}
    </div>
  );
}
