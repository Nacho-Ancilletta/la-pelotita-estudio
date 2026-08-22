"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getCombinadaFechaMatches, getSelectedPicks, saveSelectedPicks, evaluatePick, pppSelfCondition,
  getKnownResults, saveKnownResult,
  type ComboMatch, type ComboTeam, type MarketLean, type MarketSignal,
  type PppComparison, type PppCondition, type SelectedPick, type PickResult, type KnownResult,
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
function pickId(matchId: string, slot: string): string {
  return `${matchId}:${slot}`;
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

// Mercado clickeable — al elegirlo queda "en mi combinada" (ver sección al
// pie del tab). Sin signal (cobertura despareja de la fuente) no hay nada
// que elegir, queda como texto plano.
function MarketBlock({ title, market, signal, selected, onSelect }: {
  title: string; market: "over25" | "aem"; signal: MarketSignal | null;
  selected: boolean; onSelect: () => void;
}) {
  if (!signal) {
    return (
      <div className="rounded border border-bg-card bg-bg-deep/40 p-2.5 flex-1 min-w-0">
        <div className="font-mono text-[9px] text-cream/40 tracking-widest mb-1.5">{title}</div>
        <div className="font-mono text-[10px] text-cream/25">sin dato de la fuente para este equipo</div>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        "rounded border p-2.5 flex-1 min-w-0 text-left transition-colors",
        selected ? "border-orange bg-orange/10" : "border-bg-card bg-bg-deep/40 hover:border-orange/40",
      ].join(" ")}
    >
      <div className="font-mono text-[9px] text-cream/40 tracking-widest mb-1.5">{title}</div>
      <div className={["inline-block font-mono text-[10px] font-bold rounded px-1.5 py-0.5 border", leanBadgeClasses(signal.lean)].join(" ")}>
        {marketLabel(market, signal.lean)}
      </div>
      <div className="mt-1.5 font-mono text-[9px] text-cream/30 tabular-nums leading-relaxed">
        temporada {signal.seasonPct}%
        {signal.recentFormPct != null && <> · últimos 6 {signal.recentFormPct}%</>}
        {" · ajustado "}{signal.adjustedPct}%
      </div>
      {selected && <div className="mt-1.5 font-mono text-[9px] text-orange font-bold tracking-widest">EN MI COMBINADA ✓</div>}
    </button>
  );
}

// ── Fallback de AEM (y contexto en todos los partidos): cada equipo contra
// SÍ MISMO — ppp_local vs ppp_visitante propio, nunca contra el rival (así
// el texto siempre aclara de qué condición se trata, nunca "rinde más" a
// secas). Cubre los 30 equipos sin excepción (ventaja_local en el JSON). ──
function pppConditionLabel(cond: PppCondition, teamShort: string): string {
  if (cond === "parejo") return `${teamShort} rinde parecido de local y visitante`;
  return `${teamShort} rinde mejor de ${cond}`;
}
function pppConditionClasses(cond: PppCondition): string {
  return cond === "parejo"
    ? "text-cream/40 bg-bg-deep/60 border-bg-card"
    : "text-orange bg-orange/15 border-orange/40";
}

function PppComparisonBlock({ ppp, homeShort, awayShort, selectedHome, selectedAway, onSelectHome, onSelectAway }: {
  ppp: PppComparison; homeShort: string; awayShort: string;
  selectedHome: boolean; selectedAway: boolean;
  onSelectHome: () => void; onSelectAway: () => void;
}) {
  const homeCond = pppSelfCondition(ppp.home);
  const awayCond = pppSelfCondition(ppp.away);
  return (
    <div className="rounded border border-bg-card bg-bg-deep/40 p-2.5 flex-1 min-w-0">
      <div className="font-mono text-[9px] text-cream/40 tracking-widest mb-1.5">RENDIMIENTO LOCAL VS VISITANTE</div>
      <div className="flex flex-wrap gap-1 mb-1.5">
        <button
          type="button" onClick={onSelectHome}
          className={["font-mono text-[10px] font-bold rounded px-1.5 py-0.5 border transition-colors",
            selectedHome ? "border-orange bg-orange/20 text-orange" : pppConditionClasses(homeCond)].join(" ")}
        >
          {pppConditionLabel(homeCond, homeShort)}
        </button>
        <button
          type="button" onClick={onSelectAway}
          className={["font-mono text-[10px] font-bold rounded px-1.5 py-0.5 border transition-colors",
            selectedAway ? "border-orange bg-orange/20 text-orange" : pppConditionClasses(awayCond)].join(" ")}
        >
          {pppConditionLabel(awayCond, awayShort)}
        </button>
      </div>
      <div className="font-mono text-[9px] text-cream/30 tabular-nums leading-relaxed">
        PPP {homeShort} local {ppp.home.local} / visitante {ppp.home.visitante} · PPP {awayShort} local {ppp.away.local} / visitante {ppp.away.visitante}
      </div>
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

// ── Tarjeta de partido — cada mercado se elige por separado (no la tarjeta
// entera), se resalta si tiene algún pick guardado en "Mi combinada". ──────

function MatchCard({ match, matchPicks, onTogglePick }: {
  match: ComboMatch; matchPicks: SelectedPick[]; onTogglePick: (pick: SelectedPick) => void;
}) {
  const played = match.homeScore != null && match.awayScore != null;
  const homeShort = match.homeTeam.shortName || match.homeTeam.name;
  const awayShort = match.awayTeam.shortName || match.awayTeam.name;
  const pickedIds = new Set(matchPicks.map((p) => p.id));

  function toggleOver25() {
    const s = match.analysis?.over25;
    if (!s) return;
    onTogglePick({
      id: pickId(match.id, "over25"), matchId: match.id,
      homeTeam: homeShort, awayTeam: awayShort, startTime: match.startTime,
      marketTitle: "MÁS/MENOS 2.5 GOLES", marketLabel: marketLabel("over25", s.lean),
      kind: { type: "over25", predictedSide: s.adjustedPct >= 50 ? "over" : "under" },
    });
  }
  function toggleAem() {
    const s = match.analysis?.aem;
    if (!s) return;
    onTogglePick({
      id: pickId(match.id, "aem"), matchId: match.id,
      homeTeam: homeShort, awayTeam: awayShort, startTime: match.startTime,
      marketTitle: "AMBOS MARCAN (AEM)", marketLabel: marketLabel("aem", s.lean),
      kind: { type: "aem", predictedSide: s.adjustedPct >= 50 ? "si" : "no" },
    });
  }
  function togglePpp(team: "home" | "away") {
    const ppp = match.analysis?.pppComparison;
    if (!ppp) return;
    const cond = pppSelfCondition(team === "home" ? ppp.home : ppp.away);
    const teamShort = team === "home" ? homeShort : awayShort;
    onTogglePick({
      id: pickId(match.id, team === "home" ? "ppp_home" : "ppp_away"), matchId: match.id,
      homeTeam: homeShort, awayTeam: awayShort, startTime: match.startTime,
      marketTitle: "RENDIMIENTO LOCAL VS VISITANTE", marketLabel: pppConditionLabel(cond, teamShort),
      kind: { type: "ppp", team },
    });
  }

  return (
    <div className={[
      "rounded-lg border-2 bg-bg-card/10 overflow-hidden transition-colors p-4",
      matchPicks.length > 0 ? "border-orange bg-orange/5" : "border-bg-card",
    ].join(" ")}>
      {/* Hora + contador de picks */}
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-[10px] text-orange/70 shrink-0">{formatKickoff(match.startTime)}</span>
        {matchPicks.length > 0 && (
          <span className="font-mono text-[9px] text-orange font-bold tracking-widest shrink-0">
            {matchPicks.length} EN MI COMBINADA
          </span>
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
            <MarketBlock
              title="MÁS/MENOS 2.5 GOLES" market="over25" signal={match.analysis.over25}
              selected={pickedIds.has(pickId(match.id, "over25"))} onSelect={toggleOver25}
            />
            {match.analysis.aem ? (
              <MarketBlock
                title="AMBOS MARCAN (AEM)" market="aem" signal={match.analysis.aem}
                selected={pickedIds.has(pickId(match.id, "aem"))} onSelect={toggleAem}
              />
            ) : match.analysis.pppComparison ? (
              // AEM no cubre este partido (18/30 equipos) — se reemplaza por
              // PPP local vs visitante, que sí cubre los 30 (ventaja_local).
              <PppComparisonBlock
                ppp={match.analysis.pppComparison} homeShort={homeShort} awayShort={awayShort}
                selectedHome={pickedIds.has(pickId(match.id, "ppp_home"))}
                selectedAway={pickedIds.has(pickId(match.id, "ppp_away"))}
                onSelectHome={() => togglePpp("home")} onSelectAway={() => togglePpp("away")}
              />
            ) : null}
          </div>
          <div className="mt-2.5 font-mono text-[9px] text-cream/30 leading-relaxed space-y-0.5">
            {match.analysis.expectedTotalGoals != null && (
              <div>goles esperados del partido: <span className="text-cream/50 tabular-nums">{match.analysis.expectedTotalGoals}</span></div>
            )}
            {/* Cuando AEM sí está disponible, el PPP no ocupa un bloque propio
                — igual se muestra como contexto en todos los partidos, acá compacto. */}
            {match.analysis.aem && match.analysis.pppComparison && (
              <div>
                {pppConditionLabel(pppSelfCondition(match.analysis.pppComparison.home), homeShort)}
                {" · "}
                {pppConditionLabel(pppSelfCondition(match.analysis.pppComparison.away), awayShort)}
              </div>
            )}
            {match.analysis.ventajaLocalNote && <div>{match.analysis.ventajaLocalNote}</div>}
            {match.analysis.formTensionNotes.map((n, i) => <div key={i}>{n}</div>)}
          </div>
        </>
      ) : (
        <div className="text-cream/20 font-mono text-xs py-2">sin datos estadísticos para este partido</div>
      )}
    </div>
  );
}

// ── "Mi combinada" — lista de los mercados que el usuario fue eligiendo,
// con el resultado real (Promiedos, ya cargado en `matches`) apenas hay.
// Si el partido ya salió de la ventana "latest" (jornada siguiente
// arrancó), se usa el último resultado conocido cacheado en localStorage
// (ver getKnownResults/saveKnownResult) en vez de volver a "pendiente". ──

function ResultBadge({ result, score }: { result: PickResult; score: string | null }) {
  if (result === "pendiente") {
    return <span className="font-mono text-[10px] text-cream/30 shrink-0">pendiente</span>;
  }
  const cumplio = result === "cumplio";
  return (
    <span className={[
      "font-mono text-[10px] font-bold rounded px-1.5 py-0.5 border shrink-0",
      cumplio ? "text-orange bg-orange/15 border-orange/40" : "text-red-400 bg-red-900/20 border-red-900/40",
    ].join(" ")}>
      {score && <span className="tabular-nums mr-1">{score}</span>}
      {cumplio ? "cumplió ✓" : "no cumplió ✗"}
    </span>
  );
}

function MiCombinadaSection({ picks, matchesById, knownResults, onRemove }: {
  picks: SelectedPick[]; matchesById: Map<string, ComboMatch>; knownResults: Record<string, KnownResult>; onRemove: (id: string) => void;
}) {
  if (picks.length === 0) return null;
  const sorted = [...picks].sort((a, b) => (parseKickoff(a.startTime)?.getTime() ?? 0) - (parseKickoff(b.startTime)?.getTime() ?? 0));
  return (
    <div className="mt-8 border-t border-bg-card pt-5">
      <div className="font-mono text-[11px] text-orange tracking-widest mb-3">MI COMBINADA ({picks.length})</div>
      <div className="space-y-2">
        {sorted.map((p) => {
          const live = matchesById.get(p.matchId);
          const known = knownResults[p.matchId];
          const homeScore = live?.homeScore ?? known?.homeScore ?? null;
          const awayScore = live?.awayScore ?? known?.awayScore ?? null;
          const result = evaluatePick(p.kind, homeScore, awayScore);
          const score = homeScore != null && awayScore != null ? `${homeScore}-${awayScore}` : null;
          return (
            <div key={p.id} className="rounded border border-bg-card bg-bg-card/10 px-3 py-2.5 flex items-center gap-3 flex-wrap">
              <span className="font-mono text-[10px] text-cream/40 shrink-0 w-[100px]">{formatKickoff(p.startTime)}</span>
              <span className="font-mono text-xs text-cream shrink-0 min-w-[170px]">{p.homeTeam} vs {p.awayTeam}</span>
              <span className="font-mono text-[10px] text-cream/50 flex-1 min-w-[200px]">{p.marketTitle}: <span className="text-cream/70">{p.marketLabel}</span></span>
              <ResultBadge result={result} score={score} />
              <button
                type="button" onClick={() => onRemove(p.id)}
                className="font-mono text-[10px] text-cream/25 hover:text-cream/60 shrink-0 px-1"
                title="Sacar de mi combinada"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main: La Combinada de la Fecha ──────────────────────────────────────

export default function CombinadaFechaTab() {
  const [matches, setMatches] = useState<ComboMatch[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [picks, setPicks] = useState<SelectedPick[]>(() => getSelectedPicks());
  const [knownResults, setKnownResults] = useState<Record<string, KnownResult>>(() => getKnownResults());

  useEffect(() => {
    getCombinadaFechaMatches()
      .then((data) => {
        setMatches(data);
        setError(null);
        // Backfill: si algún partido con pick ya está jugado en esta carga,
        // se guarda su resultado — así sigue disponible en "Mi combinada"
        // aunque más adelante salga de la ventana "latest" de Promiedos.
        const pickedMatchIds = new Set(getSelectedPicks().map((p) => p.matchId));
        let changed = false;
        for (const m of data) {
          if (pickedMatchIds.has(m.id) && m.homeScore != null && m.awayScore != null) {
            saveKnownResult(m.id, m.homeScore, m.awayScore);
            changed = true;
          }
        }
        if (changed) setKnownResults(getKnownResults());
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error al buscar el fixture"))
      .finally(() => setLoading(false));
  }, []);

  function togglePick(pick: SelectedPick) {
    setPicks((prev) => {
      const exists = prev.some((p) => p.id === pick.id);
      const next = exists ? prev.filter((p) => p.id !== pick.id) : [...prev, pick];
      saveSelectedPicks(next);
      return next;
    });
  }
  function removePick(id: string) {
    setPicks((prev) => {
      const next = prev.filter((p) => p.id !== id);
      saveSelectedPicks(next);
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

  const picksByMatch = useMemo(() => {
    const m = new Map<string, SelectedPick[]>();
    for (const p of picks) m.set(p.matchId, [...(m.get(p.matchId) ?? []), p]);
    return m;
  }, [picks]);

  const matchesById = useMemo(() => new Map((matches ?? []).map((m) => [m.id, m])), [matches]);

  return (
    <div className="h-full overflow-auto p-4">
      <div className="max-w-[1200px] mx-auto">
        <div className="flex items-center justify-between mb-4 font-mono text-[10px] text-cream/40 tracking-widest">
          <span>Análisis estadístico — sin cuotas. Vos armás la combinada.</span>
          {matches && matches.length > 0 && (
            <span>{matches.length} partidos · {picks.length} marcados</span>
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
              <MatchCard key={m.id} match={m} matchPicks={picksByMatch.get(m.id) ?? []} onTogglePick={togglePick} />
            ))}
          </div>
        )}

        {!loading && !error && <MiCombinadaSection picks={picks} matchesById={matchesById} knownResults={knownResults} onRemove={removePick} />}
      </div>
    </div>
  );
}
