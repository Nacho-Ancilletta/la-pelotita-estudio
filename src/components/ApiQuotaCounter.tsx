"use client";

import { useEffect, useState } from "react";

function getCacheStats() {
  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith("pelotita_"));
    const ligas    = new Set<string>();
    const equipos  = new Set<string>();
    let   jugadores = 0;

    for (const k of keys) {
      if (k.startsWith("pelotita_sofa_standings_")) ligas.add(k);
      if (k.startsWith("pelotita_sofa_overall_")) equipos.add(k);
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
  const [cache, setCache] = useState({ ligas: 0, equipos: 0, jugadores: 0 });

  useEffect(() => {
    setCache(getCacheStats());
    const handler = (e: StorageEvent) => {
      if (e.key?.startsWith("pelotita_")) setCache(getCacheStats());
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const hasCache = cache.ligas > 0 || cache.equipos > 0 || cache.jugadores > 0;

  return (
    <div className="flex items-center gap-4">
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
      <div className="font-mono text-xs text-right">
        <div className="font-bold text-orange">SOFA</div>
        <div className="text-cream/25 text-[10px] leading-none">SIN LÍMITE</div>
      </div>
    </div>
  );
}
