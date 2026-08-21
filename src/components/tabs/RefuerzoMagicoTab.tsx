"use client";

import { useEffect, useState } from "react";
import { getTeams, recommend, type RMTeam, type RMResult, type RMPosition } from "@/lib/refuerzo-magico";

// Escudo del club — ÚNICO elemento visual del círculo (pedido explícito:
// se sacaron las fotos de cara de jugador, fuente poco confiable — ver
// nota del bug al inicio de lib/refuerzo-magico.ts). Sin cascada a foto
// de jugador ni a ícono de persona: si no hay escudo (cruce de nombre
// contra ESPN no matcheó), cae directo a un ícono decorativo genérico —
// nunca un espacio roto, pero nunca una cara tampoco.
function ClubShield({ logoSrc, alt }: { logoSrc: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);
  const showLogo = !!logoSrc && !failed;
  return (
    <div className="w-20 h-20 rounded-full border-2 border-orange/40 bg-bg-deep overflow-hidden flex items-center justify-center shrink-0">
      {showLogo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoSrc ?? undefined} alt={alt} className="w-3/4 h-3/4 object-contain" onError={() => setFailed(true)} />
      ) : (
        <span className="text-3xl text-cream/20">🛡️</span>
      )}
    </div>
  );
}

// Cero campos vacíos: si no hay dato real, la fila entera desaparece —
// nada de "—" ni de etiqueta sin valor. row()/cardsRow() devuelven un
// array vacío cuando no hay dato, para poder spread-earlos directo en
// la lista y que no dejen rastro.
function row(label: string, v: number | null): { label: string; value: string }[] {
  return v == null ? [] : [{ label, value: String(v) }];
}
function cardsRow(y: number | null, r: number | null): { label: string; value: string }[] {
  if (y == null && r == null) return [];
  return [{ label: "Amarillas / Rojas", value: `${y ?? "—"} / ${r ?? "—"}` }];
}

function statRows(c: RMResult): { label: string; value: string }[] {
  const common = [...row("Minutos", c.minutes), ...row("Partidos", c.matches)];
  const byPosition: Record<RMPosition, { label: string; value: string }[]> = {
    ARQ: [
      ...row("Vallas invictas", c.cleanSheets),
      ...common,
      ...row("Paradas", c.saves),
      ...row("Goles concedidos", c.goalsConceded),
      ...row("Atajadas (por partido)", c.savesPerGame365),
      ...row("Goles recibidos (por partido)", c.goalsConcededPerGame365),
      ...row("Penales atajados", c.penaltisParados365),
    ],
    DEF: [
      ...row("Vallas invictas", c.cleanSheets),
      ...common,
      { label: "Asistencias", value: String(c.assists) },
      { label: "Goles", value: String(c.goals) },
      ...cardsRow(c.yellowCards, c.redCards),
      ...row("Duelos ganados", c.duelsWon),
      ...row("Entradas ganadas", c.tacklesWon),
      ...row("Intercepciones", c.interceptions),
      ...row("Rating 365", c.rating365),
      ...row("Duelos ganados (por partido)", c.duelsWonPerGame365),
      ...row("Intercepciones (por partido)", c.interceptionsPerGame365),
    ],
    VOL: [
      ...common,
      { label: "Asistencias", value: String(c.assists) },
      { label: "Goles", value: String(c.goals) },
      ...cardsRow(c.yellowCards, c.redCards),
      ...row("Pases clave", c.keyPasses),
      ...row("Regates completados", c.dribblesCompleted),
      ...row("Duelos ganados", c.duelsWon),
      ...row("xG", c.xg365),
      ...row("xA", c.xa365),
      ...row("Rating 365", c.rating365),
      ...row("Duelos ganados (por partido)", c.duelsWonPerGame365),
    ],
    DEL: [
      ...common,
      { label: "Asistencias", value: String(c.assists) },
      { label: "Goles", value: String(c.goals) },
      ...cardsRow(c.yellowCards, c.redCards),
      ...row("Tiros a puerta", c.shotsOnTarget),
      ...row("Regates completados", c.dribblesCompleted),
      ...row("Ocasiones creadas", c.bigChancesCreated),
      ...row("xG", c.xg365),
      ...row("xA", c.xa365),
      ...row("xG+xA combinado", c.xgXaCombined365),
      ...row("Rating 365", c.rating365),
      ...row("Penales convertidos", c.penaltisConvertidos365),
    ],
  };
  // Puntos Gran DT: dato estadístico más del jugador (no explica el
  // algoritmo, ya no filtra — ver nota del bug — solo suma bonus de
  // forma) — se agrega al final de la ficha en las 4 posiciones.
  return [...byPosition[c.position], ...row("Puntos Gran DT", c.grandTPoints)];
}

function CandidateCard({ candidate, isOpen, onToggle }: { candidate: RMResult; isOpen: boolean; onToggle: () => void }) {
  const scoreColor = candidate.fit.score >= 70 ? "text-green-400" : candidate.fit.score >= 45 ? "text-orange" : "text-cream/40";
  return (
    <div className="rounded-lg border border-bg-card bg-bg-card/10 overflow-hidden">
      <button onClick={onToggle} className="w-full flex flex-col items-center gap-2 p-4 text-center hover:bg-bg-card/20 transition-colors">
        <ClubShield logoSrc={candidate.teamLogo} alt={candidate.teamName} />
        <div className="font-mono text-cream text-xs font-bold leading-tight">{candidate.name}</div>
        <div className="font-mono text-cream/40 text-[10px]">{candidate.teamName}</div>
        <div className={["font-mono text-lg font-bold tabular-nums", scoreColor].join(" ")}>{candidate.fit.score}<span className="text-[10px] text-cream/30">/100 fit</span></div>
        <span className={["font-mono text-orange text-sm transition-transform", isOpen ? "rotate-180" : ""].join(" ")}>⌄</span>
      </button>

      {isOpen && (
        <div className="px-4 pb-4 border-t border-bg-card/60 pt-3 space-y-1">
          {candidate.age != null && (
            <div className="flex items-center justify-between font-mono text-[10px] pb-1 mb-1 border-b border-bg-card/40">
              <span className="text-cream/40">Edad</span>
              <span className="text-warm-white font-bold">{candidate.age} años</span>
            </div>
          )}
          {candidate.height != null && (
            <div className="flex items-center justify-between font-mono text-[10px] pb-1 mb-1 border-b border-bg-card/40">
              <span className="text-cream/40">Altura</span>
              <span className="text-warm-white font-bold">{candidate.height.toFixed(2).replace(".", ",")} m</span>
            </div>
          )}
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

export default function RefuerzoMagicoTab() {
  const [teams, setTeams] = useState<RMTeam[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [teamId, setTeamId] = useState<string>("");

  const [picks, setPicks] = useState<RMResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openCards, setOpenCards] = useState<Set<string>>(new Set());

  useEffect(() => {
    queueMicrotask(() => {
      setTeamsLoading(true);
      getTeams().then(setTeams).finally(() => setTeamsLoading(false));
    });
  }, []);

  function toggleCard(id: string) {
    setOpenCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function buscar() {
    const team = teams.find((t) => t.id === teamId);
    if (!team) return;
    setLoading(true);
    setError(null);
    setOpenCards(new Set());
    try {
      const r = await recommend(team);
      setPicks(r.picks);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al buscar refuerzo mágico");
      setPicks(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="h-full overflow-auto p-4">
      <div className="max-w-[1100px] mx-auto space-y-4">
        <div className="rounded-lg border border-bg-card bg-bg-card/10 p-4">
          <div className="font-mono text-orange text-xs tracking-widest mb-3">REFUERZO MÁGICO</div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] text-orange/70 tracking-widest">EQUIPO</span>
              <select
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                disabled={teamsLoading || teams.length === 0}
                className="bg-bg-deep border border-bg-card text-cream text-xs font-mono rounded px-2 py-1.5 focus:outline-none focus:border-orange/50 disabled:opacity-40 min-w-[220px]"
              >
                <option value="">{teamsLoading ? "cargando..." : "— elegir equipo —"}</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>

            <button
              onClick={buscar}
              disabled={!teamId || loading}
              className="bg-orange text-bg-deep font-mono font-bold text-xs px-4 py-2 rounded tracking-widest hover:bg-orange/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? "BUSCANDO..." : "BUSCAR REFUERZO MÁGICO"}
            </button>
          </div>

          {error && <div className="mt-3 text-red-400 font-mono text-[10px] bg-red-900/20 rounded p-2 border border-red-900/40">{error}</div>}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="font-mono text-orange text-sm animate-pulse">Buscando...</div>
          </div>
        )}

        {picks && !loading && (
          picks.length === 0 ? (
            <div className="text-cream/20 font-mono text-xs py-6 text-center">Sin candidatos disponibles.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {picks.map((c) => (
                <CandidateCard key={c.id} candidate={c} isOpen={openCards.has(c.id)} onToggle={() => toggleCard(c.id)} />
              ))}
            </div>
          )
        )}

        {!picks && !loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <div className="text-4xl opacity-20">✨</div>
          </div>
        )}
      </div>
    </div>
  );
}
