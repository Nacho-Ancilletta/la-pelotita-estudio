"use client";

import { useEffect, useRef, useState } from "react";
import { PitchSVG }      from "@/components/pitch/PitchSVG";
import { ArrowsOverlay } from "@/components/pitch/ArrowsOverlay";
import { FORMATIONS, FORMATION_KEYS, makeTeam, clamp } from "@/components/pitch/formations";
import type { Player, Arrow } from "@/components/pitch/formations";
import EspnFixtures from "@/components/EspnFixtures";

// ── Cache helpers ─────────────────────────────────────────────

function cacheGet<T>(key: string): T | null {
  try { return JSON.parse(localStorage.getItem(key) ?? "null") as T; }
  catch { return null; }
}

const LEAGUES = [
  { id: "128", name: "Argentina — Primera Div." },
  { id: "131", name: "Copa Libertadores" },
  { id: "71",  name: "Brasil — Série A" },
  { id: "262", name: "México — Liga MX" },
  { id: "39",  name: "Inglaterra — Premier" },
  { id: "140", name: "España — La Liga" },
  { id: "135", name: "Italia — Serie A" },
  { id: "78",  name: "Alemania — Bundesliga" },
  { id: "61",  name: "Francia — Ligue 1" },
  { id: "2",   name: "Champions League" },
];
const SEASONS = ["2025", "2024", "2023", "2022", "2021"];

// ── Shared stat-row UI ────────────────────────────────────────

function StatBar({ label, a, b, higherIsBetter = true, fmt }: {
  label: string; a: number; b: number; higherIsBetter?: boolean; fmt?: (v: number) => string;
}) {
  const max  = Math.max(Math.abs(a), Math.abs(b), 1);
  const aWins = higherIsBetter ? a > b : a < b;
  const bWins = higherIsBetter ? b > a : b < a;
  const da = fmt ? fmt(a) : String(a);
  const db = fmt ? fmt(b) : String(b);
  return (
    <div className="grid grid-cols-[1fr_110px_1fr] items-center py-1 border-b border-bg-deep/60 text-[10px]">
      <div className="flex items-center justify-end gap-1.5 pr-1">
        <span className={`font-mono font-bold tabular-nums ${aWins ? "text-warm-white" : "text-cream/40"}`}>{da}</span>
        <div className="w-14 h-1 bg-bg-deep rounded-full overflow-hidden flex justify-end">
          <div className={`h-full rounded-full ${aWins ? "bg-orange" : "bg-bg-deep"}`} style={{ width: `${(Math.abs(a)/max)*100}%` }} />
        </div>
      </div>
      <div className="font-mono text-[9px] text-cream/30 tracking-wider text-center">{label}</div>
      <div className="flex items-center gap-1.5 pl-1">
        <div className="w-14 h-1 bg-bg-deep rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${bWins ? "bg-cream/60" : "bg-bg-deep"}`} style={{ width: `${(Math.abs(b)/max)*100}%` }} />
        </div>
        <span className={`font-mono font-bold tabular-nums ${bWins ? "text-warm-white" : "text-cream/40"}`}>{db}</span>
      </div>
    </div>
  );
}

// ── Panel: Partido del día ────────────────────────────────────

interface TeamEntry { id: number; name: string; logo: string; }
interface CachedStats {
  team: TeamEntry;
  formation: string;
  played: number; wins: number; draws: number; losses: number;
  goalsFor: number; goalsAgainst: number; goalDiff: number;
  avgFor: number; avgAgainst: number;
  cleanSheets: number; failedToScore: number;
  homeWins: number; awayWins: number;
}

function PartidoPanel() {
  const [leagueId, setLeagueId] = useState("128");
  const [season,   setSeason]   = useState("2024");
  const [teams,    setTeams]    = useState<TeamEntry[]>([]);
  const [teamAId,  setTeamAId]  = useState("");
  const [teamBId,  setTeamBId]  = useState("");
  const [statsA,   setStatsA]   = useState<CachedStats | null>(null);
  const [statsB,   setStatsB]   = useState<CachedStats | null>(null);
  const [msg,      setMsg]      = useState<string | null>(null);

  useEffect(() => {
    setTeamAId("");
    setTeamBId("");
    setStatsA(null);
    setStatsB(null);
    setMsg(null);
    const cached = cacheGet<TeamEntry[]>(`pelotita_standings_${leagueId}_${season}`);
    setTeams(cached && cached.length > 0 ? cached : []);
  }, [leagueId, season]);

  function cargarEquipos() {
    setMsg(null);
    const list = cacheGet<TeamEntry[]>(`pelotita_standings_${leagueId}_${season}`);
    if (!list || !list.length) {
      setMsg("Sin datos cacheados. Ir a Tab 01 B → Comparador y cargar esta liga.");
      return;
    }
    setTeams(list);
    setStatsA(null); setStatsB(null);
    setTeamAId(""); setTeamBId("");
  }

  function verStats() {
    const a = cacheGet<CachedStats>(`pelotita_teamstats_${teamAId}_${leagueId}_${season}`);
    const b = cacheGet<CachedStats>(`pelotita_teamstats_${teamBId}_${leagueId}_${season}`);
    if (!a || !b) {
      setMsg("Stats no cacheadas. Ir a Tab 01 B → elegir estos equipos → COMPARAR primero.");
      return;
    }
    setStatsA(a); setStatsB(b); setMsg(null);
  }

  const hasStats = statsA && statsB;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-bg-card/60">
        <div className="font-mono text-[10px] text-orange tracking-widest flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-orange animate-pulse inline-block" />
          PARTIDO DEL DÍA
        </div>
      </div>

      {/* Selectores */}
      <div className="px-3 py-2 border-b border-bg-card/40 space-y-2">
        <div className="flex gap-2">
          <select value={leagueId} onChange={e => setLeagueId(e.target.value)}
            className="flex-1 bg-bg-deep border border-bg-card text-cream text-[10px] font-mono rounded px-1.5 py-1 focus:outline-none focus:border-orange/50 min-w-0">
            {LEAGUES.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <select value={season} onChange={e => setSeason(e.target.value)}
            className="bg-bg-deep border border-bg-card text-cream text-[10px] font-mono rounded px-1.5 py-1 focus:outline-none focus:border-orange/50 w-16">
            {SEASONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <button onClick={cargarEquipos}
          className="w-full py-1 border border-orange/40 text-orange font-mono text-[10px] rounded hover:bg-orange/10 transition-colors tracking-wider">
          CARGAR EQUIPOS (solo caché)
        </button>
        {teams.length > 0 && (
          <>
            <select value={teamAId} onChange={e => setTeamAId(e.target.value)}
              className="w-full bg-bg-deep border border-orange/30 text-cream text-[10px] font-mono rounded px-1.5 py-1 focus:outline-none focus:border-orange">
              <option value="">LOCAL —</option>
              {teams.map(t => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
            </select>
            <select value={teamBId} onChange={e => setTeamBId(e.target.value)}
              className="w-full bg-bg-deep border border-cream/20 text-cream text-[10px] font-mono rounded px-1.5 py-1 focus:outline-none focus:border-cream/40">
              <option value="">VISITANTE —</option>
              {teams.map(t => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
            </select>
            <button onClick={verStats} disabled={!teamAId || !teamBId}
              className="w-full py-1 bg-orange text-bg-deep font-mono font-bold text-[10px] rounded hover:bg-orange/80 transition-colors disabled:opacity-40 tracking-wider">
              ▶ VER STATS (solo caché)
            </button>
          </>
        )}
        {msg && <div className="text-yellow-400/80 text-[10px] font-mono leading-tight">{msg}</div>}
      </div>

      {/* Stats */}
      {hasStats && statsA && statsB && (
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {/* Team headers */}
          <div className="grid grid-cols-[1fr_110px_1fr] items-center mb-2 pb-2 border-b border-bg-card/60">
            <div className="flex items-center justify-end gap-1.5">
              {statsA.team.logo && <img src={statsA.team.logo} alt="" className="w-5 h-5 object-contain" />}
              <span className="font-mono text-[10px] font-bold text-orange text-right leading-tight">{statsA.team.name}</span>
            </div>
            <div className="font-mono text-[9px] text-cream/20 text-center">VS</div>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[10px] font-bold text-cream leading-tight">{statsB.team.name}</span>
              {statsB.team.logo && <img src={statsB.team.logo} alt="" className="w-5 h-5 object-contain" />}
            </div>
          </div>
          {/* Formation row */}
          <div className="grid grid-cols-[1fr_110px_1fr] py-1 border-b border-bg-deep/60 text-[10px]">
            <div className="text-right font-mono font-bold text-orange pr-1">{statsA.formation}</div>
            <div className="font-mono text-[9px] text-cream/30 tracking-wider text-center">FORMACIÓN</div>
            <div className="text-left font-mono font-bold text-cream pl-1">{statsB.formation}</div>
          </div>
          <StatBar label="VICTORIAS"    a={statsA.wins}          b={statsB.wins} />
          <StatBar label="EMPATES"      a={statsA.draws}         b={statsB.draws} />
          <StatBar label="DERROTAS"     a={statsA.losses}        b={statsB.losses}        higherIsBetter={false} />
          <StatBar label="GOL A FAVOR"  a={statsA.goalsFor}      b={statsB.goalsFor} />
          <StatBar label="GOL EN CONTRA" a={statsA.goalsAgainst} b={statsB.goalsAgainst}  higherIsBetter={false} />
          <StatBar label="DIF. GOLES"   a={statsA.goalDiff}      b={statsB.goalDiff}      fmt={v => v > 0 ? `+${v}` : String(v)} />
          <StatBar label="PROM. GOL"    a={statsA.avgFor}        b={statsB.avgFor} />
          <StatBar label="ARCO EN 0"    a={statsA.cleanSheets}   b={statsB.cleanSheets} />
          <StatBar label="VIC. LOCAL"   a={statsA.homeWins}      b={statsB.homeWins} />
          <StatBar label="VIC. VISITA"  a={statsA.awayWins}      b={statsB.awayWins} />
        </div>
      )}

      {!hasStats && !msg && teams.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-cream/15 font-mono text-[10px] text-center px-4">
            Cargá la liga y elegí los equipos del programa
          </span>
        </div>
      )}
    </div>
  );
}

// ── Panel: Notas en vivo ──────────────────────────────────────

const NOTAS_KEY = "pelotita_notas_en_vivo";

function NotasPanel() {
  const [text, setText] = useState("");
  const [saved, setSaved] = useState<Date | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(NOTAS_KEY);
    if (stored) setText(stored);
  }, []);

  function onChange(v: string) {
    setText(v);
    localStorage.setItem(NOTAS_KEY, v);
    setSaved(new Date());
  }

  function limpiar() {
    setText("");
    localStorage.removeItem(NOTAS_KEY);
    setSaved(null);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-bg-card/60 flex items-center justify-between">
        <div className="font-mono text-[10px] text-orange tracking-widest flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-orange animate-pulse inline-block" />
          NOTAS EN VIVO
        </div>
        <button onClick={limpiar} className="font-mono text-[9px] text-cream/20 hover:text-red-400 transition-colors">
          ✕ limpiar
        </button>
      </div>
      <textarea
        value={text}
        onChange={e => onChange(e.target.value)}
        placeholder={"Anotá ideas, datos, preguntas para tu socio…\n\nSe guarda automáticamente."}
        className="flex-1 bg-transparent text-cream text-xs font-sans p-3 resize-none focus:outline-none placeholder-cream/15 leading-relaxed"
      />
      <div className="px-3 py-1.5 border-t border-bg-card/40 font-mono text-[9px] text-cream/20">
        {saved
          ? `● guardado ${saved.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
          : "sin cambios"}
      </div>
    </div>
  );
}

// ── Panel: Mini pizarra ───────────────────────────────────────

type Mode = "move" | "arrow";

function MiniPizarraPanel() {
  const [localF,  setLocalF]  = useState("4-3-3");
  const [visitorF, setVisitorF] = useState("4-4-2");
  const [players, setPlayers] = useState<Player[]>([
    ...makeTeam("4-3-3", "local"),
    ...makeTeam("4-4-2", "visitor"),
  ]);
  const [arrows,     setArrows]     = useState<Arrow[]>([]);
  const [mode,       setMode]       = useState<Mode>("move");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [live,       setLive]       = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [arrowStart, setArrowStart] = useState<{ x: number; y: number } | null>(null);
  const [mousePos,   setMousePos]   = useState<{ x: number; y: number } | null>(null);
  const pitchRef = useRef<HTMLDivElement>(null);

  function toC(clientX: number, clientY: number) {
    const r = pitchRef.current!.getBoundingClientRect();
    return { x: clamp(((clientX - r.left) / r.width) * 68, 0, 68), y: clamp(((clientY - r.top) / r.height) * 105, 0, 105) };
  }

  function onPitchDown(e: React.PointerEvent) {
    if (mode !== "arrow") return;
    const c = toC(e.clientX, e.clientY);
    setArrowStart(c); setLive({ x1: c.x, y1: c.y, x2: c.x, y2: c.y });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPitchMove(e: React.PointerEvent) {
    const c = toC(e.clientX, e.clientY);
    setMousePos(c);
    if (mode !== "arrow" || !arrowStart) return;
    setLive({ x1: arrowStart.x, y1: arrowStart.y, x2: c.x, y2: c.y });
  }
  function onPitchUp(e: React.PointerEvent) {
    if (mode !== "arrow" || !arrowStart) return;
    const c = toC(e.clientX, e.clientY);
    if (Math.hypot(c.x - arrowStart.x, c.y - arrowStart.y) > 2)
      setArrows(prev => [...prev, { id: `a-${Date.now()}`, x1: arrowStart.x, y1: arrowStart.y, x2: c.x, y2: c.y }]);
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
    const c = toC(e.clientX, e.clientY);
    setPlayers(prev => prev.map(p => p.id === id ? { ...p, x: c.x, y: c.y } : p));
  }
  function onPlayerUp() { setDraggingId(null); }

  function applyF(team: "local" | "visitor", f: string) {
    setPlayers(prev => [...prev.filter(p => p.team !== team), ...makeTeam(f, team)]);
    team === "local" ? setLocalF(f) : setVisitorF(f);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b border-bg-card/60">
        <div className="font-mono text-[10px] text-orange tracking-widest flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-orange animate-pulse inline-block" />
          PIZARRA
        </div>
      </div>

      {/* Mini toolbar */}
      <div className="px-2 py-1.5 border-b border-bg-card/40 flex items-center gap-1 flex-wrap">
        {(["move", "arrow"] as Mode[]).map(m => (
          <button key={m} onClick={() => setMode(m)}
            className={["px-2 py-0.5 rounded border text-[9px] font-mono transition-colors",
              mode === m ? "bg-orange/20 border-orange text-orange" : "border-bg-card text-cream/30 hover:text-cream/60"].join(" ")}>
            {m === "move" ? "↖" : "→"}
          </button>
        ))}
        <div className="h-3 w-px bg-bg-card mx-0.5" />
        {/* Formation dropdowns compact */}
        <div className="flex items-center gap-1">
          <span className="font-mono text-[8px] text-orange/50">L</span>
          <select value={localF} onChange={e => applyF("local", e.target.value)}
            className="bg-bg-deep border border-bg-card text-cream text-[9px] font-mono rounded px-1 py-0.5 focus:outline-none w-16">
            {FORMATION_KEYS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1">
          <span className="font-mono text-[8px] text-cream/30">V</span>
          <select value={visitorF} onChange={e => applyF("visitor", e.target.value)}
            className="bg-bg-deep border border-bg-card text-cream text-[9px] font-mono rounded px-1 py-0.5 focus:outline-none w-16">
            {FORMATION_KEYS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <button onClick={() => setArrows([])} className="font-mono text-[9px] text-cream/20 hover:text-red-400 transition-colors ml-auto">✕</button>
        <button onClick={() => { setPlayers([...makeTeam(localF, "local"), ...makeTeam(visitorF, "visitor")]); setArrows([]); }}
          className="font-mono text-[9px] text-cream/20 hover:text-red-400 transition-colors">↺</button>
      </div>

      {/* Pitch */}
      <div className="flex-1 flex items-center justify-center p-2 overflow-hidden">
        <div ref={pitchRef} className="relative select-none"
          style={{ aspectRatio: "68/105", height: "100%", maxHeight: "500px", cursor: mode === "arrow" ? "none" : "default" }}
          onPointerDown={onPitchDown} onPointerMove={onPitchMove} onPointerUp={onPitchUp}
          onPointerLeave={() => setMousePos(null)}>
          <PitchSVG />
          <ArrowsOverlay arrows={arrows} live={live} onRemove={id => setArrows(prev => prev.filter(a => a.id !== id))} eraseMode={false} />
          {mode === "arrow" && mousePos && (
            <svg viewBox="0 0 68 105" className="absolute inset-0 w-full h-full" style={{ pointerEvents: "none", zIndex: 30 }}>
              <circle cx={mousePos.x} cy={mousePos.y} r="2" fill="none" stroke="#C8651B" strokeWidth="0.6" />
              <circle cx={mousePos.x} cy={mousePos.y} r="0.5" fill="#C8651B" />
              <line x1={mousePos.x} y1={mousePos.y - 3.5} x2={mousePos.x} y2={mousePos.y - 2.5} stroke="#C8651B" strokeWidth="0.5" />
              <line x1={mousePos.x} y1={mousePos.y + 2.5} x2={mousePos.x} y2={mousePos.y + 3.5} stroke="#C8651B" strokeWidth="0.5" />
              <line x1={mousePos.x - 3.5} y1={mousePos.y} x2={mousePos.x - 2.5} y2={mousePos.y} stroke="#C8651B" strokeWidth="0.5" />
              <line x1={mousePos.x + 2.5} y1={mousePos.y} x2={mousePos.x + 3.5} y2={mousePos.y} stroke="#C8651B" strokeWidth="0.5" />
            </svg>
          )}
          {players.map(p => {
            const isLocal   = p.team === "local";
            const isDragging = draggingId === p.id;
            return (
              <div key={p.id}
                style={{ position: "absolute", left: `${(p.x/68)*100}%`, top: `${(p.y/105)*100}%`,
                  transform: "translate(-50%,-50%)", zIndex: isDragging ? 20 : 10,
                  cursor: mode === "move" ? (isDragging ? "grabbing" : "grab") : "none", touchAction: "none" }}
                onPointerDown={e => onPlayerDown(e, p.id)}
                onPointerMove={e => onPlayerMove(e, p.id)}
                onPointerUp={onPlayerUp}>
                <div className={["w-6 h-6 rounded-full flex items-center justify-center",
                  "text-[7px] font-mono font-bold border-2 shadow-md transition-transform",
                  isDragging ? "scale-125" : "",
                  isLocal ? "bg-orange text-bg-deep border-warm-white" : "bg-[#2a2a3a] text-cream border-cream/60"].join(" ")}>
                  {p.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Panel central con tabs ────────────────────────────────────

type CenterTab = "fixture" | "stats";

function CenterPanel() {
  const [tab, setTab] = useState<CenterTab>("fixture");
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Tab switcher */}
      <div className="flex border-b border-bg-card/60 shrink-0">
        {(["fixture", "stats"] as CenterTab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={["flex-1 py-1.5 font-mono text-[9px] tracking-widest border-b-2 transition-colors",
              tab === t ? "text-orange border-orange bg-bg-card/20" : "text-cream/25 border-transparent hover:text-cream/50"].join(" ")}>
            {t === "fixture" ? "● FIXTURE" : "◎ STATS"}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-hidden">
        {tab === "fixture" ? <EspnFixtures /> : <PartidoPanel />}
      </div>
    </div>
  );
}

// ── Main: Sala en Vivo ────────────────────────────────────────

export default function EnVivoTab() {
  return (
    <div className="flex h-full overflow-hidden">
      {/* Pizarra */}
      <div className="w-[270px] shrink-0 border-r border-bg-card flex flex-col">
        <MiniPizarraPanel />
      </div>
      {/* Centro: Fixture ESPN + Stats caché */}
      <div className="w-[340px] shrink-0 border-r border-bg-card flex flex-col">
        <CenterPanel />
      </div>
      {/* Notas */}
      <div className="flex-1 flex flex-col">
        <NotasPanel />
      </div>
    </div>
  );
}
