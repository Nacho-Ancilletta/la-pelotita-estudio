"use client";

import { useEffect, useState } from "react";
import { getTeams, recommend, type RMTeam, type RMResult, type RMPosition } from "@/lib/refuerzo-magico";

// Cascada de foto (Paso 5): foto real de jugador (fichajes.com, única
// fuente con headshots reales — Promiedos/ESPN no exponen foto por
// jugador, confirmado a mano) → escudo del club (ESPN) → ícono genérico.
// Cada nivel cae al siguiente solo si falla la carga o no hay URL.
function PlayerPhoto({ src, logoSrc, alt }: { src: string | null; logoSrc: string | null; alt: string }) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const showPhoto = !!src && !photoFailed;
  const showLogo = !showPhoto && !!logoSrc && !logoFailed;
  return (
    <div className="w-20 h-20 rounded-full border-2 border-orange/40 bg-bg-deep overflow-hidden flex items-center justify-center shrink-0">
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src ?? undefined} alt={alt} className="w-full h-full object-cover" onError={() => setPhotoFailed(true)} />
      ) : showLogo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoSrc ?? undefined} alt={alt} className="w-3/4 h-3/4 object-contain" onError={() => setLogoFailed(true)} />
      ) : (
        <span className="text-3xl text-cream/20">👤</span>
      )}
    </div>
  );
}

// null = fichajes.com no tiene ese dato para este jugador puntual (solo
// lista el top ~20-24 de la liga por estadística, no a todos) — se
// muestra "—", nunca un 0 inventado.
function n(v: number | null): string { return v == null ? "—" : String(v); }
function cards(y: number | null, r: number | null): string {
  return y == null && r == null ? "—" : `${n(y)} / ${n(r)}`;
}
function heightStr(v: number | null): string { return v == null ? "—" : `${v.toFixed(2).replace(".", ",")} m`; }
function ageStr(v: number | null): string { return v == null ? "—" : `${v} años`; }

function statRows(c: RMResult): { label: string; value: string }[] {
  const common = [
    { label: "Minutos", value: n(c.minutes) },
    { label: "Partidos", value: n(c.matches) },
  ];
  const byPosition: Record<RMPosition, { label: string; value: string }[]> = {
    ARQ: [
      { label: "Vallas invictas", value: n(c.cleanSheets) },
      ...common,
      { label: "Paradas", value: n(c.saves) },
      { label: "Goles concedidos", value: n(c.goalsConceded) },
      { label: "Atajadas (por partido)", value: n(c.savesPerGame365) },
      { label: "Goles recibidos (por partido)", value: n(c.goalsConcededPerGame365) },
      { label: "Penales atajados", value: n(c.penaltisParados365) },
    ],
    DEF: [
      { label: "Vallas invictas", value: n(c.cleanSheets) },
      ...common,
      { label: "Asistencias", value: String(c.assists) },
      { label: "Goles", value: String(c.goals) },
      { label: "Amarillas / Rojas", value: cards(c.yellowCards, c.redCards) },
      { label: "Duelos ganados", value: n(c.duelsWon) },
      { label: "Entradas ganadas", value: n(c.tacklesWon) },
      { label: "Intercepciones", value: n(c.interceptions) },
      { label: "Rating 365", value: n(c.rating365) },
      { label: "Duelos ganados (por partido)", value: n(c.duelsWonPerGame365) },
      { label: "Intercepciones (por partido)", value: n(c.interceptionsPerGame365) },
    ],
    VOL: [
      ...common,
      { label: "Asistencias", value: String(c.assists) },
      { label: "Goles", value: String(c.goals) },
      { label: "Amarillas / Rojas", value: cards(c.yellowCards, c.redCards) },
      { label: "Pases clave", value: n(c.keyPasses) },
      { label: "Regates completados", value: n(c.dribblesCompleted) },
      { label: "Duelos ganados", value: n(c.duelsWon) },
      { label: "xG", value: n(c.xg365) },
      { label: "xA", value: n(c.xa365) },
      { label: "Rating 365", value: n(c.rating365) },
      { label: "Duelos ganados (por partido)", value: n(c.duelsWonPerGame365) },
    ],
    DEL: [
      ...common,
      { label: "Asistencias", value: String(c.assists) },
      { label: "Goles", value: String(c.goals) },
      { label: "Amarillas / Rojas", value: cards(c.yellowCards, c.redCards) },
      { label: "Tiros a puerta", value: n(c.shotsOnTarget) },
      { label: "Regates completados", value: n(c.dribblesCompleted) },
      { label: "Ocasiones creadas", value: n(c.bigChancesCreated) },
      { label: "xG", value: n(c.xg365) },
      { label: "xA", value: n(c.xa365) },
      { label: "xG+xA combinado", value: n(c.xgXaCombined365) },
      { label: "Rating 365", value: n(c.rating365) },
      { label: "Penales convertidos", value: n(c.penaltisConvertidos365) },
    ],
  };
  // Puntos Gran DT: dato estadístico más del jugador (no explica el
  // algoritmo, antes se usaba solo puertas adentro para filtrar/
  // desempatar) — se agrega al final de la ficha en las 4 posiciones.
  return [...byPosition[c.position], { label: "Puntos Gran DT", value: n(c.grandTPoints) }];
}

function CandidateCard({ candidate, isOpen, onToggle }: { candidate: RMResult; isOpen: boolean; onToggle: () => void }) {
  const scoreColor = candidate.fit.score >= 70 ? "text-green-400" : candidate.fit.score >= 45 ? "text-orange" : "text-cream/40";
  return (
    <div className="rounded-lg border border-bg-card bg-bg-card/10 overflow-hidden">
      <button onClick={onToggle} className="w-full flex flex-col items-center gap-2 p-4 text-center hover:bg-bg-card/20 transition-colors">
        <PlayerPhoto src={candidate.photo} logoSrc={candidate.teamLogo} alt={candidate.name} />
        <div className="font-mono text-cream text-xs font-bold leading-tight">{candidate.name}</div>
        <div className="font-mono text-cream/40 text-[10px]">{candidate.teamName}</div>
        <div className={["font-mono text-lg font-bold tabular-nums", scoreColor].join(" ")}>{candidate.fit.score}<span className="text-[10px] text-cream/30">/100 fit</span></div>
        <span className={["font-mono text-orange text-sm transition-transform", isOpen ? "rotate-180" : ""].join(" ")}>⌄</span>
      </button>

      {isOpen && (
        <div className="px-4 pb-4 border-t border-bg-card/60 pt-3 space-y-1">
          <div className="flex items-center justify-between font-mono text-[10px] pb-1 mb-1 border-b border-bg-card/40">
            <span className="text-cream/40">Edad</span>
            <span className="text-warm-white font-bold">{ageStr(candidate.age)}</span>
          </div>
          <div className="flex items-center justify-between font-mono text-[10px] pb-1 mb-1 border-b border-bg-card/40">
            <span className="text-cream/40">Altura</span>
            <span className="text-warm-white font-bold">{heightStr(candidate.height)}</span>
          </div>
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
          <div className="font-mono text-orange text-xs tracking-widest mb-3">✨ REFUERZO MÁGICO</div>
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
