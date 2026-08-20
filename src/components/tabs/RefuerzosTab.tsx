"use client";

import { useEffect, useState } from "react";
import {
  getTeams, recommend, refreshRecommendation, getAllTeamXG, setTeamXG, REFUERZO_POSITIONS,
  type RefuerzoTeam, type RefuerzoPosition, type RefuerzoResult, type TeamXG,
} from "@/lib/refuerzos";

// ── Foto de jugador: ninguna de las fuentes integradas (Promiedos/ESPN)
// expone foto de cara de jugador — confirmado, no es limitación de
// implementación. Silueta genérica siempre, mismo marco circular que un
// escudo de equipo. ────────────────────────────────────────────────────
function PlayerPhoto() {
  return (
    <div className="w-20 h-20 rounded-full border-2 border-orange/40 bg-bg-deep overflow-hidden flex items-center justify-center shrink-0">
      <span className="text-3xl text-cream/20">👤</span>
    </div>
  );
}

// ── Filas de la ficha, exactamente los campos pedidos por posición. Los
// que ninguna fuente expone por jugador (vallas invictas, minutos,
// partidos, paradas) se muestran igual, en blanco — nunca inventados. ──
function statRows(c: RefuerzoResult): { label: string; value: string }[] {
  const dash = "—";
  const tarjetas = { label: "Amarillas / Rojas", value: `${c.yellowCards} / ${c.redCards}` };
  const goles = { label: "Goles", value: String(c.goals) };
  const asistencias = { label: "Asistencias", value: String(c.assists) };
  const byPosition: Record<RefuerzoPosition, { label: string; value: string }[]> = {
    ARQ: [
      { label: "Vallas invictas", value: dash },
      { label: "Minutos", value: dash },
      { label: "Partidos", value: dash },
      { label: "Paradas", value: dash },
    ],
    DEF: [
      { label: "Vallas invictas", value: dash },
      { label: "Minutos", value: dash },
      { label: "Partidos", value: dash },
      asistencias, goles, tarjetas,
    ],
    VOL: [
      { label: "Minutos", value: dash },
      { label: "Partidos", value: dash },
      asistencias, goles, tarjetas,
    ],
    DEL: [
      { label: "Minutos", value: dash },
      { label: "Partidos", value: dash },
      asistencias, goles, tarjetas,
    ],
  };
  return byPosition[c.position];
}

// ── Tarjeta de candidato, desplegable e independiente (no exclusiva).
// Solo estadísticas — nunca el motivo del puntaje. ──────────────────────

function CandidateCard({ candidate, isOpen, onToggle }: { candidate: RefuerzoResult; isOpen: boolean; onToggle: () => void }) {
  const scoreColor = candidate.fit.score >= 70 ? "text-green-400" : candidate.fit.score >= 45 ? "text-orange" : "text-cream/40";
  return (
    <div className="rounded-lg border border-bg-card bg-bg-card/10 overflow-hidden">
      <button onClick={onToggle} className="w-full flex flex-col items-center gap-2 p-4 text-center hover:bg-bg-card/20 transition-colors">
        <PlayerPhoto />
        <div className="font-mono text-cream text-xs font-bold leading-tight">{candidate.name}</div>
        <div className="font-mono text-cream/40 text-[10px]">{candidate.teamName}</div>
        <div className={["font-mono text-lg font-bold tabular-nums", scoreColor].join(" ")}>{candidate.fit.score}<span className="text-[10px] text-cream/30">/100 fit</span></div>
        <span className={["font-mono text-orange text-sm transition-transform", isOpen ? "rotate-180" : ""].join(" ")}>⌄</span>
      </button>

      {isOpen && (
        <div className="px-4 pb-4 border-t border-bg-card/60 pt-3 space-y-1">
          {statRows(candidate).map((r) => (
            <div key={r.label} className="flex items-center justify-between font-mono text-[10px]">
              <span className="text-cream/40">{r.label}</span>
              <span className="text-warm-white font-bold">{r.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Panel de xG manual (Paso 1) — colapsable, no invasivo ───────────────

function XGPanel({ teams }: { teams: RefuerzoTeam[] }) {
  const [open, setOpen] = useState(false);
  const [xgByTeam, setXgByTeam] = useState<Record<string, TeamXG>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftFor, setDraftFor] = useState("");
  const [draftAgainst, setDraftAgainst] = useState("");

  useEffect(() => { if (open) queueMicrotask(() => setXgByTeam(getAllTeamXG())); }, [open]);

  function startEdit(team: RefuerzoTeam) {
    const existing = xgByTeam[team.id];
    setDraftFor(existing ? String(existing.xGFor) : "");
    setDraftAgainst(existing ? String(existing.xGAgainst) : "");
    setEditingId(team.id);
  }
  function saveEdit(teamId: string) {
    const xGFor = parseFloat(draftFor) || 0;
    const xGAgainst = parseFloat(draftAgainst) || 0;
    setTeamXG(teamId, xGFor, xGAgainst);
    setXgByTeam(getAllTeamXG());
    setEditingId(null);
  }

  return (
    <div className="rounded-lg border border-bg-card bg-bg-card/10">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-bg-card/20 transition-colors">
        <span className="font-mono text-orange text-[10px] tracking-widest">⚙ DATOS DE xG (carga manual)</span>
        <span className={["font-mono text-orange text-xs transition-transform", open ? "rotate-180" : ""].join(" ")}>⌄</span>
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-bg-card/60 pt-3">
          <p className="font-mono text-cream/30 text-[9px] mb-2 leading-relaxed">
            Ninguna fuente integrada tiene xG — se carga a mano por equipo, sin vencimiento, se usa tal cual hasta que se edite.
          </p>
          <div className="max-h-[280px] overflow-y-auto">
            <table className="w-full text-[10px] font-mono">
              <thead className="text-cream/40 text-left">
                <tr><th className="py-1">Equipo</th><th className="text-center">xG a favor</th><th className="text-center">xG en contra</th><th /></tr>
              </thead>
              <tbody>
                {teams.map((t) => {
                  const xg = xgByTeam[t.id];
                  const isEditing = editingId === t.id;
                  return (
                    <tr key={t.id} className="border-t border-bg-deep/40">
                      <td className="py-1 text-cream">{t.name}</td>
                      {isEditing ? (
                        <>
                          <td className="text-center px-1">
                            <input value={draftFor} onChange={(e) => setDraftFor(e.target.value)} className="w-14 bg-bg-deep border border-orange/40 text-cream text-center rounded px-1" />
                          </td>
                          <td className="text-center px-1">
                            <input value={draftAgainst} onChange={(e) => setDraftAgainst(e.target.value)} className="w-14 bg-bg-deep border border-orange/40 text-cream text-center rounded px-1" />
                          </td>
                          <td className="text-center">
                            <button onClick={() => saveEdit(t.id)} className="text-green-400 hover:text-green-300 px-1">✓</button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="text-center text-warm-white">{xg ? xg.xGFor.toFixed(2) : "—"}</td>
                          <td className="text-center text-warm-white">{xg ? xg.xGAgainst.toFixed(2) : "—"}</td>
                          <td className="text-center">
                            <button onClick={() => startEdit(t)} className="text-cream/30 hover:text-orange px-1">editar</button>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
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

  const [result, setResult] = useState<{ candidates: RefuerzoResult[]; noDataForPosition: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openCards, setOpenCards] = useState<Set<string>>(new Set());

  useEffect(() => {
    queueMicrotask(() => {
      setTeamsLoading(true);
      getTeams()
        .then(setTeams)
        .catch((e) => setTeamsError(e instanceof Error ? e.message : "Error al buscar equipos"))
        .finally(() => setTeamsLoading(false));
    });
  }, []);

  function toggleCard(id: string) {
    setOpenCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function buscar(force = false) {
    const team = teams.find((t) => t.id === teamId);
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

  const selectedTeamName = teams.find((t) => t.id === teamId)?.name ?? "";

  return (
    <div className="h-full overflow-auto p-4">
      <div className="max-w-[1100px] mx-auto space-y-4">
        <XGPanel teams={teams} />

        {/* ── Buscador ── */}
        <div className="rounded-lg border border-bg-card bg-bg-card/10 p-4">
          <div className="font-mono text-orange text-xs tracking-widest mb-3">⚽ BUSCADOR DE REFUERZOS</div>
          <p className="font-mono text-cream/30 text-[10px] mb-3 leading-relaxed">
            Liga Profesional Argentina, temporada 2026 en curso (Promiedos). Sin foto de jugador en ninguna
            fuente disponible — silueta genérica. Arquero sin ranking: ninguna fuente expone estadística de
            arquero por jugador para esta liga.
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
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
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
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <div className="font-mono text-orange text-sm animate-pulse">Analizando necesidades de {selectedTeamName}...</div>
          </div>
        )}

        {result && !loading && (
          result.noDataForPosition ? (
            <div className="text-cream/20 font-mono text-xs py-6 text-center max-w-md mx-auto">
              Arquero no tiene ranking de candidatos: ninguna fuente expone estadística de arquero por jugador
              para la Liga Profesional Argentina. No se inventa el dato.
            </div>
          ) : result.candidates.length === 0 ? (
            <div className="text-cream/20 font-mono text-xs py-6 text-center">
              Sin candidatos con datos suficientes para esta posición esta fecha.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {result.candidates.map((c) => (
                <CandidateCard key={c.id} candidate={c} isOpen={openCards.has(c.id)} onToggle={() => toggleCard(c.id)} />
              ))}
            </div>
          )
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
