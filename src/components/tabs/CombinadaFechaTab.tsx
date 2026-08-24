"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  getCombinadaFechaMatches, getSelectedPicks, saveSelectedPicks, evaluatePick,
  getKnownResults, saveKnownResult,
  type ComboMatch, type ComboTeam, type MarketLean, type MarketSignal,
  type PppComparison, type TeamPppSelf, type SelectedPick, type PickResult, type KnownResult,
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
// que elegir, queda como texto plano. Único mercado que sigue usando este
// bloque es Más/Menos 2.5 — AEM pasó a texto informativo (ver MatchCard).
function MarketBlock({ title, signal, selected, onSelect }: {
  title: string; signal: MarketSignal | null; selected: boolean; onSelect: () => void;
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
        {marketLabel("over25", signal.lean)}
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

// Pastilla clickeable: "Gana X de Local/Visitante" es siempre la chance de
// resultado en la condición que le toca jugar ESE partido — local siempre
// para el home, visitante siempre para el away, es estructural. El dato de
// en qué condición rinde MEJOR cada equipo (pueda coincidir o no con la que
// juega hoy) es información real y válida, pero va solo en el texto chico
// de abajo de la tarjeta (ventajaLocalNote) y en el hover de detalle —
// nunca reemplaza el texto del botón.
function pppMatchLabel(matchCond: "local" | "visitante", teamShort: string): string {
  return `Gana ${teamShort} de ${matchCond === "local" ? "Local" : "Visitante"}`;
}
const PPP_PILL_CLASSES = "text-orange bg-orange/15 border-orange/40 hover:border-orange";

// ── Hover de detalle — portal a document.body con position:fixed, así el
// overflow-hidden de MatchCard (y el overflow-auto del tab) nunca lo recorta.
// Se posiciona con la posición REAL del trigger en el viewport (no un valor
// fijo por columna): abre a la derecha si el trigger está en la mitad
// izquierda de la pantalla, a la izquierda si está en la mitad derecha, y se
// clampea dentro del viewport en ambos ejes — esto también resuelve mobile
// (una sola columna) sin lógica aparte. ────────────────────────────────────
function PppDetailTooltip({ anchorEl, detail, teamName, matchCond, onRequestClose }: {
  anchorEl: HTMLElement; detail: TeamPppSelf; teamName: string; matchCond: "local" | "visitante"; onRequestClose: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({ position: "fixed", top: -9999, left: -9999, visibility: "hidden" });

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const anchorRect = anchorEl.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const margin = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const openRight = anchorRect.left + anchorRect.width / 2 < vw / 2;
    let left = openRight ? anchorRect.left : anchorRect.right - cardRect.width;
    left = Math.min(Math.max(left, margin), Math.max(margin, vw - cardRect.width - margin));

    const openBelow = anchorRect.top < vh / 2;
    let top = openBelow ? anchorRect.bottom + margin : anchorRect.top - cardRect.height - margin;
    top = Math.min(Math.max(top, margin), Math.max(margin, vh - cardRect.height - margin));

    setStyle({ position: "fixed", left, top, visibility: "visible", zIndex: 50 });
  }, [anchorEl]);

  useEffect(() => {
    window.addEventListener("scroll", onRequestClose, true);
    window.addEventListener("resize", onRequestClose);
    return () => {
      window.removeEventListener("scroll", onRequestClose, true);
      window.removeEventListener("resize", onRequestClose);
    };
  }, [onRequestClose]);

  const row = (label: string, value: string) => (
    <div className="flex justify-between gap-3">
      <span className="text-cream/40">{label}</span>
      <span className="text-cream tabular-nums">{value}</span>
    </div>
  );
  const fmt = (v: number | null) => (v == null ? "—" : v.toFixed(2));
  // v puede ser negativo (ej. ventaja_local_pct/marcados_pct/defensa_pct de
  // un equipo con localía floja) — anteponer "+" a mano daba "+-30%".
  const signedPct = (v: number) => `${v >= 0 ? "+" : ""}${v}%`;

  return createPortal(
    <div
      ref={cardRef}
      style={style}
      className="w-64 rounded border border-orange/40 bg-bg-deep shadow-xl p-3 font-mono text-[10px] pointer-events-none space-y-1"
    >
      <div className="text-orange font-bold tracking-widest mb-1.5">
        {teamName.toUpperCase()} DE {matchCond === "local" ? "LOCAL" : "VISITANTE"}
      </div>
      {row("Ventaja de local", signedPct(detail.ventajaLocalPct))}
      {row("Goles de Local", signedPct(detail.marcadosPct))}
      {row("Goles Recibidos", signedPct(detail.defensaPct))}
      {row("Puntos por partido (L-V)", `${detail.local.toFixed(2)} · ${detail.visitante.toFixed(2)}`)}
      {row("Marca (L · V)", `${fmt(detail.marcadosLocalAvg)} · ${fmt(detail.marcadosVisitanteAvg)} goles/PJ`)}
      {row("Recibe (L · V)", `${fmt(detail.recibidosLocalAvg)} · ${fmt(detail.recibidosVisitanteAvg)} goles/PJ`)}
    </div>,
    document.body
  );
}

// Pastilla + trigger de hover/tap. El click de la pastilla sigue siendo
// "elegir este mercado" (comportamiento existente) — el hover/tap del detalle
// vive en el ícono "ⓘ" aparte (stopPropagation) para no pisar esa selección
// al tocar en mobile. En desktop, pasar el mouse por toda la pastilla alcanza.
function PppPill({ label, selected, onSelect, detail, teamName, matchCond }: {
  label: string; selected: boolean; onSelect: () => void;
  detail: TeamPppSelf; teamName: string; matchCond: "local" | "visitante";
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [showTip, setShowTip] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function openNow() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setShowTip(true);
  }
  function closeSoon() {
    closeTimer.current = setTimeout(() => setShowTip(false), 100);
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={onSelect}
        onMouseEnter={openNow}
        onMouseLeave={closeSoon}
        className={["font-mono text-[10px] font-bold rounded px-1.5 py-0.5 border transition-colors inline-flex items-center gap-1",
          selected ? "border-orange bg-orange/20 text-orange" : PPP_PILL_CLASSES].join(" ")}
      >
        {label}
        <span
          onClick={(e) => { e.stopPropagation(); setShowTip((v) => !v); }}
          className="inline-flex items-center justify-center w-3 h-3 rounded-full border border-current/50 text-[8px] leading-none shrink-0"
          aria-label={`detalle de ${teamName}`}
        >
          i
        </span>
      </button>
      {showTip && btnRef.current && (
        <PppDetailTooltip anchorEl={btnRef.current} detail={detail} teamName={teamName} matchCond={matchCond} onRequestClose={() => setShowTip(false)} />
      )}
    </>
  );
}

function PppComparisonBlock({ ppp, homeShort, awayShort, selectedHome, selectedAway, onSelectHome, onSelectAway }: {
  ppp: PppComparison; homeShort: string; awayShort: string;
  selectedHome: boolean; selectedAway: boolean;
  onSelectHome: () => void; onSelectAway: () => void;
}) {
  return (
    <div className="rounded border border-bg-card bg-bg-deep/40 p-2.5 flex-1 min-w-0">
      <div className="font-mono text-[9px] text-cream/40 tracking-widest mb-1.5">RENDIMIENTO LOCAL VS VISITANTE</div>
      <div className="flex flex-wrap gap-1 mb-1.5">
        <PppPill label={pppMatchLabel("local", homeShort)} matchCond="local" selected={selectedHome} onSelect={onSelectHome} detail={ppp.home} teamName={homeShort} />
        <PppPill label={pppMatchLabel("visitante", awayShort)} matchCond="visitante" selected={selectedAway} onSelect={onSelectAway} detail={ppp.away} teamName={awayShort} />
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
  function togglePpp(team: "home" | "away") {
    const ppp = match.analysis?.pppComparison;
    if (!ppp) return;
    const teamShort = team === "home" ? homeShort : awayShort;
    // Mismo texto que la pastilla clickeable (pppMatchLabel) — el snapshot en
    // "Mi combinada" tiene que coincidir con lo que el usuario vio al elegir.
    const label = pppMatchLabel(team === "home" ? "local" : "visitante", teamShort);
    onTogglePick({
      id: pickId(match.id, team === "home" ? "ppp_home" : "ppp_away"), matchId: match.id,
      homeTeam: homeShort, awayTeam: awayShort, startTime: match.startTime,
      marketTitle: "RENDIMIENTO LOCAL VS VISITANTE", marketLabel: label,
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
              title="MÁS/MENOS 2.5 GOLES" signal={match.analysis.over25}
              selected={pickedIds.has(pickId(match.id, "over25"))} onSelect={toggleOver25}
            />
            {/* RENDIMIENTO LOCAL VS VISITANTE va siempre acá — ventaja_local
                cubre los 30 equipos, nunca falta (a diferencia de AEM, que
                cubre 18/30 y ahora es solo una línea de texto más abajo). */}
            {match.analysis.pppComparison && (
              <PppComparisonBlock
                ppp={match.analysis.pppComparison} homeShort={homeShort} awayShort={awayShort}
                selectedHome={pickedIds.has(pickId(match.id, "ppp_home"))}
                selectedAway={pickedIds.has(pickId(match.id, "ppp_away"))}
                onSelectHome={() => togglePpp("home")} onSelectAway={() => togglePpp("away")}
              />
            )}
          </div>
          <div className="mt-2.5 font-mono text-[9px] text-cream/30 leading-relaxed space-y-0.5">
            {match.analysis.expectedTotalGoals != null && (
              <div>goles esperados del partido: <span className="text-cream/50 tabular-nums">{match.analysis.expectedTotalGoals}</span></div>
            )}
            {match.analysis.ventajaLocalNote && <div>{match.analysis.ventajaLocalNote}</div>}
            {/* AEM ya no ocupa un bloque propio (cobertura 18/30) — cuando hay
                dato para los 2 equipos del partido, se suma como línea más
                acá; si no hay, se omite sin mensaje de "sin dato". */}
            {match.analysis.aem && (
              <div>
                Ambos marcan: {marketLabel("aem", match.analysis.aem.lean)}
                {" — temporada "}{match.analysis.aem.seasonPct}%
                {match.analysis.aem.recentFormPct != null && <> · últimos 6 {match.analysis.aem.recentFormPct}%</>}
              </div>
            )}
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
