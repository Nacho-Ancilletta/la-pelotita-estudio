import type { PlayerPool } from "@/types/football";

const POOL_KEY = "pelotita_player_pool";

export function savePool(pool: PlayerPool): void {
  localStorage.setItem(POOL_KEY, JSON.stringify(pool));
}

export function loadPool(): PlayerPool | null {
  const stored = localStorage.getItem(POOL_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored) as PlayerPool;
  } catch {
    return null;
  }
}

export function clearPool(): void {
  localStorage.removeItem(POOL_KEY);
}

/** Devuelve "hace X minutos/horas/días" */
export function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 2)   return "hace un momento";
  if (mins < 60)  return `hace ${mins} min`;
  if (hours < 24) return `hace ${hours}h`;
  return `hace ${days}d`;
}
