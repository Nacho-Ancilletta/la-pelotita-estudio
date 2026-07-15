"use client";

import { useEffect, useRef, useState } from "react";
import { PitchSVG }      from "@/components/pitch/PitchSVG";
import { ArrowsOverlay } from "@/components/pitch/ArrowsOverlay";
import { makeTeam, clamp } from "@/components/pitch/formations";
import type { Player, Arrow } from "@/components/pitch/formations";
import {
  getStandings, getHeadToHead, summarizeH2H, espnTeamLogoUrl,
  type StandingRow, type H2HMatch,
} from "@/lib/espn";

type Mode = "move" | "arrow";

const PIZARRA_FORMATIONS = ["4-3-3", "4-4-2", "5-3-2"];

// Mismos ids que usaba Sofascore (para no romper caché/estado viejo), ahora
// mapeados a slug ESPN en vez de tournament id.
const LEAGUES = [
  { id: "128", name: "Argentina — Primera División", espn: "arg.1" },
  { id: "131", name: "Copa Libertadores",             espn: "conmebol.libertadores" },
  { id: "71",  name: "Brasil — Série A",               espn: "bra.1" },
  { id: "262", name: "México — Liga MX",               espn: "mex.1" },
  { id: "39",  name: "Inglaterra — Premier League",    espn: "eng.1" },
  { id: "140", name: "España — La Liga",               espn: "esp.1" },
  { id: "135", name: "Italia — Serie A",                espn: "ita.1" },
  { id: "78",  name: "Alemania — Bundesliga",           espn: "ger.1" },
  { id: "61",  name: "Francia — Ligue 1",               espn: "fra.1" },
  { id: "2",   name: "Champions League",                espn: "uefa.champions" },
  { id: "3",   name: "Europa League",                   espn: "uefa.europa" },
];

// ESPN llama "season" al año de inicio de la temporada (2025 → "2025-26").
const CURRENT_YEAR = new Date().getFullYear();
const SEASON_YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i);
function seasonLabel(y: number) {
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

// ── Cache ──────────────────────────────────────────────────────
function cacheGet<T>(key: string): T | null {
  try { return JSON.parse(localStorage.getItem(key) ?? "null") as T; }
  catch { return null; }
}
function cacheSet(key: string, d: unknown) {
  localStorage.setItem(key, JSON.stringify(d));
}
function h2hDate(ts: number) {
  return new Date(ts * 1000).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

// ── Stat row UI ───────────────────────────────────────────────
function StatRow({ label, a, b, higherIsBetter = true, fmt }: {
  label: string; a: number; b: number; higherIsBetter?: boolean; fmt?: (v: number) => string;
}) {
  const max = Math.max(Math.abs(a), Math.abs(b), 1);
  const aWins = higherIsBetter ? a > b : a < b;
  const bWins = higherIsBetter ? b > a : b < a;
  const da = fmt ? fmt(a) : String(a);
  const db = fmt ? fmt(b) : String(b);
  return (
    <div className="grid grid-cols-[1fr_100px_1fr] items-center py-1 border-b border-bg-card/40 text-[10px]">
      <div className="flex items-center justify-end gap-1.5 pr-1">
        <span className={`font-mono font-bold tabular-nums ${aWins ? "text-warm-white" : "text-cream/50"}`}>{da}</span>
        <div className="w-12 h-1 bg-bg-deep overflow-hidden flex justify-end">
          <div className={`h-full ${aWins ? "bg-orange" : "bg-bg-card"}`} style={{ width: `${(Math.abs(a) / max) * 100}%` }} />
        </div>
      </div>
      <div className="font-mono text-[9px] text-cream/35 tracking-wider text-center">{label}</div>
      <div className="flex items-center gap-1.5 pl-1">
        <div className="w-12 h-1 bg-bg-deep overflow-hidden">
          <div className={`h-full ${bWins ? "bg-cream/70" : "bg-bg-card"}`} style={{ width: `${(Math.abs(b) / max) * 100}%` }} />
        </div>
        <span className={`font-mono font-bold tabular-nums ${bWins ? "text-warm-white" : "text-cream/50"}`}>{db}</span>
      </div>
    </div>
  );
}

function TextRow({ label, a, b }: { label: string; a: string; b: string }) {
  return (
    <div className="grid grid-cols-[1fr_100px_1fr] items-center py-1 border-b border-bg-card/40 text-[10px]">
      <div className="text-right pr-1 font-mono font-bold text-orange">{a}</div>
      <div className="font-mono text-[9px] text-cream/35 tracking-wider text-center">{label}</div>
      <div className="text-left pl-1 font-mono font-bold text-cream">{b}</div>
    </div>
  );
}

export default function TacticoTab() {
  // ── Pizarra state ──────────────────────────────────────────
  const [localF,  setLocalF]  = useState("4-3-3");
  const [visitorF, setVisitorF] = useState("4-4-2");
  const [players, setPlayers] = useState<Player[]>([
    ...makeTeam("4-3-3", "local"),
    ...makeTeam("4-4-2", "visitor"),
  ]);
  const [arrows,     setArrows]     = useState<Arrow[]>([]);
  const [playerNames, setPlayerNames] = useState<Record<string, string>>({});
  const [mode,       setMode]       = useState<Mode>("move");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [live,       setLive]       = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [arrowStart, setArrowStart] = useState<{ x: number; y: number } | null>(null);
  const pitchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mode !== "arrow") { setLive(null); setArrowStart(null); }
  }, [mode]);

  function toCoords(clientX: number, clientY: number) {
    const r = pitchRef.current!.getBoundingClientRect();
    return {
      x: clamp(((clientX - r.left) / r.width) * 68, 0, 68),
      y: clamp(((clientY - r.top) / r.height) * 105, 0, 105),
    };
  }

  function applyFormation(team: "local" | "visitor", f: string) {
    setPlayers(prev => [...prev.filter(p => p.team !== team), ...makeTeam(f, team)]);
    team === "local" ? setLocalF(f) : setVisitorF(f);
  }

  function onPitchDown(e: React.PointerEvent) {
    if (mode !== "arrow") return;
    const c = toCoords(e.clientX, e.clientY);
    setArrowStart(c);
    setLive({ x1: c.x, y1: c.y, x2: c.x, y2: c.y });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPitchMove(e: React.PointerEvent) {
    if (mode !== "arrow" || !arrowStart) return;
    const c = toCoords(e.clientX, e.clientY);
    setLive({ x1: arrowStart.x, y1: arrowStart.y, x2: c.x, y2: c.y });
  }
  function onPitchUp(e: React.PointerEvent) {
    if (mode !== "arrow" || !arrowStart) return;
    const c = toCoords(e.clientX, e.clientY);
    if (Math.hypot(c.x - arrowStart.x, c.y - arrowStart.y) > 2) {
      setArrows(prev => [...prev, { id: `a-${Date.now()}`, x1: arrowStart.x, y1: arrowStart.y, x2: c.x, y2: c.y }]);
    }
    setArrowStart(null); setLive(null);
  }
  function onPlayerDown(e: React.PointerEvent, id: string) {
    if (mode !== "move") return;
    e.preventDefault(); e.stopPropagation();
    setDraggingId(id);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPlayerMove(e: React.PointerEvent, id: string) {
    if (draggingId !== id) return;
    const c = toCoords(e.clientX, e.clientY);
    setPlayers(prev => prev.map(p => p.id === id ? { ...p, x: c.x, y: c.y } : p));
  }
  function onPlayerUp() { setDraggingId(null); }

  // ── Equipos: local / visitante compartidos entre pizarra, comparador y H2H ──
  const [leagueId,   setLeagueId]   = useState("128");
  const [seasonYear, setSeasonYear] = useState(CURRENT_YEAR - 1);
  const [teams,    setTeams]    = useState<StandingRow[]>([]);
  const [teamAId,  setTeamAId]  = useState(""); // local
  const [teamBId,  setTeamBId]  = useState(""); // visitante
  const [statsA,   setStatsA]   = useState<StandingRow | null>(null);
  const [statsB,   setStatsB]   = useState<StandingRow | null>(null);
  const [h2h,      setH2h]      = useState<H2HMatch[] | null>(null);
  const [loading,  setLoading]  = useState<"teams" | "stats" | null>(null);
  const [error,    setError]    = useState<string | null>(null);

  const leagueSlug = LEAGUES.find(l => l.id === leagueId)?.espn ?? "";

  useEffect(() => {
    setTeamAId(""); setTeamBId("");
    setStatsA(null); setStatsB(null); setH2h(null);
    setError(null); setTeams([]);
  }, [leagueId]);

  async function cargarEquipos() {
    setError(null);
    setLoading("teams");
    try {
      const key = `pelotita_espn_standings_${leagueSlug}_${seasonYear}`;
      let rows = cacheGet<StandingRow[]>(key);
      if (!rows || !rows.length) {
        rows = await getStandings(leagueSlug, seasonYear);
        cacheSet(key, rows);
      }
      setTeams(rows);
      setStatsA(null); setStatsB(null); setH2h(null);
      setTeamAId(""); setTeamBId("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error cargando equipos");
    } finally {
      setLoading(null);
    }
  }

  async function armarClave() {
    if (!teamAId || !teamBId) return;
    setError(null);
    setLoading("stats");
    try {
      const rowA = teams.find(t => String(t.team.id) === teamAId);
      const rowB = teams.find(t => String(t.team.id) === teamBId);
      if (!rowA || !rowB) throw new Error("Equipo no encontrado en esta temporada");
      setStatsA(rowA); setStatsB(rowB);

      const h2hKey = `pelotita_espn_h2h_${leagueSlug}_${teamAId}_${teamBId}_${seasonYear}`;
      let list = cacheGet<H2HMatch[]>(h2hKey);
      if (!list) {
        list = await getHeadToHead(leagueSlug, Number(teamAId), rowA.team.name, Number(teamBId), rowB.team.name, seasonYear, 10);
        cacheSet(h2hKey, list);
      }
      setH2h(list);

      // aplica los equipos elegidos como local/visitante en la pizarra
      applyFormation("local", localF);
      applyFormation("visitor", visitorF);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error cargando datos");
    } finally {
      setLoading(null);
    }
  }

  const hasTeams = teams.length > 0;
  const hasStats = statsA !== null && statsB !== null;
  const localTeamName   = teams.find(t => String(t.team.id) === teamAId)?.team.name;
  const visitorTeamName = teams.find(t => String(t.team.id) === teamBId)?.team.name;

  // Resumen H2H desde la perspectiva local/visitante elegidos
  const h2hSummary = h2h ? summarizeH2H(h2h, Number(teamAId), Number(teamBId)) : null;

  return (
    <div className="flex flex-col lg:flex-row h-full overflow-y-auto lg:overflow-hidden">
      {/* ── Columna izquierda: formaciones + datos/cruces ── */}
      <div className="lg:w-[440px] shrink-0 flex flex-col p-4 gap-3 lg:overflow-y-auto">
        <div className="flex items-center gap-2 flex-wrap border-b border-bg-card pb-3">
          {(["move", "arrow"] as Mode[]).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={["px-3 py-1.5 rounded border text-xs font-mono transition-colors",
                mode === m ? "bg-orange/20 border-orange text-orange" : "border-bg-card text-cream/40 hover:text-cream/70"].join(" ")}>
              {m === "move" ? "↖ MOVER" : "→ FLECHA"}
            </button>
          ))}
          <div className="h-4 w-px bg-bg-card mx-1" />
          <span className="font-mono text-[10px] text-orange/60">LOCAL</span>
          {PIZARRA_FORMATIONS.map(f => (
            <button key={`l-${f}`} onClick={() => applyFormation("local", f)}
              className={["px-2 py-1 rounded text-[10px] font-mono border transition-colors",
                localF === f ? "bg-orange/30 border-orange text-orange" : "border-bg-card text-cream/30 hover:text-cream/60"].join(" ")}>
              {f}
            </button>
          ))}
          <div className="h-4 w-px bg-bg-card mx-1" />
          <span className="font-mono text-[10px] text-cream/40">VISIT.</span>
          {PIZARRA_FORMATIONS.map(f => (
            <button key={`v-${f}`} onClick={() => applyFormation("visitor", f)}
              className={["px-2 py-1 rounded text-[10px] font-mono border transition-colors",
                visitorF === f ? "bg-cream/20 border-cream/40 text-cream" : "border-bg-card text-cream/30 hover:text-cream/60"].join(" ")}>
              {f}
            </button>
          ))}
          <div className="ml-auto flex gap-2">
            <button onClick={() => { setArrows([]); setArrowStart(null); setLive(null); }}
              className="px-2 py-1 rounded border border-bg-card text-[10px] font-mono text-cream/30 hover:text-red-400 transition-colors">
              ✕ flechas
            </button>
            <button onClick={() => { setPlayers([...makeTeam(localF, "local"), ...makeTeam(visitorF, "visitor")]); setArrows([]); setPlayerNames({}); setArrowStart(null); setLive(null); }}
              className="px-2 py-1 rounded border border-bg-card text-[10px] font-mono text-cream/30 hover:text-red-400 transition-colors">
              ↺ reset
            </button>
          </div>
        </div>

        {/* Datos */}
        <div className="rounded-lg border border-bg-card bg-bg-card/10 p-4">
          {!hasStats && (
            <div className="flex flex-col items-center justify-center gap-2 text-center py-8">
              <div className="text-3xl opacity-20">⚽</div>
              <div className="font-mono text-cream/30 text-sm">Sin clave armada</div>
              <div className="text-cream/20 text-xs max-w-xs">
                Elegí local y visitante en el panel de la derecha y armá la clave táctica.
              </div>
            </div>
          )}

          {hasStats && statsA && statsB && (
            <div>
              <div className="font-mono text-orange text-xs tracking-widest mb-3">DATOS</div>
              <div className="grid grid-cols-[1fr_100px_1fr] gap-2 mb-3 pb-3 border-b border-bg-card/60">
                <div className="flex items-center justify-end gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={espnTeamLogoUrl(statsA.team.id)} alt="" className="w-6 h-6 object-contain" />
                  <span className="font-mono text-xs font-bold text-orange text-right leading-tight">{statsA.team.name}</span>
                </div>
                <div className="font-mono text-[10px] text-cream/20 text-center self-center">VS</div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-cream leading-tight">{statsB.team.name}</span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={espnTeamLogoUrl(statsB.team.id)} alt="" className="w-6 h-6 object-contain" />
                </div>
              </div>
              <TextRow label="POSICIÓN"        a={`#${statsA.position}`} b={`#${statsB.position}`} />
              <StatRow label="PUNTOS"          a={statsA.points}  b={statsB.points} />
              <StatRow label="PJ"              a={statsA.matches} b={statsB.matches} />
              <StatRow label="VICTORIAS"       a={statsA.wins}    b={statsB.wins} />
              <StatRow label="EMPATES"         a={statsA.draws}   b={statsB.draws} />
              <StatRow label="DERROTAS"        a={statsA.losses}  b={statsB.losses} higherIsBetter={false} />
              <StatRow label="GOLES A FAVOR"   a={statsA.scoresFor}     b={statsB.scoresFor} />
              <StatRow label="GOLES EN CONTRA" a={statsA.scoresAgainst} b={statsB.scoresAgainst} higherIsBetter={false} />
            </div>
          )}
        </div>
      </div>

      {/* ── Franja central: cruces H2H ── */}
      <div className="lg:w-[280px] shrink-0 p-4 lg:overflow-y-auto border-t lg:border-t-0 lg:border-l border-bg-card">
        <div className="rounded-lg border border-bg-card bg-bg-card/10 p-4 h-full">
          <div className="font-mono text-orange text-xs tracking-widest mb-3">CRUCES · H2H</div>
          {!h2h && (
            <div className="text-cream/20 font-mono text-[10px]">Armá la clave táctica para ver el historial</div>
          )}
          {h2h && h2h.length === 0 && <div className="text-cream/20 font-mono text-[10px]">sin cruces recientes en el historial</div>}
          {h2h && h2h.length > 0 && (
            <>
              <div className="font-mono text-[11px] text-cream/50 mb-3 leading-snug">
                {localTeamName ?? "Local"} {h2hSummary?.homeWins ?? 0}V · {h2hSummary?.draws ?? 0}E · {h2hSummary?.awayWins ?? 0}V {visitorTeamName ?? "Visitante"}
              </div>
              <div className="space-y-2">
                {h2h.map(m => (
                  <div key={m.id} className="font-mono text-[10px] text-cream/40">
                    <div className="text-cream/20 text-[9px]">{h2hDate(m.timestamp)}</div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate">{m.homeTeam}</span>
                      <span className="text-cream font-bold tabular-nums shrink-0">{m.homeScore}-{m.awayScore}</span>
                    </div>
                    <div className="truncate">{m.awayTeam}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Columna central: pizarra táctica ── */}
      <div className="flex-1 min-w-0 flex flex-col p-4 lg:overflow-hidden">
        <div className="flex-1 flex items-start justify-center lg:overflow-hidden">
          <div className="flex flex-col items-center gap-1">
            <span className="font-mono text-[10px] text-cream/30 tracking-widest">{visitorTeamName ?? "VISITANTE"} ▼</span>
            <div ref={pitchRef} className="relative select-none"
              style={{ aspectRatio: "68 / 105", height: "clamp(300px, calc(100vh - 200px), 560px)", cursor: "default" }}
              onPointerDown={onPitchDown} onPointerMove={onPitchMove} onPointerUp={onPitchUp}
              onPointerCancel={onPitchUp}
              onPointerLeave={() => { if (mode === "arrow" && !draggingId) { setArrowStart(null); setLive(null); } }}>
              <PitchSVG />
              <ArrowsOverlay arrows={arrows} live={live} onRemove={id => setArrows(prev => prev.filter(a => a.id !== id))} eraseMode={false} />
              {players.map(p => {
                const isLocal = p.team === "local";
                const isDragging = draggingId === p.id;
                return (
                  <div key={p.id}
                    style={{ position: "absolute", left: `${(p.x / 68) * 100}%`, top: `${(p.y / 105) * 100}%`,
                      transform: "translate(-50%, -50%)", zIndex: isDragging ? 20 : 10,
                      cursor: mode === "move" ? (isDragging ? "grabbing" : "grab") : "default", touchAction: "none" }}
                    onPointerDown={e => onPlayerDown(e, p.id)}
                    onPointerMove={e => onPlayerMove(e, p.id)}
                    onPointerUp={onPlayerUp}>
                    <div className="flex flex-col items-center gap-0.5">
                      <div className={["w-7 h-7 rounded-full flex items-center justify-center",
                        "text-[8px] font-mono font-bold border-2 shadow-md transition-transform",
                        isDragging ? "scale-125" : "",
                        isLocal ? "bg-orange text-bg-deep border-warm-white" : "bg-[#2a2a3a] text-cream border-cream/60"].join(" ")}>
                        {p.label}
                      </div>
                      <input
                        value={playerNames[p.id] ?? ""}
                        onChange={e => setPlayerNames(prev => ({ ...prev, [p.id]: e.target.value }))}
                        onPointerDown={e => e.stopPropagation()}
                        placeholder=""
                        className="w-16 bg-bg-deep/70 rounded-sm px-0.5 text-center text-cream/80 text-[7px] font-mono border border-cream/30 focus:outline-none focus:border-orange focus:text-cream"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <span className="font-mono text-[10px] text-orange/50 tracking-widest">{localTeamName ?? "LOCAL"} ▲</span>
          </div>
        </div>
      </div>

      {/* ── Panel lateral: selección de equipos ── */}
      <div className="w-full lg:w-[340px] shrink-0 border-t lg:border-t-0 lg:border-l border-bg-card lg:overflow-y-auto flex flex-col">
        <div className="px-4 py-3 border-b border-bg-card/60">
          <h3 className="font-mono text-orange text-xs tracking-widest mb-1">CLAVE TÁCTICA</h3>
          <p className="text-cream/40 text-[10px]">Elegí local y visitante · pizarra, comparador y H2H juntos</p>
        </div>

        <div className="p-4 space-y-3">
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] text-orange/70 tracking-widest">LIGA</span>
            <select value={leagueId} onChange={e => setLeagueId(e.target.value)}
              className="bg-bg-deep border border-bg-card text-cream text-xs font-mono rounded px-2 py-1.5 focus:outline-none focus:border-orange/50">
              {LEAGUES.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] text-orange/70 tracking-widest">TEMPORADA</span>
            <select value={seasonYear} onChange={e => setSeasonYear(Number(e.target.value))}
              className="bg-bg-deep border border-bg-card text-cream text-xs font-mono rounded px-2 py-1.5 focus:outline-none focus:border-orange/50">
              {SEASON_YEARS.map(y => <option key={y} value={y}>{seasonLabel(y)}</option>)}
            </select>
          </label>
          <button onClick={cargarEquipos} disabled={loading === "teams"}
            className="w-full py-1.5 border border-orange text-orange font-mono text-[10px] rounded tracking-wider hover:bg-orange/20 transition-colors disabled:opacity-40">
            {loading === "teams" ? "CARGANDO..." : "⚽ CARGAR EQUIPOS"}
          </button>
          {hasTeams && <span className="font-mono text-[10px] text-cream/30">{teams.length} equipos · caché</span>}

          {hasTeams && (
            <>
              <label className="flex flex-col gap-1">
                <span className="font-mono text-[10px] text-orange tracking-widest">LOCAL</span>
                <select value={teamAId} onChange={e => setTeamAId(e.target.value)}
                  className="bg-bg-deep border border-orange/40 text-cream text-xs font-mono rounded px-2 py-1.5 focus:outline-none focus:border-orange">
                  <option value="">— elegir equipo —</option>
                  {teams.map(t => <option key={t.team.id} value={String(t.team.id)}>{t.team.name}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-mono text-[10px] text-cream/50 tracking-widest">VISITANTE</span>
                <select value={teamBId} onChange={e => setTeamBId(e.target.value)}
                  className="bg-bg-deep border border-cream/20 text-cream text-xs font-mono rounded px-2 py-1.5 focus:outline-none focus:border-cream/50">
                  <option value="">— elegir equipo —</option>
                  {teams.map(t => <option key={t.team.id} value={String(t.team.id)}>{t.team.name}</option>)}
                </select>
              </label>
              <button onClick={armarClave} disabled={!teamAId || !teamBId || loading === "stats"}
                className="w-full py-1.5 bg-orange text-bg-deep font-mono font-bold text-[10px] rounded tracking-wider hover:bg-orange/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                {loading === "stats" ? "CARGANDO..." : "ARMAR CLAVE TÁCTICA"}
              </button>
            </>
          )}

          {error && (
            <div className="text-red-400 font-mono text-[10px] bg-red-900/20 rounded p-2 border border-red-900/40">{error}</div>
          )}
        </div>
      </div>
    </div>
  );
}
