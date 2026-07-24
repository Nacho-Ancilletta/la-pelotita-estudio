"use client";

// ── En construcción — código anterior completo en RefuerzosTab.backup.tsx ──
// Imports y lógica viejos comentados acá abajo como referencia para reusar.

// import { useEffect, useState } from "react";
// import type { PlayerStat, PlayerPool } from "@/types/football";
// import { savePool, loadPool, clearPool, timeAgo } from "@/lib/playerCache";
// import { SOFA_TOURNAMENTS, getSeasons, getPlayerStats, type SofaSeason, type SofaPosition } from "@/lib/sofascore";
// import RefuerzosFootballPanel from "@/components/tabs/RefuerzosFootballPanel";

export default function RefuerzosTab() {
  return (
    <div className="flex flex-col h-full">
      {/* ── Header del tab ── */}
      <div className="border-b border-bg-card px-6 py-2.5">
        <h2 className="font-mono text-orange text-xs tracking-widest mb-0.5">
          TRACK 02 · BUSCADOR DE REFUERZOS
        </h2>
        <p className="text-cream/50 text-xs">En construcción</p>
      </div>

      {/* ── Placeholder ── */}
      <div className="flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="text-4xl opacity-20">⚽</div>
          <div className="font-mono text-cream/30 text-sm tracking-widest">
            BUSCADOR DE REFUERZOS · EN CONSTRUCCIÓN
          </div>
        </div>
      </div>
    </div>
  );
}
