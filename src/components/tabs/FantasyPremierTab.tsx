"use client";

import { useEffect, useState } from "react";
import {
  getFplData, rankFplPlayers, topScorers, topAssisters, FPL_POSITIONS,
  type FplPosition, type FplPlayer, type FplData, type FplUpcomingFixture,
} from "@/lib/fpl";
import { getTablaPosiciones, type PromiedosStandingRow } from "@/lib/promiedos";

// Premier League vía Promiedos para la tabla de posiciones: bootstrap-static
// de FPL trae los equipos en 0 (played/points/position) hasta que arranca
// la temporada — Promiedos ya tiene el parser de standings hecho (mismo que
// usa Gran DT), así que es la fuente más simple para esto.
const STANDINGS_LEAGUE = "eng.1" as const;

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}
// Texto libre del "recomendado" (nombre completo, solo apellido, cualquier
// orden) — match por inclusión en cualquier sentido, mismo criterio que
// Gran DT.
function textMatches(recommended: string, candidate: string): boolean {
  const r = normalize(recommended);
  if (!r) return false;
  const c = normalize(candidate);
  return c.includes(r) || r.includes(c);
}

// ── Cache ──────────────────────────────────────────────────────
// Mismo patrón que GrandTTab.tsx / EspnFixtures.tsx.
function cacheGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "data" in parsed && "ts" in parsed) {
      const { data, ts, ttlMs } = parsed as { data: T; ts: number; ttlMs?: number };
      if (ttlMs != null && Date.now() - ts > ttlMs) return null;
      return data;
    }
    return parsed as T;
  } catch { return null; }
}
function cacheSet(key: string, d: unknown, ttlMs?: number) {
  localStorage.setItem(key, JSON.stringify({ data: d, ts: Date.now(), ttlMs }));
}

const DATA_KEY = "pelotita_fpl_data";
const DATA_TTL_MS = 24 * 60 * 60 * 1000; // el ranking se actualiza una vez por fecha jugada

function recoKey(pos: FplPosition) {
  return `pelotita_fpl_reco_${pos}`;
}

// ── Columna lateral: Goleadores / Asistidores (bootstrap-static) ───

interface StatRow { id: number; name: string; club: string; value: number; }

function StatColumn({ title, icon, stats, recommendedNames }: {
  title: string; icon: string; stats: StatRow[]; recommendedNames: string[];
}) {
  return (
    <div className="rounded-lg border border-bg-card bg-bg-card/10 p-4">
      <div className="font-mono text-orange text-xs tracking-widest mb-3">{icon} {title.toUpperCase()}</div>
      {stats.length === 0 && <div className="text-cream/20 font-mono text-xs py-2">sin datos</div>}
      {stats.length > 0 && (
        <div className="space-y-1 max-h-[380px] overflow-y-auto pr-1">
          {stats.map((s, i) => {
            const isRecommended = recommendedNames.some((r) => textMatches(r, s.name));
            return (
              <div
                key={s.id}
                className={[
                  "flex items-center gap-2 font-mono text-[11px] py-1 px-1.5 rounded border-b border-bg-deep/40 last:border-0",
                  isRecommended ? "bg-orange/15 border-orange/40" : "",
                ].join(" ")}
              >
                <span className="text-orange/70 w-5 text-right shrink-0">{i + 1}</span>
                <span className={["flex-1 break-words leading-tight", isRecommended ? "text-orange font-bold" : "text-cream"].join(" ")}>{s.name}</span>
                <span className="text-cream/30 truncate max-w-[30%] shrink-0">{s.club}</span>
                <span className="text-warm-white font-bold tabular-nums w-6 text-right shrink-0">{s.value}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Columna lateral: tabla de posiciones única (Promiedos) ─────

function StandingsColumn({ rows }: { rows: PromiedosStandingRow[] }) {
  return (
    <div className="rounded-lg border border-bg-card bg-bg-card/10 p-4">
      <div className="font-mono text-orange text-xs tracking-widest mb-3">📊 PREMIER LEAGUE</div>
      {rows.length === 0 && <div className="text-cream/20 font-mono text-xs py-2">sin datos de Promiedos</div>}
      {rows.length > 0 && (
        <div className="space-y-1 max-h-[380px] overflow-y-auto pr-1">
          {rows.map((r) => (
            <div
              key={r.team.id}
              className="flex items-center gap-2 font-mono text-[11px] py-1 px-1.5 rounded border-b border-bg-deep/40 last:border-0"
            >
              <span className="text-orange/70 w-5 text-right shrink-0">{r.position}</span>
              <span className="flex-1 break-words leading-tight text-cream">{r.team.shortName || r.team.name}</span>
              <span className="text-cream/25 tabular-nums w-8 text-right shrink-0">{r.played}pj</span>
              <span className="text-warm-white font-bold tabular-nums w-6 text-right shrink-0">{r.points}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Columna lateral: próximos partidos, versión compacta ───────
// No es el fixture grande del tab Fixture — solo la gameweek más próxima,
// nombre de equipos + fecha/hora.

function UpcomingFixturesPanel({ fixtures }: { fixtures: FplUpcomingFixture[] }) {
  return (
    <div className="rounded-lg border border-bg-card bg-bg-card/10 p-4">
      <div className="font-mono text-orange text-xs tracking-widest mb-3">📅 PRÓXIMOS PARTIDOS</div>
      {fixtures.length === 0 && <div className="text-cream/20 font-mono text-xs py-2">sin fixture disponible</div>}
      {fixtures.length > 0 && (
        <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
          {fixtures.map((f, i) => {
            const d = f.kickoffTime ? new Date(f.kickoffTime) : null;
            const dateStr = d ? d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" }) : "";
            const timeStr = d ? d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) : "";
            return (
              <div key={i} className="font-mono text-[10px] border-b border-bg-deep/40 last:border-0 pb-2 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate flex-1 text-right text-cream">{f.teamH}</span>
                  <span className="text-cream/25 shrink-0 px-1">vs</span>
                  <span className="truncate flex-1 text-cream">{f.teamA}</span>
                </div>
                <div className="text-center text-cream/25 text-[9px] mt-0.5">{dateStr} · {timeStr}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Panel de una posición (centro) ──────────────────────────────

function PositionPanel({
  posKey, label, isOpen, onToggle, players, nextOpponentByTeamId,
  recommended, onRecommendedChange,
}: {
  posKey: FplPosition; label: string;
  isOpen: boolean; onToggle: () => void;
  players: FplPlayer[]; nextOpponentByTeamId: Record<number, string>;
  recommended: string; onRecommendedChange: (value: string) => void;
}) {
  const recTrim = recommended.trim();
  const recPlayer = recTrim.length > 0 ? players.find((p) => textMatches(recTrim, p.name)) : undefined;
  const nextOpponent = recPlayer ? nextOpponentByTeamId[recPlayer.clubId] : undefined;

  return (
    <div className="rounded-lg border border-bg-card bg-bg-card/10 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-bg-card/20 transition-colors"
      >
        <span className="font-mono text-sm text-cream tracking-widest">{label.toUpperCase()}</span>
        <span className={["font-mono text-orange text-lg transition-transform", isOpen ? "rotate-180" : ""].join(" ")}>⌄</span>
      </button>

      {isOpen && (
        <div className="px-5 pb-5 border-t border-bg-card/60 pt-4">
          {players.length === 0 && (
            <div className="text-cream/20 font-mono text-xs py-2">sin datos para esta posición</div>
          )}
          {players.length > 0 && (
            <div className="space-y-1 mb-4">
              {players.slice(0, 10).map((p, i) => {
                const isRecommended = recTrim.length > 0 && textMatches(recTrim, p.name);
                return (
                  <div
                    key={p.id}
                    className={[
                      "flex items-center gap-3 font-mono text-xs py-1 px-1.5 rounded border-b border-bg-deep/40 last:border-0",
                      isRecommended ? "bg-orange/15 border-orange/40" : "",
                    ].join(" ")}
                  >
                    <span className="text-orange/70 w-5 text-right shrink-0">{i + 1}</span>
                    <span className={["flex-1 truncate", isRecommended ? "text-orange font-bold" : "text-cream"].join(" ")}>{p.name}</span>
                    {(p.goals > 0 || p.assists > 0) && (
                      <span className="text-cream/25 text-[10px] shrink-0 tabular-nums">
                        {p.goals > 0 && <>⚽{p.goals}</>}
                        {p.goals > 0 && p.assists > 0 && " "}
                        {p.assists > 0 && <>🅰{p.assists}</>}
                      </span>
                    )}
                    <span className="text-cream/30 truncate max-w-[25%]">{p.club}</span>
                    <span className="text-warm-white font-bold tabular-nums w-10 text-right shrink-0">{p.points}</span>
                  </div>
                );
              })}
            </div>
          )}

          <div>
            <label className="block font-mono text-[9px] text-orange/60 tracking-widest mb-1">
              JUGADOR RECOMENDADO DE LA FECHA
            </label>
            <input
              type="text"
              value={recommended}
              onChange={(e) => onRecommendedChange(e.target.value)}
              placeholder="Escribí el recomendado..."
              className="w-full bg-bg-deep border border-bg-card text-cream text-xs font-mono rounded px-3 py-2 focus:outline-none focus:border-orange/50"
            />
            {recTrim && nextOpponent && (
              <div className="mt-1.5 font-mono text-[10px] text-orange/70">
                próximo rival: <span className="text-cream">{nextOpponent}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main: Fantasy Premier ───────────────────────────────────────

export default function FantasyPremierTab() {
  const [openPanel, setOpenPanel] = useState<FplPosition | null>(null);
  const [data, setData] = useState<FplData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [standingsRows, setStandingsRows] = useState<PromiedosStandingRow[]>([]);
  const [recommended, setRecommendedState] = useState<Record<FplPosition, string>>(() => {
    const init = {} as Record<FplPosition, string>;
    for (const p of FPL_POSITIONS) init[p.key] = cacheGet<string>(recoKey(p.key)) ?? "";
    return init;
  });

  function setRecommended(pos: FplPosition, value: string) {
    setRecommendedState((prev) => ({ ...prev, [pos]: value }));
    cacheSet(recoKey(pos), value);
  }

  // Un solo pedido para las 4 posiciones + goleadores/asistidores + próximos
  // partidos (bootstrap-static y fixtures ya traen todo) — a diferencia de
  // Gran DT no hace falta cargar por panel.
  useEffect(() => {
    const cached = cacheGet<FplData>(DATA_KEY);
    if (cached) { setData(cached); return; }
    setLoading(true);
    getFplData()
      .then((d) => { setData(d); cacheSet(DATA_KEY, d, DATA_TTL_MS); })
      .catch((e) => setError(e instanceof Error ? e.message : "Error al buscar el ranking"))
      .finally(() => setLoading(false));
  }, []);

  // Tabla de posiciones (Promiedos) — carga aparte, mismo criterio que Gran
  // DT: cachea internamente (lib/promiedos.ts, 5min TTL), pedirla de entrada
  // acá es barato.
  useEffect(() => {
    getTablaPosiciones(STANDINGS_LEAGUE).then((groups) => {
      setStandingsRows(groups[0]?.tables[0]?.rows ?? []);
    }).catch(() => setStandingsRows([]));
  }, []);

  const recommendedNames = Object.values(recommended).filter((v) => v.trim().length > 0);
  const goleadores: StatRow[] = data ? topScorers(data).map((p) => ({ id: p.id, name: p.name, club: p.club, value: p.goals })) : [];
  const asistidores: StatRow[] = data ? topAssisters(data).map((p) => ({ id: p.id, name: p.name, club: p.club, value: p.assists })) : [];

  return (
    <div className="h-full overflow-auto p-4">
      <div className="max-w-[1400px] mx-auto grid grid-cols-1 xl:grid-cols-[320px_1fr_320px] gap-4 items-start">
        {/* Columna izquierda: Goleadores / Asistidores (bootstrap-static) */}
        <div className="space-y-4 order-2 xl:order-1">
          <StatColumn title="Goleadores" icon="⚽" stats={goleadores} recommendedNames={recommendedNames} />
          <StatColumn title="Asistidores" icon="🅰" stats={asistidores} recommendedNames={recommendedNames} />
        </div>

        {/* Columna central: 4 paneles desplegables */}
        <div className="space-y-3 order-1 xl:order-2">
          {loading && <div className="text-cream/25 font-mono text-xs py-6 text-center">buscando ranking...</div>}
          {error && (
            <div className="text-red-400 font-mono text-xs bg-red-900/20 rounded p-3 border border-red-900/40">{error}</div>
          )}
          {!loading && !error && data && FPL_POSITIONS.map((p) => (
            <PositionPanel
              key={p.key}
              posKey={p.key}
              label={p.label}
              isOpen={openPanel === p.key}
              onToggle={() => setOpenPanel((cur) => (cur === p.key ? null : p.key))}
              players={rankFplPlayers(data, p.key)}
              nextOpponentByTeamId={data.nextOpponentByTeamId}
              recommended={recommended[p.key]}
              onRecommendedChange={(v) => setRecommended(p.key, v)}
            />
          ))}
        </div>

        {/* Columna derecha: tabla de posiciones + próximos partidos */}
        <div className="space-y-4 order-3">
          <StandingsColumn rows={standingsRows} />
          <UpcomingFixturesPanel fixtures={data?.upcomingFixtures ?? []} />
        </div>
      </div>
    </div>
  );
}
