"use client";

import { useRef, useState } from "react";
import { PitchSVG }      from "@/components/pitch/PitchSVG";
import { ArrowsOverlay } from "@/components/pitch/ArrowsOverlay";
import { FORMATIONS, FORMATION_KEYS, makeTeam, clamp } from "@/components/pitch/formations";
import type { Player, Arrow } from "@/components/pitch/formations";
import ComparadorEquipos from "@/components/ComparadorEquipos";

type Mode    = "move" | "arrow";
type SubTab  = "pizarra" | "comparador" | "h2h";

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: "pizarra",    label: "A] PIZARRA TÁCTICA" },
  { id: "comparador", label: "B] COMPARADOR" },
  { id: "h2h",        label: "C] H2H" },
];

export default function TacticoTab() {
  const [subTab, setSubTab] = useState<SubTab>("pizarra");

  // ── Pizarra state ──────────────────────────────────────────
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
    const c = toCoords(e.clientX, e.clientY);
    setMousePos(c);
    if (mode !== "arrow" || !arrowStart) return;
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

  return (
    <div className="flex flex-col h-full">
      {/* Sub-tabs */}
      <div className="flex border-b border-bg-card/60 font-mono text-[10px]">
        {SUB_TABS.map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            className={["px-5 py-2 tracking-wider border-b-2 transition-colors",
              subTab === t.id ? "text-orange border-orange bg-bg-card/30" : "text-cream/30 border-transparent hover:text-cream/60"].join(" ")}>
            {t.label}
          </button>
        ))}
      </div>

      {subTab === "h2h" && (
        <div className="flex flex-col items-center justify-center flex-1 gap-2 text-cream/20 font-mono text-sm">
          <span>C] MANO A MANO</span><span className="text-xs">Próximamente</span>
        </div>
      )}

      {subTab === "comparador" && <ComparadorEquipos />}

      {subTab === "pizarra" && (
        <div className="flex flex-col flex-1 p-4 gap-3">
          {/* Toolbar */}
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
            {FORMATION_KEYS.map(f => (
              <button key={`l-${f}`} onClick={() => applyFormation("local", f)}
                className={["px-2 py-1 rounded text-[10px] font-mono border transition-colors",
                  localF === f ? "bg-orange/30 border-orange text-orange" : "border-bg-card text-cream/30 hover:text-cream/60"].join(" ")}>
                {f}
              </button>
            ))}
            <div className="h-4 w-px bg-bg-card mx-1" />
            <span className="font-mono text-[10px] text-cream/40">VISIT.</span>
            {FORMATION_KEYS.map(f => (
              <button key={`v-${f}`} onClick={() => applyFormation("visitor", f)}
                className={["px-2 py-1 rounded text-[10px] font-mono border transition-colors",
                  visitorF === f ? "bg-cream/20 border-cream/40 text-cream" : "border-bg-card text-cream/30 hover:text-cream/60"].join(" ")}>
                {f}
              </button>
            ))}
            <div className="ml-auto flex gap-2">
              <button onClick={() => setArrows([])}
                className="px-2 py-1 rounded border border-bg-card text-[10px] font-mono text-cream/30 hover:text-red-400 transition-colors">
                ✕ flechas
              </button>
              <button onClick={() => { setPlayers([...makeTeam(localF, "local"), ...makeTeam(visitorF, "visitor")]); setArrows([]); }}
                className="px-2 py-1 rounded border border-bg-card text-[10px] font-mono text-cream/30 hover:text-red-400 transition-colors">
                ↺ reset
              </button>
            </div>
          </div>

          {/* Pitch */}
          <div className="flex-1 flex items-start justify-center overflow-hidden">
            <div className="flex flex-col items-center gap-1">
              <span className="font-mono text-[10px] text-cream/30 tracking-widest">VISITANTE ▼</span>
              <div ref={pitchRef} className="relative select-none"
                style={{ aspectRatio: "68 / 105", height: "clamp(300px, calc(100vh - 260px), 560px)", cursor: mode === "arrow" ? "none" : "default" }}
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
                  const isLocal = p.team === "local";
                  const isDragging = draggingId === p.id;
                  return (
                    <div key={p.id}
                      style={{ position: "absolute", left: `${(p.x / 68) * 100}%`, top: `${(p.y / 105) * 100}%`,
                        transform: "translate(-50%, -50%)", zIndex: isDragging ? 20 : 10,
                        cursor: mode === "move" ? (isDragging ? "grabbing" : "grab") : "none", touchAction: "none" }}
                      onPointerDown={e => onPlayerDown(e, p.id)}
                      onPointerMove={e => onPlayerMove(e, p.id)}
                      onPointerUp={onPlayerUp}>
                      <div className={["w-7 h-7 rounded-full flex items-center justify-center",
                        "text-[8px] font-mono font-bold border-2 shadow-md transition-transform",
                        isDragging ? "scale-125" : "",
                        isLocal ? "bg-orange text-bg-deep border-warm-white" : "bg-[#2a2a3a] text-cream border-cream/60"].join(" ")}>
                        {p.label}
                      </div>
                    </div>
                  );
                })}
              </div>
              <span className="font-mono text-[10px] text-orange/50 tracking-widest">LOCAL ▲</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
