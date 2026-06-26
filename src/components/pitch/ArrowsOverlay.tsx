import type { Arrow } from "./formations";

export function ArrowsOverlay({
  arrows,
  live,
  onRemove,
  eraseMode,
}: {
  arrows: Arrow[];
  live: { x1: number; y1: number; x2: number; y2: number } | null;
  onRemove: (id: string) => void;
  eraseMode: boolean;
}) {
  function path(x1: number, y1: number, x2: number, y2: number) {
    const cx = (x1 + x2) / 2 + (y2 - y1) * 0.12;
    const cy = (y1 + y2) / 2 - (x2 - x1) * 0.12;
    return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
  }
  return (
    <svg viewBox="0 0 68 105" className="absolute inset-0 w-full h-full" style={{ pointerEvents: "none" }}>
      <defs>
        <marker id="ah" markerWidth="5" markerHeight="4" refX="4.5" refY="2" orient="auto">
          <polygon points="0 0,5 2,0 4" fill="#C8651B" />
        </marker>
        <marker id="ah-live" markerWidth="5" markerHeight="4" refX="4.5" refY="2" orient="auto">
          <polygon points="0 0,5 2,0 4" fill="#FFEDAC" />
        </marker>
      </defs>
      {arrows.map(a => (
        <g
          key={a.id}
          style={{ pointerEvents: eraseMode ? "auto" : "none", cursor: eraseMode ? "pointer" : "default" }}
          onClick={() => eraseMode && onRemove(a.id)}
        >
          <path d={path(a.x1, a.y1, a.x2, a.y2)} stroke="transparent" strokeWidth="4" fill="none" />
          <path d={path(a.x1, a.y1, a.x2, a.y2)} stroke="#C8651B" strokeWidth="1.2" fill="none" markerEnd="url(#ah)" />
        </g>
      ))}
      {live && (
        <path
          d={path(live.x1, live.y1, live.x2, live.y2)}
          stroke="#FFEDAC" strokeWidth="0.8" fill="none"
          strokeDasharray="2 1.5" markerEnd="url(#ah-live)" opacity="0.6"
        />
      )}
    </svg>
  );
}
