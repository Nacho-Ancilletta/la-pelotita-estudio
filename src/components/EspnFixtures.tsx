"use client";

import { useEffect, useState } from "react";

// ── Ligas ESPN ────────────────────────────────────────────────

const LEAGUES = [
  { id: "arg.1",                 name: "Liga Profesional",  flag: "ARG" },
  { id: "conmebol.libertadores", name: "Libertadores",      flag: "CON" },
  { id: "conmebol.sudamericana", name: "Sudamericana",      flag: "CON" },
  { id: "bra.1",                 name: "Brasil Série A",    flag: "BRA" },
  { id: "eng.1",                 name: "Premier League",    flag: "ENG" },
  { id: "esp.1",                 name: "La Liga",           flag: "ESP" },
  { id: "ger.1",                 name: "Bundesliga",        flag: "GER" },
  { id: "ita.1",                 name: "Serie A",           flag: "ITA" },
  { id: "fra.1",                 name: "Ligue 1",           flag: "FRA" },
  { id: "uefa.champions",        name: "Champions League",  flag: "UEFA" },
];

// ── Cache ─────────────────────────────────────────────────────

function cacheKey(league: string, date: string) {
  return `pelotita_espn_${league}_${date}`;
}
function cacheGet<T>(key: string): T | null {
  try { return JSON.parse(localStorage.getItem(key) ?? "null") as T; }
  catch { return null; }
}
function cacheSet(key: string, d: unknown) {
  localStorage.setItem(key, JSON.stringify(d));
}

// ── Types ─────────────────────────────────────────────────────

interface EspnTeam { name: string; abbreviation: string; logo: string; }
interface EspnCompetitor { homeAway: "home" | "away"; team: EspnTeam; score: string; }
interface EspnStatus {
  type: { state: "pre" | "in" | "post"; completed: boolean; shortDetail: string; };
  displayClock?: string;
}
interface EspnEvent {
  id: string;
  name: string;
  date: string;
  status: EspnStatus;
  competitions: { competitors: EspnCompetitor[]; venue?: { fullName: string }; }[];
}

// ── Sofascore stats ───────────────────────────────────────────

// Map ESPN event names → Sofascore events roughly by team name match
interface SfsStats {
  possession: [number, number];
  shots: [number, number];
  shotsOnTarget: [number, number];
  corners: [number, number];
  fouls: [number, number];
}

// ── Match row ─────────────────────────────────────────────────

function statusBadge(ev: EspnEvent) {
  const s = ev.status;
  if (s.type.state === "in")
    return <span className="text-green-400 font-bold tabular-nums text-[9px]">{s.displayClock ?? "EN VIVO"}</span>;
  if (s.type.state === "post")
    return <span className="text-cream/30 text-[9px]">FIN</span>;
  const kickoff = new Date(ev.date).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  return <span className="text-cream/40 text-[9px]">{kickoff}</span>;
}

function MatchRow({ ev, onClick, expanded, sfsStats, sfsLoading }:
  { ev: EspnEvent; onClick: () => void; expanded: boolean; sfsStats: SfsStats | null; sfsLoading: boolean }) {
  const comp = ev.competitions[0];
  const home = comp?.competitors.find(c => c.homeAway === "home");
  const away = comp?.competitors.find(c => c.homeAway === "away");
  if (!home || !away) return null;
  const isLive = ev.status.type.state === "in";
  const isDone = ev.status.type.state === "post";

  return (
    <div className={["border-b border-bg-deep/60 last:border-0 transition-colors", expanded ? "bg-bg-card/20" : ""].join(" ")}>
      <button onClick={onClick} className="w-full px-3 py-2 text-left hover:bg-bg-card/20 transition-colors">
        <div className="flex items-center gap-1.5">
          {/* Home */}
          <div className="flex items-center gap-1 flex-1 justify-end min-w-0">
            <span className={["font-mono text-[10px] truncate", isLive || isDone ? "text-cream" : "text-cream/60"].join(" ")}>
              {home.team.abbreviation}
            </span>
            {home.team.logo && <img src={home.team.logo} alt="" className="w-4 h-4 object-contain shrink-0" />}
          </div>
          {/* Score / time */}
          <div className="w-14 text-center shrink-0">
            {isDone || isLive
              ? <span className={["font-mono font-bold text-[11px] tabular-nums", isLive ? "text-green-400" : "text-cream"].join(" ")}>
                  {home.score} – {away.score}
                </span>
              : <span className="font-mono text-[10px] text-cream/30">vs</span>
            }
          </div>
          {/* Away */}
          <div className="flex items-center gap-1 flex-1 min-w-0">
            {away.team.logo && <img src={away.team.logo} alt="" className="w-4 h-4 object-contain shrink-0" />}
            <span className={["font-mono text-[10px] truncate", isLive || isDone ? "text-cream" : "text-cream/60"].join(" ")}>
              {away.team.abbreviation}
            </span>
          </div>
          {/* Status */}
          <div className="w-12 text-right shrink-0">{statusBadge(ev)}</div>
        </div>
      </button>

      {/* Expanded: Sofascore stats */}
      {expanded && (
        <div className="px-3 pb-2">
          {sfsLoading && <div className="text-cream/25 font-mono text-[9px] py-1">buscando stats...</div>}
          {!sfsLoading && !sfsStats && (isDone || isLive) &&
            <div className="text-cream/20 font-mono text-[9px] py-1">sin stats disponibles</div>}
          {sfsStats && (
            <div className="space-y-0.5">
              {([
                ["POSESIÓN", sfsStats.possession, true, (v: number) => `${v}%`],
                ["REMATES",  sfsStats.shots,      true],
                ["AL ARCO",  sfsStats.shotsOnTarget, true],
                ["CÓRNERS",  sfsStats.corners,    true],
                ["FALTAS",   sfsStats.fouls,      false],
              ] as const).map(([label, [a, b], hiB, fmt]) => {
                const max  = Math.max(a, b, 1);
                const aW   = hiB ? a > b : a < b;
                const bW   = hiB ? b > a : b < a;
                const fmtV = fmt ? (fmt as (v: number) => string) : String;
                return (
                  <div key={label} className="grid grid-cols-[1fr_60px_1fr] items-center py-0.5 text-[9px]">
                    <div className="flex items-center justify-end gap-1 pr-1">
                      <span className={`font-mono font-bold tabular-nums ${aW ? "text-orange" : "text-cream/30"}`}>{fmtV(a)}</span>
                      <div className="w-10 h-0.5 bg-bg-deep rounded-full overflow-hidden flex justify-end">
                        <div className={`h-full ${aW ? "bg-orange" : "bg-bg-card"}`} style={{ width: `${(a/max)*100}%` }} />
                      </div>
                    </div>
                    <div className="font-mono text-cream/20 tracking-wider text-center text-[8px]">{label}</div>
                    <div className="flex items-center gap-1 pl-1">
                      <div className="w-10 h-0.5 bg-bg-deep rounded-full overflow-hidden">
                        <div className={`h-full ${bW ? "bg-cream/50" : "bg-bg-card"}`} style={{ width: `${(b/max)*100}%` }} />
                      </div>
                      <span className={`font-mono font-bold tabular-nums ${bW ? "text-cream" : "text-cream/30"}`}>{fmtV(b)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {comp?.venue?.fullName &&
            <div className="text-cream/15 font-mono text-[8px] mt-1">{comp.venue.fullName}</div>}
        </div>
      )}
    </div>
  );
}

// ── Sofascore stats fetcher ───────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseSfsStats(data: any): SfsStats | null {
  try {
    const groups = data?.statistics?.[0]?.groups ?? [];
    function stat(name: string): [number, number] {
      for (const g of groups) {
        for (const item of g.statisticsItems ?? []) {
          if (item.name?.toLowerCase().includes(name.toLowerCase()))
            return [parseFloat(item.home ?? "0"), parseFloat(item.away ?? "0")];
        }
      }
      return [0, 0];
    }
    return {
      possession:    stat("ball possession"),
      shots:         stat("total shots"),
      shotsOnTarget: stat("shots on target"),
      corners:       stat("corner kicks"),
      fouls:         stat("fouls"),
    };
  } catch { return null; }
}

// ── Main component ────────────────────────────────────────────

export default function EspnFixtures() {
  const [leagueId,    setLeagueId]    = useState("arg.1");
  const [date,        setDate]        = useState(() => new Date().toISOString().slice(0, 10));
  const [events,      setEvents]      = useState<EspnEvent[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [expandedId,  setExpandedId]  = useState<string | null>(null);
  const [sfsStats,    setSfsStats]    = useState<Record<string, SfsStats | null>>({});
  const [sfsLoading,  setSfsLoading]  = useState<string | null>(null);
  const [sfsCache,    setSfsCache]    = useState<Record<string, string>>({});

  // Auto-fetch when league/date changes
  useEffect(() => {
    fetchFixtures();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, date]);

  async function fetchFixtures() {
    setError(null); setExpandedId(null);
    const key = cacheKey(leagueId, date);
    const cached = cacheGet<EspnEvent[]>(key);
    if (cached) { setEvents(cached); return; }

    setLoading(true);
    try {
      const res  = await fetch(`/api/espn?league=${leagueId}&endpoint=scoreboard&dates=${date.replace(/-/g, "")}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const evs: EspnEvent[] = data.events ?? [];
      setEvents(evs);
      cacheSet(key, evs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error ESPN");
    } finally {
      setLoading(false);
    }
  }

  async function fetchSfsStats(ev: EspnEvent) {
    if (ev.status.type.state === "pre") return;
    const evId = ev.id;
    if (sfsStats[evId] !== undefined) return; // already fetched

    // Try to find Sofascore event matching by team name + date
    const dateStr = date;
    const sfsCacheKey = `pelotita_sfs_events_${dateStr}`;
    let sfsDay = cacheGet<unknown[]>(sfsCacheKey);

    setSfsLoading(evId);
    try {
      if (!sfsDay) {
        const res = await fetch(`/api/sofascore?path=sport/football/events/date/${dateStr}`);
        const data = await res.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sfsDay = data?.events ?? [];
        cacheSet(sfsCacheKey, sfsDay);
      }

      // Match by team names (fuzzy: check if ESPN team name appears in SFS names)
      const comp = ev.competitions[0];
      const home = comp?.competitors.find(c => c.homeAway === "home")?.team.name?.toLowerCase() ?? "";
      const away = comp?.competitors.find(c => c.homeAway === "away")?.team.name?.toLowerCase() ?? "";

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const match = (sfsDay as any[]).find((e: any) => {
        const hn = (e.homeTeam?.name ?? "").toLowerCase();
        const an = (e.awayTeam?.name ?? "").toLowerCase();
        return (hn.includes(home.split(" ")[0]) || home.includes(hn.split(" ")[0])) &&
               (an.includes(away.split(" ")[0]) || away.includes(an.split(" ")[0]));
      });

      if (!match) { setSfsStats(p => ({ ...p, [evId]: null })); return; }

      setSfsCache(p => ({ ...p, [evId]: String(match.id) }));
      const statsRes  = await fetch(`/api/sofascore?path=event/${match.id}/statistics`);
      const statsData = await statsRes.json();
      setSfsStats(p => ({ ...p, [evId]: parseSfsStats(statsData) }));
    } catch {
      setSfsStats(p => ({ ...p, [evId]: null }));
    } finally {
      setSfsLoading(null);
    }
  }

  function toggleEvent(ev: EspnEvent) {
    if (expandedId === ev.id) { setExpandedId(null); return; }
    setExpandedId(ev.id);
    fetchSfsStats(ev);
  }

  function shiftDate(days: number) {
    const d = new Date(date + "T12:00:00");
    d.setDate(d.getDate() + days);
    setDate(d.toISOString().slice(0, 10));
  }

  const league = LEAGUES.find(l => l.id === leagueId);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-bg-card/60">
        <div className="font-mono text-[10px] text-orange tracking-widest flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
          FIXTURE · ESPN
        </div>
      </div>

      {/* Controls */}
      <div className="px-3 py-2 border-b border-bg-card/40 space-y-1.5">
        <select value={leagueId} onChange={e => setLeagueId(e.target.value)}
          className="w-full bg-bg-deep border border-bg-card text-cream text-[10px] font-mono rounded px-1.5 py-1 focus:outline-none focus:border-orange/50">
          {LEAGUES.map(l => <option key={l.id} value={l.id}>[{l.flag}] {l.name}</option>)}
        </select>
        <div className="flex items-center gap-1">
          <button onClick={() => shiftDate(-1)}
            className="w-7 h-6 font-mono text-[10px] text-cream/40 hover:text-cream border border-bg-card rounded transition-colors">‹</button>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="flex-1 bg-bg-deep border border-bg-card text-cream text-[10px] font-mono rounded px-1.5 py-1 focus:outline-none focus:border-orange/50" />
          <button onClick={() => shiftDate(1)}
            className="w-7 h-6 font-mono text-[10px] text-cream/40 hover:text-cream border border-bg-card rounded transition-colors">›</button>
          <button onClick={fetchFixtures}
            className="w-7 h-6 font-mono text-[10px] text-cream/30 hover:text-orange border border-bg-card rounded transition-colors">↺</button>
        </div>
      </div>

      {/* Match list */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center h-20">
            <span className="font-mono text-[10px] text-cream/25 animate-pulse">cargando ESPN...</span>
          </div>
        )}
        {error && (
          <div className="px-3 py-2 text-red-400/70 font-mono text-[10px]">{error}</div>
        )}
        {!loading && !error && events.length === 0 && (
          <div className="flex items-center justify-center h-20">
            <span className="font-mono text-[10px] text-cream/15">sin partidos · {league?.name}</span>
          </div>
        )}
        {events.map(ev => (
          <MatchRow
            key={ev.id}
            ev={ev}
            onClick={() => toggleEvent(ev)}
            expanded={expandedId === ev.id}
            sfsStats={sfsStats[ev.id] ?? null}
            sfsLoading={sfsLoading === ev.id}
          />
        ))}
      </div>

      {/* Footer */}
      {events.length > 0 && (
        <div className="px-3 py-1 border-t border-bg-card/40 font-mono text-[8px] text-cream/15 flex justify-between">
          <span>{events.length} partidos · ESPN</span>
          <span>click partido → stats Sofascore</span>
        </div>
      )}
    </div>
  );
}
