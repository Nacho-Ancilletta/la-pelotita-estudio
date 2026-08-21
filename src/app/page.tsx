"use client";

import { useState } from "react";
import TacticoTab from "@/components/tabs/TacticoTab";
import EnVivoTab from "@/components/tabs/EnVivoTab";
import GrandTTab from "@/components/tabs/GrandTTab";
import FantasyPremierTab from "@/components/tabs/FantasyPremierTab";
import RefuerzoMagicoTab from "@/components/tabs/RefuerzoMagicoTab";

const TABS = [
  { id: "tactico",   label: "AYUDANTE TÁCTICO" },
  { id: "vivo",      label: "FIXTURE" },
  { id: "grandt",    label: "GRAN DT" },
  { id: "fantasy",   label: "FANTASY PREMIER" },
  { id: "magico",    label: "REFUERZO MÁGICO" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>("tactico");

  return (
    <div className="flex flex-col flex-1">
      {/* ── Barra de tabs ── */}
      <div className="flex items-stretch border-b border-bg-card">
        <nav className="flex flex-1 font-mono text-xs">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={[
                  "flex items-center gap-2 px-5 py-3 tracking-wider transition-all border-b-2",
                  isActive
                    ? "bg-bg-card text-orange border-orange"
                    : "text-cream/40 border-transparent hover:text-cream/70 hover:bg-bg-card/40",
                ].join(" ")}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ── Contenido del tab activo ── */}
      <div className="flex-1 overflow-auto">
        {activeTab === "tactico"   && <TacticoTab />}
        {activeTab === "vivo"      && <EnVivoTab />}
        {activeTab === "grandt"    && <GrandTTab />}
        {activeTab === "fantasy"   && <FantasyPremierTab />}
        {activeTab === "magico"    && <RefuerzoMagicoTab />}
      </div>
    </div>
  );
}
