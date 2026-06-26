export interface Player {
  id: string;
  label: string;
  x: number; // 0–68
  y: number; // 0–105
  team: "local" | "visitor";
}

export interface Arrow {
  id: string;
  x1: number; y1: number;
  x2: number; y2: number;
}

export const FORMATIONS: Record<string, { label: string; pos: [number, number] }[]> = {
  "4-3-3": [
    { label: "ARQ", pos: [34, 93] },
    { label: "LI",  pos: [10, 78] }, { label: "DFC", pos: [24, 82] }, { label: "DFC", pos: [44, 82] }, { label: "LD",  pos: [58, 78] },
    { label: "MC",  pos: [14, 57] }, { label: "MCC", pos: [34, 53] }, { label: "MC",  pos: [54, 57] },
    { label: "EI",  pos: [10, 27] }, { label: "DC",  pos: [34, 19] }, { label: "ED",  pos: [58, 27] },
  ],
  "4-4-2": [
    { label: "ARQ", pos: [34, 93] },
    { label: "LI",  pos: [10, 78] }, { label: "DFC", pos: [24, 82] }, { label: "DFC", pos: [44, 82] }, { label: "LD",  pos: [58, 78] },
    { label: "MI",  pos: [10, 56] }, { label: "MC",  pos: [26, 58] }, { label: "MC",  pos: [42, 58] }, { label: "MD",  pos: [58, 56] },
    { label: "DC",  pos: [24, 22] }, { label: "DC",  pos: [44, 22] },
  ],
  "3-5-2": [
    { label: "ARQ", pos: [34, 93] },
    { label: "DFC", pos: [20, 80] }, { label: "DFC", pos: [34, 83] }, { label: "DFC", pos: [48, 80] },
    { label: "MI",  pos: [8,  55] }, { label: "MC",  pos: [22, 51] }, { label: "MCC", pos: [34, 48] }, { label: "MC",  pos: [46, 51] }, { label: "MD",  pos: [60, 55] },
    { label: "DC",  pos: [24, 22] }, { label: "DC",  pos: [44, 22] },
  ],
  "4-2-3-1": [
    { label: "ARQ", pos: [34, 93] },
    { label: "LI",  pos: [10, 78] }, { label: "DFC", pos: [24, 82] }, { label: "DFC", pos: [44, 82] }, { label: "LD",  pos: [58, 78] },
    { label: "MDF", pos: [26, 63] }, { label: "MDF", pos: [42, 63] },
    { label: "EI",  pos: [12, 43] }, { label: "CAM", pos: [34, 40] }, { label: "ED",  pos: [56, 43] },
    { label: "DC",  pos: [34, 19] },
  ],
  "5-3-2": [
    { label: "ARQ", pos: [34, 93] },
    { label: "LI",  pos: [6,  73] }, { label: "DFC", pos: [18, 79] }, { label: "DFC", pos: [34, 82] }, { label: "DFC", pos: [50, 79] }, { label: "LD",  pos: [62, 73] },
    { label: "MC",  pos: [18, 54] }, { label: "MCC", pos: [34, 50] }, { label: "MC",  pos: [50, 54] },
    { label: "DC",  pos: [24, 22] }, { label: "DC",  pos: [44, 22] },
  ],
};

export const FORMATION_KEYS = Object.keys(FORMATIONS);

const TEAM_OFFSET = 4; // separates local/visitor so tokens don't overlap at mirrored positions

export function makeTeam(formation: string, team: "local" | "visitor"): Player[] {
  const data = FORMATIONS[formation] ?? FORMATIONS["4-3-3"];
  return data.map((d, i) => ({
    id: `${team}-${i}`,
    label: d.label,
    x: d.pos[0],
    y: team === "local"
      ? clamp(d.pos[1] + TEAM_OFFSET, 2, 103)
      : clamp(105 - d.pos[1] - TEAM_OFFSET, 2, 103),
    team,
  }));
}

export function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
