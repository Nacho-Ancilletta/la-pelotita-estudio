"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getCombinadaFechaMatches, getSelectedMatchIds, saveSelectedMatchIds,
  type ComboMatch, type ComboTeam, type MarketLean, type MarketSignal,
} from "@/lib/combinada-fecha";

// "DD-MM-YYYY HH:mm" (formato propio de Promiedos, ver lib/promiedos.ts) →
// Date real para ordenar, y a "Vie 22/08 · 21:00hs" para mostrar (mismo
// criterio que formatKickoff en GrandTTab.tsx).
function parseKickoff(startTime: string): Date | null {
  const m = startTime.match(/^(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2})$/);
  if (!m) return null;
  const [, dd, mm, yyyy, hh, min] = m;
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min));
}
function formatKickoff(startTime: string): string {
  const d = parseKickoff(startTime);
  if (!d) return startTime;
  const weekday = d.toLocaleDateString("es-AR", { weekday: "short" }).replace(".", "");
  const cap = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${cap} ${dd}/${mm} · ${hh}:${min}hs`;
}

// ── Mercado: badge + números crudos (temporada / últimos 6 / ajustado) ────

function leanBadgeClasses(lean: MarketLean): string {
  return lean === "parejo"
    ? "text-cream/40 bg-bg-deep/60 border-bg-card"
    : "text-orange bg-orange/15 border-orange/40";
}
function marketLabel(market: "over25" | "aem", lean: MarketLean): string {
  if (lean === "parejo") return "Parejo / sin tendencia clara";
  if (market === "over25") return lean === "favorable" ? "Más de 2.5: probable" : "Menos de 2.5: probable";
  return lean === "favorable" ? "AEM: sí probable" : "AEM: no probable";
}

function MarketBlock({ title, market, signal }: { title: string; market: "over25" | "aem"; signal: MarketSignal | null }) {
  return (
    <div className="rounded border border-bg-card bg-bg-deep/40 p-2.5 flex-1 min-w-0">
      <div className="font-mono text-[9px] text-cream/40 tracking-widest mb-1.5">{title}</div>
      {signal ? (
        <>
          <div className={["inline-block font-mono text-[10px] font-bold rounded px-1.5 py-0.5 border", leanBadgeClasses(signal.lean)].join(" ")}>
            {marketLabel(market, signal.lean)}
          </div>
          <div className="mt-1.5 font-mono text-[9px] text-cream/30 tabular-nums leading-relaxed">
            temporada {signal.seasonPct}%
            {signal.recentFormPct != null && <> · últimos 6 {signal.recentFormPct}%</>}
            {" · ajustado "}{signal.adjustedPct}%
          </div>
        </>
      ) : (
        // Cobertura despareja de la fuente (ej. ambos_marcan_AEM solo trae
        // 18/30 equipos) — "—" honesto, nunca se inventa un número.
        <div className="font-mono text-[10px] text-cream/25">sin dato de la fuente para este equipo</div>
      )}
    </div>
  );
}

// ── Un equipo dentro de la tarjeta (escudo + nombre) ───────────────────────

function TeamBlock({ team }: { team: ComboTeam }) {
  return (
    <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
      {team.logo ? (
        <img src={team.logo} alt="" className="w-11 h-11 object-contain" />
      ) : (
        <div className="w-11 h-11 rounded-full border border-bg-card flex items-center justify-center text-cream/20 font-mono text-[9px]">
          s/e
        </div>
      )}
      <span className="font-mono text-xs text-cream text-center leading-tight">{team.shortName || team.name}</span>
    </div>
  );
}

// ── Tarjeta de partido — clickeable entera, se resalta si está seleccionada ─

function MatchCard({ match, selected, onToggle }: { match: ComboMatch; selected: boolean; onToggle: () => void }) {
  const played = match.homeScore != null && match.awayScore != null;

  return (
    <div className={[
      "rounded-lg border-2 bg-bg-card/10 overflow-hidden transition-colors",
      selected ? "border-orange bg-orange/5" : "border-bg-card hover:border-orange/40",
    ].join(" ")}>
      <button onClick={onToggle} className="w-full p-4 text-left">
        {/* Hora + selección */}
        <div className="flex items-center justify-between mb-3">
          <span className="font-mono text-[10px] text-orange/70 shrink-0">{formatKickoff(match.startTime)}</span>
          {selected && (
            <span className="font-mono text-[9px] text-orange font-bold tracking-widest shrink-0">ELEGIDO ✓</span>
          )}
        </div>

        {/* Equipos + marcador */}
        <div className="flex items-center justify-between gap-2 mb-4">
          <TeamBlock team={match.homeTeam} />
          {played ? (
            <span className="font-mono font-bold text-warm-white tabular-nums shrink-0 px-2 text-lg">
              {match.homeScore} - {match.awayScore}
            </span>
          ) : (
            <span className="font-mono text-cream/25 shrink-0 px-2 text-xs">vs</span>
          )}
          <TeamBlock team={match.awayTeam} />
        </div>

        {/* Mercados */}
        {match.analysis ? (
          <>
            <div className="flex gap-2">
              <MarketBlock title="MÁS/MENOS 2.5 GOLES" market="over25" signal={match.analysis.over25} />
              <MarketBlock title="AMBOS MARCAN (AEM)" market="aem" signal={match.analysis.aem} />
            </div>
            <div className="mt-2.5 font-mono text-[9px] text-cream/30 leading-relaxed space-y-0.5">
              {match.analysis.expectedTotalGoals != null && (
                <div>goles esperados del partido: <span className="text-cream/50 tabular-nums">{match.analysis.expectedTotalGoals}</span></div>
              )}
              {match.analysis.ventajaLocalNote && <div>{match.analysis.ventajaLocalNote}</div>}
              {match.analysis.formTensionNotes.map((n, i) => <div key={i}>{n}</div>)}
            </div>
          </>
        ) : (
          <div className="text-cream/20 font-mono text-xs py-2">sin datos estadísticos para este partido</div>
        )}
      </button>
    </div>
  );
}

// ── Main: La Combinada de la Fecha ──────────────────────────────────────

export default function CombinadaFechaTab() {
  const [matches, setMatches] = useState<ComboMatch[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => getSelectedMatchIds());

  useEffect(() => {
    getCombinadaFechaMatches()
      .then((data) => { setMatches(data); setError(null); })
      .catch((e) => setError(e instanceof Error ? e.message : "Error al buscar el fixture"))
      .finally(() => setLoading(false));
  }, []);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      saveSelectedMatchIds(next);
      return next;
    });
  }

  const sorted = useMemo(() => {
    if (!matches) return [];
    return [...matches].sort((a, b) => {
      const da = parseKickoff(a.startTime)?.getTime() ?? 0;
      const db = parseKickoff(b.startTime)?.getTime() ?? 0;
      return da - db;
    });
  }, [matches]);

  return (
    <div className="h-full overflow-auto p-4">
      <div className="max-w-[1200px] mx-auto">
        <div className="flex items-center justify-between mb-4 font-mono text-[10px] text-cream/40 tracking-widest">
          <span>Análisis estadístico — sin cuotas. Vos armás la combinada.</span>
          {matches && matches.length > 0 && (
            <span>{matches.length} partidos · {selected.size} elegidos</span>
          )}
        </div>

        {loading && <div className="text-cream/25 font-mono text-xs py-10 text-center">buscando fixture de la fecha...</div>}
        {error && (
          <div className="text-red-400 font-mono text-xs bg-red-900/20 rounded p-3 border border-red-900/40">{error}</div>
        )}
        {!loading && !error && matches && matches.length === 0 && (
          <div className="text-cream/20 font-mono text-xs py-10 text-center">sin fixture cargado para la fecha actual</div>
        )}

        {!loading && !error && sorted.length > 0 && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {sorted.map((m) => (
              <MatchCard key={m.id} match={m} selected={selected.has(m.id)} onToggle={() => toggle(m.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
