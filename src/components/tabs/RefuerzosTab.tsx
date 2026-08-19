"use client";

import { useEffect, useState } from "react";
import {
  getTeams, recommend, refreshRecommendation, REFUERZO_POSITIONS,
  type RefuerzoTeam, type RefuerzoPosition, type NeedProfile, type RefuerzoResult,
} from "@/lib/refuerzos";

// ── Foto de jugador circular, con silueta genérica si no hay foto o falla
// la carga (API-Football no siempre tiene foto para jugadores de ligas
// menores) — nunca un espacio roto. ──────────────────────────────────────
function PlayerPhoto({ src, alt }: { src: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);
  const showFallback = !src || failed;
  return (
    <div className="w-20 h-20 rounded-full border-2 border-orange/40 bg-bg-deep overflow-hidden flex items-center justify-center shrink-0">
      {showFallback ? (
        <span className="text-3xl text-cream/20">👤</span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} className="w-full h-full object-cover" onError={() => setFailed(true)} />
      )}
    </div>
  );
}

// ── Filas de estadísticas a mostrar en la ficha, según posición. Es un
// concern de UI (qué se muestra y en qué orden), separado del scoring que
// vive en lib/refuerzos.ts. Los rótulos con "(plan gratis...)" documentan
// sustituciones/limitaciones reales de la fuente, no maquillan el dato. ──
function statRows(c: RefuerzoResult): { label: string; value: string }[] {
  const common = [
    { label: "Edad", value: c.age != null ? `${c.age} años` : "—" },
    { label: "Minutos 2024", value: `${c.minutes} (${c.appearances} PJ)` },
    { label: "Rating prom.", value: c.rating != null ? c.rating.toFixed(2) : "—" },
  ];
  const byPosition: Record<RefuerzoPosition, { label: string; value: string }[]> = {
    ARQ: [
      { label: "Atajadas", value: String(c.saves) },
      { label: "% de atajadas", value: `${c.savePct}%` },
      { label: "Goles recibidos", value: String(c.goalsConceded) },
    ],
    DEF: [
      { label: "% duelos ganados", value: `${c.duelsWonPct}%` },
      { label: "Intercepciones", value: String(c.interceptions) },
      { label: "Bloqueos (proxy de despejes)", value: String(c.blocks) },
      { label: "Tarjetas", value: `${c.yellowCards}A / ${c.redCards}R` },
    ],
    VOL: [
      { label: "Pases clave", value: String(c.keyPasses) },
      { label: "% duelos ganados", value: `${c.duelsWonPct}%` },
      { label: "Recuperaciones (intercepciones)", value: String(c.interceptions) },
    ],
    DEL: [
      { label: "Goles", value: String(c.goals) },
      { label: "Asistencias", value: String(c.assists) },
      { label: "Tiros al arco", value: String(c.shotsOn) },
      { label: "% duelos ganados", value: `${c.duelsWonPct}%` },
    ],
  };
  return [...common, ...byPosition[c.position]];
}

// ── Tarjeta de candidato, desplegable e independiente (no exclusiva) ──

function CandidateCard({ candidate, isOpen, onToggle }: { candidate: RefuerzoResult; isOpen: boolean; onToggle: () => void }) {
  const scoreColor = candidate.fit.score >= 70 ? "text-green-400" : candidate.fit.score >= 45 ? "text-orange" : "text-cream/40";
  return (
    <div className="rounded-lg border border-bg-card bg-bg-card/10 overflow-hidden">
      <button onClick={onToggle} className="w-full flex flex-col items-center gap-2 p-4 text-center hover:bg-bg-card/20 transition-colors">
        <PlayerPhoto src={candidate.photo} alt={candidate.name} />
        <div className="font-mono text-cream text-xs font-bold leading-tight">{candidate.name}</div>
        <div className="font-mono text-cream/40 text-[10px]">{candidate.teamName}</div>
        <div className={["font-mono text-lg font-bold tabular-nums", scoreColor].join(" ")}>{candidate.fit.score}<span className="text-[10px] text-cream/30">/100 fit</span></div>
        <span className={["font-mono text-orange text-sm transition-transform", isOpen ? "rotate-180" : ""].join(" ")}>⌄</span>
      </button>

      {isOpen && (
        <div className="px-4 pb-4 border-t border-bg-card/60 pt-3 space-y-3">
          <div className="space-y-1">
            {statRows(candidate).map((r) => (
              <div key={r.label} className="flex items-center justify-between font-mono text-[10px]">
                <span className="text-cream/40">{r.label}</span>
                <span className="text-warm-white font-bold">{r.value}</span>
              </div>
            ))}
          </div>
          {candidate.injured && (
            <div className="font-mono text-[10px] text-red-400 bg-red-900/20 rounded p-1.5 border border-red-900/40">⚠ marcado como lesionado en la fuente</div>
          )}
          <div>
            <div className="font-mono text-[9px] text-orange/60 tracking-widest mb-1">POR QUÉ ENCAJA</div>
            {candidate.fit.reasons.length > 0 ? (
              <ul className="space-y-0.5">
                {candidate.fit.reasons.map((r) => (
                  <li key={r} className="font-mono text-[10px] text-cream/60">· {r}</li>
                ))}
              </ul>
            ) : (
              <div className="font-mono text-[10px] text-cream/25">ninguna estadística se destacó por encima del resto del pool</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Resumen del perfil de necesidad del equipo ──

function NeedSummary({ need }: { need: NeedProfile }) {
  return (
    <div className="rounded-lg border border-bg-card bg-bg-card/10 p-4">
      <div className="font-mono text-orange text-xs tracking-widest mb-2">📋 PERFIL DE NECESIDAD</div>
      <p className="font-mono text-cream/70 text-xs leading-relaxed">{need.summary}</p>
    </div>
  );
}

// ── Main: Buscador de Refuerzos ─────────────────────────────────────────

export default function RefuerzosTab() {
  const [teams, setTeams] = useState<RefuerzoTeam[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [teamsError, setTeamsError] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<string>("");
  const [position, setPosition] = useState<RefuerzoPosition>("DEL");

  const [result, setResult] = useState<{ need: NeedProfile; candidates: RefuerzoResult[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openCards, setOpenCards] = useState<Set<number>>(new Set());

  useEffect(() => {
    queueMicrotask(() => {
      setTeamsLoading(true);
      getTeams()
        .then(setTeams)
        .catch((e) => setTeamsError(e instanceof Error ? e.message : "Error al buscar equipos"))
        .finally(() => setTeamsLoading(false));
    });
  }, []);

  function toggleCard(id: number) {
    setOpenCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function buscar(force = false) {
    const team = teams.find((t) => String(t.id) === teamId);
    if (!team) return;
    setLoading(true);
    setError(null);
    setOpenCards(new Set());
    try {
      const r = force ? await refreshRecommendation(team, position) : await recommend(team, position);
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al buscar refuerzos");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="h-full overflow-auto p-4">
      <div className="max-w-[1100px] mx-auto space-y-4">
        {/* ── Buscador ── */}
        <div className="rounded-lg border border-bg-card bg-bg-card/10 p-4">
          <div className="font-mono text-orange text-xs tracking-widest mb-3">⚽ BUSCADOR DE REFUERZOS</div>
          <p className="font-mono text-cream/30 text-[10px] mb-3 leading-relaxed">
            Liga Profesional Argentina, temporada 2024 — última accesible en el plan gratis de API-Football
            (2025/2026 no están disponibles). Posiciones agrupadas en Arquero/Defensor/Mediocampista/Delantero:
            la fuente no distingue Lateral de Central ni Extremo de 9.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] text-orange/70 tracking-widest">EQUIPO</span>
              <select
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                disabled={teamsLoading || teams.length === 0}
                className="bg-bg-deep border border-bg-card text-cream text-xs font-mono rounded px-2 py-1.5 focus:outline-none focus:border-orange/50 disabled:opacity-40 min-w-[180px]"
              >
                <option value="">{teamsLoading ? "cargando equipos..." : "— elegir equipo —"}</option>
                {teams.map((t) => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
              </select>
            </label>

            <div className="flex flex-col gap-1">
              <span className="font-mono text-[10px] text-orange/70 tracking-widest">POSICIÓN</span>
              <div className="flex gap-1">
                {REFUERZO_POSITIONS.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => setPosition(p.key)}
                    className={["px-2.5 py-1.5 text-[10px] font-mono rounded border transition-colors",
                      position === p.key ? "bg-orange/20 border-orange text-orange" : "border-bg-card text-cream/40 hover:text-cream/70"].join(" ")}
                  >
                    {p.label.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => buscar(false)}
              disabled={!teamId || loading}
              className="bg-orange text-bg-deep font-mono font-bold text-xs px-4 py-2 rounded tracking-widest hover:bg-orange/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? "BUSCANDO..." : "BUSCAR REFUERZOS"}
            </button>

            {result && (
              <button
                onClick={() => buscar(true)}
                disabled={loading}
                className="font-mono text-[10px] text-cream/30 hover:text-orange transition-colors disabled:opacity-40"
              >
                ↺ recalcular
              </button>
            )}
          </div>

          {teamsError && <div className="mt-3 text-red-400 font-mono text-[10px] bg-red-900/20 rounded p-2 border border-red-900/40">{teamsError}</div>}
          {error && <div className="mt-3 text-red-400 font-mono text-[10px] bg-red-900/20 rounded p-2 border border-red-900/40">{error}</div>}
        </div>

        {/* ── Resultado ── */}
        {result && !loading && (
          <>
            <NeedSummary need={result.need} />

            {result.candidates.length === 0 ? (
              <div className="text-cream/20 font-mono text-xs py-6 text-center">
                Sin candidatos suficientes con los datos disponibles para esta posición — el pool de esta liga
                sale de goleadores/asistidores/amonestados, puede no cubrir bien Defensor/Mediocampista.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {result.candidates.map((c) => (
                  <CandidateCard key={c.id} candidate={c} isOpen={openCards.has(c.id)} onToggle={() => toggleCard(c.id)} />
                ))}
              </div>
            )}
          </>
        )}

        {!result && !loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <div className="text-4xl opacity-20">⚽</div>
            <div className="font-mono text-cream/30 text-sm">Elegí equipo y posición, después BUSCAR REFUERZOS</div>
          </div>
        )}
      </div>
    </div>
  );
}
