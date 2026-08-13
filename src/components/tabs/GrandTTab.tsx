"use client";

import { useEffect, useState } from "react";
import { getGrandTRanking, GRANDT_POSITIONS, type GrandTPosition, type GrandTPlayer } from "@/lib/grandt";
import { getGoleadores, getAsistencias, type PromiedosPlayerStat } from "@/lib/promiedos";

// Gran DT es sobre la Liga Profesional Argentina — no hay selector de liga
// en este tab, así que se cruza siempre contra esa.
const GRANDT_LEAGUE = "arg.1" as const;

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}
// La planilla de Gran DT nombra "Apellido, Nombre" — Promiedos da
// shortName = apellido solo. No hay ID compartido entre las dos fuentes,
// así que el cruce es por apellido normalizado (mejor esfuerzo, no 100%
// infalible con apellidos muy comunes, pero suficiente para un dato de
// contexto en vivo).
function surnameOf(sheetName: string): string {
  return sheetName.split(",")[0]?.trim() ?? sheetName;
}
function matchStat(playerName: string, stats: PromiedosPlayerStat[]): PromiedosPlayerStat | undefined {
  const surname = normalize(surnameOf(playerName));
  if (!surname) return undefined;
  return stats.find((s) => normalize(s.shortName) === surname);
}

// ── Cache ──────────────────────────────────────────────────────
// Mismo patrón que TacticoTab.tsx / EspnFixtures.tsx: ttlMs opcional
// wrapeado en {data,ts,ttlMs}; sin ttlMs, la entrada no expira nunca
// (URL configurada, jugador recomendado).
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

const RANKING_TTL_MS = 7 * 24 * 60 * 60 * 1000; // la planilla se publica una vez por fecha
const URL_KEY = "pelotita_grandt_sheet_url";
// Link vigente a la fecha 4 del Clausura 2026 — se pisa desde el campo de
// configuración del tab cada vez que planetagrandt.com.ar publica una fecha
// nueva (el link cambia de URL en cada publicación).
const DEFAULT_SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQar3txoFXtWCNwPoWL_2_z7ehHwxJmgFWEIIKoILxig9a7z8i3RxmbjLt8ioO_0PA5hbu_hIRHW-VW/pubhtml";

function rankingKey(sheetUrl: string, pos: GrandTPosition) {
  return `pelotita_grandt_ranking_${pos}_${encodeURIComponent(sheetUrl)}`;
}
function recoKey(pos: GrandTPosition) {
  return `pelotita_grandt_reco_${pos}`;
}

// ── Panel de una posición ─────────────────────────────────────

function PositionPanel({ posKey, label, sheetUrl, isOpen, onToggle, goleadores, asistencias }: {
  posKey: GrandTPosition; label: string; sheetUrl: string;
  isOpen: boolean; onToggle: () => void;
  goleadores: PromiedosPlayerStat[]; asistencias: PromiedosPlayerStat[];
}) {
  const [players,     setPlayers]     = useState<GrandTPlayer[] | null | undefined>(undefined);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [recommended, setRecommended] = useState(() => cacheGet<string>(recoKey(posKey)) ?? "");

  async function ensureLoaded() {
    if (players !== undefined) return;
    setLoading(true);
    setError(null);
    try {
      const key = rankingKey(sheetUrl, posKey);
      let list = cacheGet<GrandTPlayer[]>(key);
      if (!list) {
        list = await getGrandTRanking(sheetUrl, posKey);
        cacheSet(key, list, RANKING_TTL_MS);
      }
      setPlayers(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al buscar el ranking");
      setPlayers(null);
    } finally {
      setLoading(false);
    }
  }

  function handleToggle() {
    onToggle();
    if (!isOpen) ensureLoaded();
  }

  function handleRecommendedBlur(value: string) {
    setRecommended(value);
    cacheSet(recoKey(posKey), value);
  }

  return (
    <div className="rounded-lg border border-bg-card bg-bg-card/10 overflow-hidden">
      <button
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-bg-card/20 transition-colors"
      >
        <span className="font-mono text-sm text-cream tracking-widest">{label.toUpperCase()}</span>
        <span className={["font-mono text-orange text-lg transition-transform", isOpen ? "rotate-180" : ""].join(" ")}>⌄</span>
      </button>

      {isOpen && (
        <div className="px-5 pb-5 border-t border-bg-card/60 pt-4">
          {loading && <div className="text-cream/25 font-mono text-xs py-2">buscando ranking...</div>}
          {error && (
            <div className="text-red-400 font-mono text-xs bg-red-900/20 rounded p-3 border border-red-900/40 mb-3">{error}</div>
          )}
          {!loading && !error && players && players.length === 0 && (
            <div className="text-cream/20 font-mono text-xs py-2">sin datos en esta pestaña de la planilla</div>
          )}
          {!loading && players && players.length > 0 && (
            <div className="space-y-1 mb-4">
              {players.slice(0, 10).map((p, i) => {
                const goals   = matchStat(p.name, goleadores);
                const assists = matchStat(p.name, asistencias);
                return (
                  <div key={`${p.name}-${i}`} className="flex items-center gap-3 font-mono text-xs py-1 border-b border-bg-deep/40 last:border-0">
                    <span className="text-orange/70 w-5 text-right shrink-0">{i + 1}</span>
                    <span className="text-cream flex-1 truncate">{p.name}</span>
                    {(goals || assists) && (
                      <span className="text-cream/25 text-[10px] shrink-0 tabular-nums">
                        {goals && <>⚽{goals.value}</>}
                        {goals && assists && " "}
                        {assists && <>🅰{assists.value}</>}
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
              defaultValue={recommended}
              onBlur={(e) => handleRecommendedBlur(e.target.value)}
              placeholder="Escribí el recomendado..."
              className="w-full bg-bg-deep border border-bg-card text-cream text-xs font-mono rounded px-3 py-2 focus:outline-none focus:border-orange/50"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main: Gran DT ─────────────────────────────────────────────

export default function GrandTTab() {
  const [sheetUrl,  setSheetUrl]  = useState(() => cacheGet<string>(URL_KEY) ?? DEFAULT_SHEET_URL);
  const [urlDraft,  setUrlDraft]  = useState(sheetUrl);
  const [openPanel, setOpenPanel] = useState<GrandTPosition | null>(null);
  const [saved,     setSaved]     = useState(false);
  const [goleadores,  setGoleadores]  = useState<PromiedosPlayerStat[]>([]);
  const [asistencias, setAsistencias] = useState<PromiedosPlayerStat[]>([]);

  // Goleadores/asistencias reales de Liga Profesional (Promiedos) para
  // cruzar con los puntajes de Gran DT — se cachean 24hs adentro de
  // getGoleadores/getAsistencias, así que pedirlos acá de entrada es barato
  // (un solo fetch real por día, no por apertura de panel).
  useEffect(() => {
    getGoleadores(GRANDT_LEAGUE).then(setGoleadores).catch(() => setGoleadores([]));
    getAsistencias(GRANDT_LEAGUE).then(setAsistencias).catch(() => setAsistencias([]));
  }, []);

  function saveUrl() {
    const trimmed = urlDraft.trim();
    if (!trimmed) return;
    setSheetUrl(trimmed);
    cacheSet(URL_KEY, trimmed);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="h-full overflow-auto p-4">
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Config de la URL semanal */}
        <div className="rounded-lg border border-bg-card bg-bg-card/10 p-4">
          <label className="block font-mono text-[9px] text-orange/60 tracking-widest mb-2">
            LINK DE LA PLANILLA (planetagrandt.com.ar · se actualiza cada fecha)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/e/.../pubhtml"
              className="flex-1 bg-bg-deep border border-bg-card text-cream text-xs font-mono rounded px-3 py-2 focus:outline-none focus:border-orange/50"
            />
            <button
              onClick={saveUrl}
              className="px-4 py-2 font-mono text-xs text-cream/70 hover:text-orange border border-bg-card rounded transition-colors shrink-0"
            >
              {saved ? "✓ guardado" : "guardar"}
            </button>
          </div>
        </div>

        {/* 4 paneles desplegables */}
        <div className="space-y-3">
          {GRANDT_POSITIONS.map((p) => (
            <PositionPanel
              key={`${p.key}-${sheetUrl}`}
              posKey={p.key}
              label={p.label}
              sheetUrl={sheetUrl}
              isOpen={openPanel === p.key}
              onToggle={() => setOpenPanel((cur) => (cur === p.key ? null : p.key))}
              goleadores={goleadores}
              asistencias={asistencias}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
