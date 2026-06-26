"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "pelotita_quota_remaining";

function getCacheStats() {
  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith("pelotita_"));
    const ligas    = new Set<string>();
    const equipos  = new Set<string>();
    let   jugadores = 0;

    for (const k of keys) {
      if (k.startsWith("pelotita_standings_")) ligas.add(k);
      if (k.startsWith("pelotita_teamstats_")) equipos.add(k);
      if (k === "pelotita_player_pool") {
        try {
          const pool = JSON.parse(localStorage.getItem(k) ?? "{}");
          jugadores = Array.isArray(pool?.players) ? pool.players.length : 0;
        } catch { /* ignore */ }
      }
    }
    return { ligas: ligas.size, equipos: equipos.size, jugadores };
  } catch {
    return { ligas: 0, equipos: 0, jugadores: 0 };
  }
}

export default function ApiQuotaCounter() {
  const [remaining, setRemaining] = useState<number | null>(null);
  const [cache, setCache] = useState({ ligas: 0, equipos: 0, jugadores: 0 });

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) setRemaining(parseInt(stored, 10));
    setCache(getCacheStats());

    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue !== null) {
        setRemaining(parseInt(e.newValue, 10));
      }
      // Refresh cache stats on any pelotita_ key change
      if (e.key?.startsWith("pelotita_")) setCache(getCacheStats());
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const color =
    remaining === null ? "text-cream/30" :
    remaining <= 10    ? "text-red-400"  :
    remaining <= 30    ? "text-yellow-400" :
    "text-orange";

  const hasCache = cache.ligas > 0 || cache.equipos > 0 || cache.jugadores > 0;

  return (
    <div className="flex items-center gap-4">
      {/* Despensa */}
      {hasCache && (
        <div className="font-mono text-right">
          <div className="text-[10px] text-cream/50 leading-snug">
            {cache.ligas > 0 && <span className="text-green-400/70">{cache.ligas}L </span>}
            {cache.equipos > 0 && <span className="text-green-400/70">{cache.equipos}E </span>}
            {cache.jugadores > 0 && <span className="text-green-400/70">{cache.jugadores}J</span>}
          </div>
          <div className="text-cream/20 text-[9px] leading-none">CACHÉ LOCAL</div>
        </div>
      )}
      {/* Quota */}
      <div className="font-mono text-xs text-right">
        <div className={`font-bold ${color}`}>
          {remaining === null ? "—" : remaining}
        </div>
        <div className="text-cream/25 text-[10px] leading-none">PEDIDOS HOY</div>
      </div>
    </div>
  );
}

/** Llamar después de cada fetch a la API */
export function updateQuota(remaining: number) {
  localStorage.setItem(STORAGE_KEY, String(remaining));
  window.dispatchEvent(
    new StorageEvent("storage", { key: STORAGE_KEY, newValue: String(remaining) })
  );
}
