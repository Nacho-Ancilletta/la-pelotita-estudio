"use client";

import { useEffect, useRef, useState } from "react";
import { getMatchDetails, getHeadToHead, summarizeH2H, type H2HMatch, type H2HSummary, type MatchStats, type GoalEvent } from "@/lib/espn";
import { getFixtureLiga, type PromiedosGame, type PromiedosLeagueSlug } from "@/lib/promiedos";

// ── Ligas integradas (mismas que Ayudante Táctico) ──────────────

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

// ── Fechas ────────────────────────────────────────────────────

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function nextNDays(startIso: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(startIso, i));
}
function formatDayLabel(iso: string): string {
  if (iso === todayIso()) return "HOY";
  if (iso === addDays(todayIso(), 1)) return "MAÑANA";
  if (iso === addDays(todayIso(), -1)) return "AYER";
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("es-AR", { weekday: "short", day: "2-digit", month: "2-digit" }).toUpperCase();
}
const PAST_DAYS = 1; // días hacia atrás desde hoy que se muestran de entrada (ayer); más atrás, vía el buscador de fecha
const FUTURE_DAYS = 7; // días hoy-en-adelante que se muestran de entrada (sin cambios)
// Se aplica a cualquier día pasado que se cargue, no solo a los del rango por
// defecto — también a los que trae el buscador de fecha yendo más atrás de "ayer".
const PAST_FIXTURE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // resultados pasados no cambian — mismo criterio que H2H

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

// ── Tarjeta simple para partidos de respaldo (Promiedos) ────────
// Solo lista básica: no hay stats/goleadores/H2H para estos, esos
// endpoints son específicos de ESPN.

function PromiedosMatchCard({ g }: { g: PromiedosGame }) {
  return (
    <div className="rounded-lg border border-bg-card bg-bg-deep/40 p-3">
      <div className="font-mono text-[9px] text-orange/60 mb-1.5 text-center">{g.statusName || g.startTime}</div>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] text-cream text-center flex-1 truncate">{g.homeTeam.name}</span>
        <span className="font-mono text-[10px] text-cream/25 shrink-0">VS</span>
        <span className="font-mono text-[11px] text-cream text-center flex-1 truncate">{g.awayTeam.name}</span>
      </div>
    </div>
  );
}

// ── Panel de un día (acordeón, mismo estilo que Gran DT) ────────

function DayPanel({
  date, isOpen, onToggle, onRefresh, loading,
  leaguesEvents, leaguesFallback,
  expandedId, matchStats, goals, statsLoading, h2h, h2hSummary, h2hCardLoading, onToggleMatch,
}: {
  date: string; isOpen: boolean; onToggle: () => void; onRefresh: () => void; loading: boolean;
  leaguesEvents: Record<string, EspnEvent[]>; leaguesFallback: Record<string, PromiedosGame[]>;
  expandedId: string | null;
  matchStats: Record<string, MatchStats | null>; goals: Record<string, GoalEvent[] | null>; statsLoading: string | null;
  h2h: Record<string, H2HMatch[] | null>; h2hSummary: Record<string, H2HSummary | null>; h2hCardLoading: Record<string, boolean>;
  onToggleMatch: (ev: EspnEvent, leagueId: string) => void;
}) {
  const leaguesWithGames = LEAGUES.filter(
    (l) => (leaguesEvents[l.id]?.length ?? 0) > 0 || (leaguesFallback[l.id]?.length ?? 0) > 0
  );
  const totalGames = leaguesWithGames.reduce(
    (sum, l) => sum + (leaguesEvents[l.id]?.length ?? 0) + (leaguesFallback[l.id]?.length ?? 0), 0
  );

  return (
    <div className="rounded-lg border border-bg-card bg-bg-card/10 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-bg-card/20 transition-colors"
      >
        <span className="font-mono text-sm text-cream tracking-widest">{formatDayLabel(date)}</span>
        <span className="flex items-center gap-3">
          {loading && <span className="font-mono text-[10px] text-cream/30 animate-pulse">buscando...</span>}
          {!loading && isOpen && totalGames > 0 && <span className="font-mono text-[10px] text-cream/30">{totalGames} partidos</span>}
          <span className={["font-mono text-orange text-lg transition-transform", isOpen ? "rotate-180" : ""].join(" ")}>⌄</span>
        </span>
      </button>

      {isOpen && (
        <div className="px-5 pb-5 border-t border-bg-card/60 pt-4">
          {loading && <div className="text-cream/25 font-mono text-xs py-4 text-center">buscando partidos en las ligas seguidas...</div>}
          {!loading && leaguesWithGames.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <span className="text-cream/20 font-mono text-xs">sin partidos este día en las ligas seguidas</span>
              <button onClick={onRefresh} className="font-mono text-[10px] text-cream/30 hover:text-orange">↺ reintentar</button>
            </div>
          )}
          {!loading && leaguesWithGames.map((lg) => {
            const evs = leaguesEvents[lg.id] ?? [];
            const fallbackGames = leaguesFallback[lg.id] ?? [];
            const usingFallback = evs.length === 0 && fallbackGames.length > 0;
            return (
              <div key={lg.id} className="mb-4 last:mb-0">
                <div className="font-mono text-[10px] text-orange/70 tracking-widest mb-2">
                  [{lg.flag}] {lg.name.toUpperCase()}
                  {usingFallback && <span className="text-cream/25 normal-case"> · vía Promiedos</span>}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {usingFallback
                    ? fallbackGames.map((g) => <PromiedosMatchCard key={g.id} g={g} />)
                    : evs.map((ev) => (
                        <MatchCard
                          key={ev.id}
                          ev={ev}
                          leagueName={lg.name}
                          onClick={() => onToggleMatch(ev, lg.id)}
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────

export default function EspnFixtures() {
  const [dayList, setDayList] = useState<string[]>(() => nextNDays(addDays(todayIso(), -PAST_DAYS), PAST_DAYS + FUTURE_DAYS));
  const [openDays, setOpenDays] = useState<Set<string>>(() => new Set([todayIso()]));
  const dayRefs = useRef<Record<string, HTMLDivElement | null>>({});
  // Fecha activa en el buscador (arriba del scroll). Si cae fuera del rango
  // por defecto (dayList), jumpDate guarda esa fecha puntual y se muestra en
  // un panel aparte, con el mismo formato agrupado por liga que un día del
  // scroll normal — ver goToDate más abajo.
  const [selectedDate, setSelectedDate] = useState<string>(() => todayIso());
  const [jumpDate, setJumpDate] = useState<string | null>(null);
  const [dayEvents,   setDayEvents]   = useState<Record<string, Record<string, EspnEvent[]>>>({});
  const [dayFallback, setDayFallback] = useState<Record<string, Record<string, PromiedosGame[]>>>({});
  const [dayLoading,  setDayLoading]  = useState<Record<string, boolean>>({});

  const [expandedId,  setExpandedId]  = useState<string | null>(null);
  const [matchStats,  setMatchStats]  = useState<Record<string, MatchStats | null>>({});
  const [goals,       setGoals]       = useState<Record<string, GoalEvent[] | null>>({});
  const [statsLoading, setStatsLoading] = useState<string | null>(null);
  const [h2h,         setH2h]         = useState<Record<string, H2HMatch[] | null>>({});
  const [h2hSummary,  setH2hSummary]  = useState<Record<string, H2HSummary | null>>({});
  const [h2hCardLoading, setH2hCardLoading] = useState<Record<string, boolean>>({});

  // Carga el día de hoy solo (los demás, al abrirlos) y deja el scroll
  // parado ahí de entrada — con "ayer" ya cargado antes en la lista, "hoy"
  // no es lo primero que se ve si no se hace este scroll.
  useEffect(() => {
    ensureDayLoaded(todayIso());
    dayRefs.current[todayIso()]?.scrollIntoView({ block: "start" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recorre las 15 ligas integradas para un día — ESPN primero (con delay
  // entre pedidos, mismo criterio anti-403 que getHeadToHead), Promiedos
  // como respaldo cuando ESPN falla, pero solo tiene sentido para "hoy"
  // (Promiedos no soporta pedir fixture por fecha calendario arbitraria,
  // "latest" = partidos actuales — ver lib/promiedos.ts).
  async function ensureDayLoaded(date: string, force = false) {
    if (!force && (dayEvents[date] || dayLoading[date])) return;
    setDayLoading(p => ({ ...p, [date]: true }));
    const perLeague: Record<string, EspnEvent[]> = {};
    const perLeagueFallback: Record<string, PromiedosGame[]> = {};
    const isToday = date === todayIso();
    const isPast = date < todayIso();

    for (let i = 0; i < LEAGUES.length; i++) {
      const lg = LEAGUES[i];
      if (i > 0) await new Promise(r => setTimeout(r, 150));
      const key = cacheKey(lg.id, date);
      let evs = cacheGet<EspnEvent[]>(key);
      if (!evs) {
        try {
          const res  = await fetch(`/api/espn?league=${lg.id}&endpoint=scoreboard&dates=${date.replace(/-/g, "")}`);
          const data = await res.json();
          if (data.error) throw new Error(data.error);
          evs = data.events ?? [];
          // Días pasados: resultado ya no cambia, TTL largo (7 días, mismo
          // criterio que H2H). Hoy/futuro: sin TTL — se recarga a mano con
          // el ↺ de cada día, mismo comportamiento que ya tenía el tab.
          cacheSet(key, evs, isPast ? PAST_FIXTURE_TTL_MS : undefined);
        } catch {
          evs = null; // ESPN falló para esta liga — no se cachea el fallo
        }
      }
      if (evs && evs.length > 0) {
        perLeague[lg.id] = evs;
      } else if (evs === null && isToday) {
        try {
          const games = await getFixtureLiga(lg.id as PromiedosLeagueSlug);
          if (games.length > 0) perLeagueFallback[lg.id] = games;
        } catch { /* sin datos de esta liga hoy por ninguna fuente — se omite */ }
      }
    }

    setDayEvents(p => ({ ...p, [date]: perLeague }));
    setDayFallback(p => ({ ...p, [date]: perLeagueFallback }));
    setDayLoading(p => ({ ...p, [date]: false }));
  }

  function toggleDay(date: string) {
    const willOpen = !openDays.has(date);
    setOpenDays(prev => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date); else next.add(date);
      return next;
    });
    if (willOpen) ensureDayLoaded(date);
  }

  function refreshDay(date: string) {
    setDayEvents(p => { const n = { ...p }; delete n[date]; return n; });
    setDayFallback(p => { const n = { ...p }; delete n[date]; return n; });
    ensureDayLoaded(date, true);
  }

  function loadMoreDays() {
    setDayList(prev => [...prev, ...nextNDays(addDays(prev[prev.length - 1], 1), 7)]);
  }

  // Buscador de fecha (flechas + input arriba del scroll). Si la fecha
  // elegida ya está en el rango por defecto, scrollea/abre ese día como
  // toggleDay. Si cae afuera (ej. una fecha de hace un mes), no la mete en
  // dayList — la muestra aparte como jumpDate, un panel puntual con el
  // mismo formato agrupado por liga.
  function goToDate(newDate: string) {
    setSelectedDate(newDate);
    if (dayList.includes(newDate)) {
      setJumpDate(null);
      setOpenDays(prev => new Set(prev).add(newDate));
      ensureDayLoaded(newDate);
      dayRefs.current[newDate]?.scrollIntoView({ block: "start", behavior: "smooth" });
    } else {
      setJumpDate(newDate);
      ensureDayLoaded(newDate);
    }
  }

  // Stats + goleadores — solo al expandir la tarjeta (no en todas apenas
  // cargan: el summary de ESPN pesa harto y no vale la pena bajarlo de
  // entrada para cada partido del día). getMatchDetails ya cachea 90s en
  // localStorage.
  async function fetchDetails(ev: EspnEvent, leagueId: string) {
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
  async function fetchH2H(ev: EspnEvent, leagueId: string) {
    const evId = ev.id;
    if (h2h[evId] !== undefined) return; // ya lo tenemos
    const comp = ev.competitions[0];
    const home = comp?.competitors.find(c => c.homeAway === "home");
    const away = comp?.competitors.find(c => c.homeAway === "away");
    if (!home || !away) return;
    setH2hCardLoading(p => ({ ...p, [evId]: true }));
    try {
      const fromSeason = new Date(ev.date).getFullYear();
      // v2: getHeadToHead ahora corta a 5 post-sort (antes podía devolver 6+,
      // bump para no quedar 7 días mostrando un cruce viejo con el bug).
      const h2hKey = `pelotita_espn_h2h_v2_${leagueId}_${home.team.id}_${away.team.id}_${fromSeason}`;
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

  function toggleMatch(ev: EspnEvent, leagueId: string) {
    if (expandedId === ev.id) { setExpandedId(null); return; }
    setExpandedId(ev.id);
    fetchH2H(ev, leagueId);
    fetchDetails(ev, leagueId);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Buscador de fecha: salta a cualquier día, incluyendo pasado más allá de "ayer" */}
      <div className="shrink-0 flex items-center justify-center gap-3 px-4 pt-4 pb-3 border-b border-bg-card/40">
        <button
          onClick={() => goToDate(addDays(selectedDate, -1))}
          className="font-mono text-orange text-lg px-2 hover:text-orange/70 transition-colors"
          aria-label="día anterior"
        >
          ‹
        </button>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => e.target.value && goToDate(e.target.value)}
          className="bg-bg-deep border border-bg-card text-cream text-xs font-mono rounded px-3 py-1.5 focus:outline-none focus:border-orange/50"
        />
        <button
          onClick={() => goToDate(addDays(selectedDate, 1))}
          className="font-mono text-orange text-lg px-2 hover:text-orange/70 transition-colors"
          aria-label="día siguiente"
        >
          ›
        </button>
        {selectedDate !== todayIso() && (
          <button
            onClick={() => goToDate(todayIso())}
            className="font-mono text-[10px] text-cream/40 hover:text-orange tracking-widest"
          >
            HOY
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {jumpDate && (
          <div ref={(el) => { dayRefs.current[jumpDate] = el; }}>
            <DayPanel
              date={jumpDate}
              isOpen={true}
              onToggle={() => setJumpDate(null)}
              onRefresh={() => refreshDay(jumpDate)}
              loading={!!dayLoading[jumpDate]}
              leaguesEvents={dayEvents[jumpDate] ?? {}}
              leaguesFallback={dayFallback[jumpDate] ?? {}}
              expandedId={expandedId}
              matchStats={matchStats}
              goals={goals}
              statsLoading={statsLoading}
              h2h={h2h}
              h2hSummary={h2hSummary}
              h2hCardLoading={h2hCardLoading}
              onToggleMatch={toggleMatch}
            />
          </div>
        )}
        {dayList.map((date) => (
          <div key={date} ref={(el) => { dayRefs.current[date] = el; }}>
            <DayPanel
              date={date}
              isOpen={openDays.has(date)}
              onToggle={() => toggleDay(date)}
              onRefresh={() => refreshDay(date)}
              loading={!!dayLoading[date]}
              leaguesEvents={dayEvents[date] ?? {}}
              leaguesFallback={dayFallback[date] ?? {}}
              expandedId={expandedId}
              matchStats={matchStats}
              goals={goals}
              statsLoading={statsLoading}
              h2h={h2h}
              h2hSummary={h2hSummary}
              h2hCardLoading={h2hCardLoading}
              onToggleMatch={toggleMatch}
            />
          </div>
        ))}
        <button
          onClick={loadMoreDays}
          className="w-full py-3 font-mono text-xs text-cream/30 hover:text-orange border border-dashed border-bg-card rounded-lg transition-colors"
        >
          cargar más días ↓
        </button>
      </div>
    </div>
  );
}
