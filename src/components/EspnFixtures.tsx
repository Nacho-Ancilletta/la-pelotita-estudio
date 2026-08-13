"use client";

import { useEffect, useState } from "react";
import { getMatchDetails, getHeadToHead, summarizeH2H, type H2HMatch, type H2HSummary, type MatchStats, type GoalEvent } from "@/lib/espn";

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
  { id: "fifa.world",            name: "Mundial",                     flag: "FIFA" },
  { id: "fifa.worldq.conmebol",  name: "Eliminatorias Sudamericanas", flag: "CON" },
  { id: "fifa.worldq.uefa",      name: "Eliminatorias Europeas",      flag: "UEFA" },
  { id: "conmebol.america",      name: "Copa América",                flag: "CON" },
  { id: "uefa.euro",             name: "Eurocopa",                    flag: "UEFA" },
];

// ── Cache ─────────────────────────────────────────────────────

function cacheKey(league: string, date: string) {
  return `pelotita_espn_${league}_${date}`;
}
// ttlMs opcional: si se pasa al guardar, cacheGet lo respeta al leer.
// Entradas viejas sin wrapper {data,ts,ttlMs} (fixtures del día) siguen
// leyéndose igual, sin expiración — mismo patrón que TacticoTab.tsx.
function cacheGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "data" in parsed && "ts" in parsed) {
      const { data, ts, ttlMs } = parsed as { data: T; ts: number; ttlMs?: number };
      if (ttlMs != null && Date.now() - ts > ttlMs) return null;
      return data;
    }
    return parsed as T;
  } catch { return null; }
}
function cacheSet(key: string, d: unknown, ttlMs?: number) {
  localStorage.setItem(key, JSON.stringify({ data: d, ts: Date.now(), ttlMs }));
}
const H2H_TTL_MS = 7 * 24 * 60 * 60 * 1000; // cruces históricos casi no cambian entre grabaciones

// ── Types ─────────────────────────────────────────────────────

interface EspnTeam { id: string; name: string; abbreviation: string; logo: string; }
interface EspnCompetitor { homeAway: "home" | "away"; team: EspnTeam; score: string; }
interface EspnStatus {
  type: { state: "pre" | "in" | "post"; completed: boolean; shortDetail: string; };
  displayClock?: string;
}
interface EspnBroadcast { names?: string[]; }
interface EspnOfficial { displayName?: string; }
interface EspnCompetition {
  competitors: EspnCompetitor[];
  venue?: { fullName: string };
  broadcasts?: EspnBroadcast[];
  officials?: EspnOfficial[];
}
interface EspnEvent {
  id: string;
  name: string;
  date: string;
  status: EspnStatus;
  competitions: EspnCompetition[];
}

function h2hDate(ts: number) {
  return new Date(ts * 1000).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

// ── Tarjeta de partido ──────────────────────────────────────────

function MatchCard({ ev, leagueName, onClick, expanded, matchStats, statsLoading, goals, h2h, h2hSummary, h2hCardLoading }:
  { ev: EspnEvent; leagueName?: string; onClick: () => void; expanded: boolean; matchStats: MatchStats | null; statsLoading: boolean;
    goals: GoalEvent[] | null; h2h: H2HMatch[] | null; h2hSummary: H2HSummary | null; h2hCardLoading: boolean }) {
  const comp = ev.competitions[0];
  const home = comp?.competitors.find(c => c.homeAway === "home");
  const away = comp?.competitors.find(c => c.homeAway === "away");
  if (!home || !away) return null;
  const isLive = ev.status.type.state === "in";
  const isDone = ev.status.type.state === "post";
  const hasScore = isLive || isDone;

  const dateStr = new Date(ev.date).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
  const timeStr = new Date(ev.date).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  const broadcast = comp?.broadcasts?.find(b => b.names?.length)?.names?.[0];
  const referee = comp?.officials?.find(o => o.displayName)?.displayName;
  const hasExtra = !!(comp?.venue?.fullName || broadcast || referee);

  return (
    <div className={["rounded-lg border bg-bg-card/10 overflow-hidden transition-colors",
      isLive ? "border-orange" : "border-bg-card hover:border-orange/40"].join(" ")}>
      <button onClick={onClick} className="w-full p-4 text-left">
        {/* Liga + estado */}
        <div className="flex items-center justify-between mb-3">
          <span className="font-mono text-[9px] text-cream/30 tracking-widest truncate">{leagueName}</span>
          {isLive ? (
            <span className="flex items-center gap-1 font-mono text-[10px] text-green-400 font-bold shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
              {ev.status.displayClock ?? "EN VIVO"}
            </span>
          ) : isDone ? (
            <span className="font-mono text-[10px] text-cream/30 shrink-0">FINALIZADO</span>
          ) : (
            <span className="font-mono text-[10px] text-orange/70 shrink-0">{dateStr} · {timeStr}</span>
          )}
        </div>

        {/* Equipos + marcador */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
            {home.team.logo && <img src={home.team.logo} alt="" className="w-11 h-11 object-contain" />}
            <span className="font-mono text-xs text-cream text-center leading-tight">{home.team.name}</span>
          </div>
          <div className="shrink-0 px-2 min-w-[70px] text-center">
            {hasScore
              ? <span className={["font-mono text-2xl font-bold tabular-nums", isLive ? "text-orange" : "text-warm-white"].join(" ")}>
                  {home.score}-{away.score}
                </span>
              : <span className="font-mono text-sm text-cream/25 tracking-widest">VS</span>}
          </div>
          <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
            {away.team.logo && <img src={away.team.logo} alt="" className="w-11 h-11 object-contain" />}
            <span className="font-mono text-xs text-cream text-center leading-tight">{away.team.name}</span>
          </div>
        </div>

        {/* Datos secundarios */}
        {hasExtra && (
          <div className="mt-3 pt-2 border-t border-bg-card/40 flex flex-wrap justify-center gap-x-3 gap-y-0.5 font-mono text-[9px] text-cream/25">
            {comp?.venue?.fullName && <span>{comp.venue.fullName}</span>}
            {broadcast && <span>{broadcast}</span>}
            {referee && <span>árb. {referee}</span>}
          </div>
        )}
      </button>

      {/* Expandido: stats en vivo/post + H2H */}
      {expanded && (
        <div className="px-4 pb-4">
          {!statsLoading && goals && goals.length > 0 && (
            <div className="mb-2 pb-2 border-b border-bg-deep/60 space-y-0.5">
              <div className="font-mono text-[8px] text-orange/60 tracking-widest mb-1">GOLES</div>
              {goals.map(g => {
                const isHome = String(g.teamId) === String(home.team.id);
                const label = `${g.scorer}${g.ownGoal ? " (en contra)" : ""}${g.penalty ? " (pen)" : ""}`;
                return (
                  <div key={g.id} className="grid grid-cols-[1fr_34px_1fr] items-center text-[9px] font-mono">
                    <div className={isHome ? "text-right text-cream/70 truncate" : "text-right text-cream/20"}>
                      {isHome ? label : ""}
                    </div>
                    <div className="text-center text-orange/70 tabular-nums">⚽ {g.minute}</div>
                    <div className={!isHome ? "text-left text-cream/70 truncate" : "text-left text-cream/20"}>
                      {!isHome ? label : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {statsLoading && <div className="text-cream/25 font-mono text-[9px] py-1">buscando datos...</div>}
          {!statsLoading && !matchStats && hasScore &&
            <div className="text-cream/20 font-mono text-[9px] py-1">sin stats disponibles</div>}
          {matchStats && (
            <div className="space-y-0.5 mb-2">
              {([
                ["POSESIÓN", matchStats.possession, true, (v: number) => `${v}%`],
                ["REMATES",  matchStats.shots,      true],
                ["AL ARCO",  matchStats.shotsOnTarget, true],
                ["CÓRNERS",  matchStats.corners,    true],
                ["FALTAS",   matchStats.fouls,      false],
              ] as const).map(([label, [a, b], hiB, fmt]) => {
                const max  = Math.max(a, b, 1);
                const aW   = hiB ? a > b : a < b;
                const bW   = hiB ? b > a : b < a;
                const fmtV = fmt ? (fmt as (v: number) => string) : String;
                return (
                  <div key={label} className="grid grid-cols-[1fr_60px_1fr] items-center py-0.5 text-[9px]">
                    <div className="flex items-center justify-end gap-1 pr-1">
                      <span className={`font-mono font-bold tabular-nums ${aW ? "text-orange" : "text-cream/30"}`}>{fmtV(a)}</span>
                      <div className="w-10 h-0.5 bg-bg-deep overflow-hidden flex justify-end">
                        <div className={`h-full ${aW ? "bg-orange" : "bg-bg-card"}`} style={{ width: `${(a/max)*100}%` }} />
                      </div>
                    </div>
                    <div className="font-mono text-cream/20 tracking-wider text-center text-[8px]">{label}</div>
                    <div className="flex items-center gap-1 pl-1">
                      <div className="w-10 h-0.5 bg-bg-deep overflow-hidden">
                        <div className={`h-full ${bW ? "bg-cream/50" : "bg-bg-card"}`} style={{ width: `${(b/max)*100}%` }} />
                      </div>
                      <span className={`font-mono font-bold tabular-nums ${bW ? "text-cream" : "text-cream/30"}`}>{fmtV(b)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="pt-2 border-t border-bg-deep/60">
            <div className="font-mono text-[8px] text-orange/60 tracking-widest mb-1">ÚLTIMOS 5 CRUCES</div>
            {h2hCardLoading && <div className="text-cream/25 font-mono text-[9px] py-1">buscando historial...</div>}
            {!h2hCardLoading && h2hSummary && h2h && h2h.length > 0 && (
              <div className="text-center font-mono text-[9px] text-cream/30 pb-1.5">
                {home.team.name} {h2hSummary.homeWins}V · {h2hSummary.draws}E · {h2hSummary.awayWins}V {away.team.name}
              </div>
            )}
            {!h2hCardLoading && (!h2h || h2h.length === 0) && <div className="text-cream/20 font-mono text-[9px] py-1">sin cruces en el historial</div>}
            {!h2hCardLoading && h2h && h2h.length > 0 && (
              <div className="space-y-1">
                {h2h.slice(0, 5).map(m => (
                  <div key={m.id} className="font-mono text-[9px] text-cream/40">
                    <div className="flex items-center gap-1.5">
                      <span className="text-cream/20 w-11 shrink-0">{h2hDate(m.timestamp)}</span>
                      <span className="truncate flex-1 text-right">{m.homeTeam}</span>
                      <span className="text-cream font-bold tabular-nums shrink-0">{m.homeScore}-{m.awayScore}</span>
                      <span className="truncate flex-1">{m.awayTeam}</span>
                    </div>
                    {m.tournament && (
                      <div className="text-cream/15 text-[8px] pl-[52px] truncate">{m.tournament}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────

export default function EspnFixtures() {
  const [leagueId,    setLeagueId]    = useState("arg.1");
  const [date,        setDate]        = useState(() => new Date().toISOString().slice(0, 10));
  const [events,      setEvents]      = useState<EspnEvent[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [expandedId,  setExpandedId]  = useState<string | null>(null);
  const [matchStats,  setMatchStats]  = useState<Record<string, MatchStats | null>>({});
  const [goals,       setGoals]       = useState<Record<string, GoalEvent[] | null>>({});
  const [statsLoading, setStatsLoading] = useState<string | null>(null);
  const [h2h,         setH2h]         = useState<Record<string, H2HMatch[] | null>>({});
  const [h2hSummary,  setH2hSummary]  = useState<Record<string, H2HSummary | null>>({});
  const [h2hCardLoading, setH2hCardLoading] = useState<Record<string, boolean>>({});

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

  // Stats + goleadores — solo al expandir la tarjeta (no en todas apenas
  // cargan: el summary de ESPN pesa harto y no vale la pena bajarlo de
  // entrada para cada partido del día). getMatchDetails ya cachea 90s en
  // localStorage.
  async function fetchDetails(ev: EspnEvent) {
    const evId = ev.id;
    if (matchStats[evId] !== undefined) return; // ya lo tenemos
    setStatsLoading(evId);
    try {
      const details = await getMatchDetails(leagueId, evId);
      setMatchStats(p => ({ ...p, [evId]: details.stats }));
      setGoals(p => ({ ...p, [evId]: details.goals }));
    } catch {
      setMatchStats(p => ({ ...p, [evId]: null }));
      setGoals(p => ({ ...p, [evId]: null }));
    } finally {
      setStatsLoading(null);
    }
  }

  // H2H reconstruido desde el calendario histórico (mismo getHeadToHead
  // y misma cache de 7 días que usa TacticoTab) — más confiable que el
  // headToHeadGames del summary, que suele venir vacío.
  async function fetchH2H(ev: EspnEvent) {
    const evId = ev.id;
    if (h2h[evId] !== undefined) return; // ya lo tenemos
    const comp = ev.competitions[0];
    const home = comp?.competitors.find(c => c.homeAway === "home");
    const away = comp?.competitors.find(c => c.homeAway === "away");
    if (!home || !away) return;
    setH2hCardLoading(p => ({ ...p, [evId]: true }));
    try {
      const fromSeason = new Date(ev.date).getFullYear();
      const h2hKey = `pelotita_espn_h2h_${leagueId}_${home.team.id}_${away.team.id}_${fromSeason}`;
      let list = cacheGet<H2HMatch[]>(h2hKey);
      if (!list) {
        list = await getHeadToHead(leagueId, Number(home.team.id), home.team.name, Number(away.team.id), away.team.name, fromSeason);
        cacheSet(h2hKey, list, H2H_TTL_MS);
      }
      setH2h(p => ({ ...p, [evId]: list }));
      setH2hSummary(p => ({ ...p, [evId]: summarizeH2H(list, Number(home.team.id), Number(away.team.id)) }));
    } catch {
      setH2h(p => ({ ...p, [evId]: null }));
      setH2hSummary(p => ({ ...p, [evId]: null }));
    } finally {
      setH2hCardLoading(p => ({ ...p, [evId]: false }));
    }
  }

  function toggleEvent(ev: EspnEvent) {
    if (expandedId === ev.id) { setExpandedId(null); return; }
    setExpandedId(ev.id);
    fetchH2H(ev);
    fetchDetails(ev);
  }

  function shiftDate(days: number) {
    const d = new Date(date + "T12:00:00");
    d.setDate(d.getDate() + days);
    setDate(d.toISOString().slice(0, 10));
  }

  const league = LEAGUES.find(l => l.id === leagueId);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Controles */}
      <div className="px-4 py-3 border-b border-bg-card/60 flex flex-wrap items-center gap-2">
        <select value={leagueId} onChange={e => setLeagueId(e.target.value)}
          className="bg-bg-deep border border-bg-card text-cream text-xs font-mono rounded px-2 py-1.5 focus:outline-none focus:border-orange/50">
          {LEAGUES.map(l => <option key={l.id} value={l.id}>[{l.flag}] {l.name}</option>)}
        </select>
        <button onClick={() => shiftDate(-1)}
          className="w-8 h-8 font-mono text-xs text-cream/40 hover:text-cream border border-bg-card rounded transition-colors">‹</button>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          className="bg-bg-deep border border-bg-card text-cream text-xs font-mono rounded px-2 py-1.5 focus:outline-none focus:border-orange/50" />
        <button onClick={() => shiftDate(1)}
          className="w-8 h-8 font-mono text-xs text-cream/40 hover:text-cream border border-bg-card rounded transition-colors">›</button>
        <button onClick={fetchFixtures}
          className="w-8 h-8 font-mono text-xs text-cream/30 hover:text-orange border border-bg-card rounded transition-colors">↺</button>
        {events.length > 0 && <span className="font-mono text-[10px] text-cream/30 ml-auto">{events.length} partidos</span>}
      </div>

      {/* Grilla de tarjetas */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading && (
          <div className="flex items-center justify-center h-40">
            <span className="font-mono text-xs text-cream/25 animate-pulse">cargando ESPN...</span>
          </div>
        )}
        {error && (
          <div className="text-red-400 font-mono text-xs bg-red-900/20 rounded p-3 border border-red-900/40">{error}</div>
        )}
        {!loading && !error && events.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-center">
            <div className="text-3xl opacity-20">⚽</div>
            <span className="font-mono text-sm text-cream/25">sin partidos · {league?.name}</span>
            <span className="font-mono text-[10px] text-cream/15">probá otra fecha o liga</span>
          </div>
        )}
        {!loading && !error && events.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {events.map(ev => (
              <MatchCard
                key={ev.id}
                ev={ev}
                leagueName={league?.name}
                onClick={() => toggleEvent(ev)}
                expanded={expandedId === ev.id}
                matchStats={matchStats[ev.id] ?? null}
                statsLoading={statsLoading === ev.id}
                goals={goals[ev.id] ?? null}
                h2h={h2h[ev.id] ?? null}
                h2hSummary={h2hSummary[ev.id] ?? null}
                h2hCardLoading={!!h2hCardLoading[ev.id]}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
