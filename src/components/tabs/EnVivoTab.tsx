"use client";

import EspnFixtures from "@/components/EspnFixtures";

// ── Main: Sala en Vivo ────────────────────────────────────────
// Dedicada exclusivamente al fixture de ESPN. No agregar más
// pestañas/paneles acá sin que te lo pidan explícitamente.

export default function EnVivoTab() {
  return (
    <div className="h-full overflow-hidden">
      <EspnFixtures />
    </div>
  );
}
