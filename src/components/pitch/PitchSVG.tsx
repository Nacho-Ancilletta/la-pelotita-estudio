export function PitchSVG() {
  return (
    <svg viewBox="0 0 68 105" className="absolute inset-0 w-full h-full" style={{ display: "block" }}>
      <rect width="68" height="105" fill="#1B3A1B" />
      {[0, 1, 2, 3, 4, 5, 6].map(i =>
        i % 2 === 0 ? <rect key={i} x="0" y={i * 15} width="68" height="15" fill="#1E421E" /> : null
      )}
      <rect x="2" y="2" width="64" height="101" fill="none" stroke="#4a8a4a" strokeWidth="0.5" />
      <line x1="2" y1="52.5" x2="66" y2="52.5" stroke="#4a8a4a" strokeWidth="0.5" />
      <circle cx="34" cy="52.5" r="9.15" fill="none" stroke="#4a8a4a" strokeWidth="0.5" />
      <circle cx="34" cy="52.5" r="0.6" fill="#4a8a4a" />
      <rect x="13.84" y="2" width="40.32" height="16.5" fill="none" stroke="#4a8a4a" strokeWidth="0.5" />
      <rect x="24.84" y="2" width="18.32" height="5.5" fill="none" stroke="#4a8a4a" strokeWidth="0.5" />
      <circle cx="34" cy="13" r="0.6" fill="#4a8a4a" />
      <path d="M 26.88 18.5 A 9 9 0 0 1 41.12 18.5" fill="none" stroke="#4a8a4a" strokeWidth="0.5" />
      <rect x="27.5" y="0.5" width="13" height="2" fill="#163016" stroke="#4a8a4a" strokeWidth="0.5" />
      <rect x="13.84" y="86.5" width="40.32" height="16.5" fill="none" stroke="#4a8a4a" strokeWidth="0.5" />
      <rect x="24.84" y="97.5" width="18.32" height="5.5" fill="none" stroke="#4a8a4a" strokeWidth="0.5" />
      <circle cx="34" cy="92" r="0.6" fill="#4a8a4a" />
      <path d="M 26.88 86.5 A 9 9 0 0 0 41.12 86.5" fill="none" stroke="#4a8a4a" strokeWidth="0.5" />
      <rect x="27.5" y="102.5" width="13" height="2" fill="#163016" stroke="#4a8a4a" strokeWidth="0.5" />
      <path d="M 2 4 Q 2 2 4 2" fill="none" stroke="#4a8a4a" strokeWidth="0.5" />
      <path d="M 64 2 Q 66 2 66 4" fill="none" stroke="#4a8a4a" strokeWidth="0.5" />
      <path d="M 2 101 Q 2 103 4 103" fill="none" stroke="#4a8a4a" strokeWidth="0.5" />
      <path d="M 66 101 Q 66 103 64 103" fill="none" stroke="#4a8a4a" strokeWidth="0.5" />
    </svg>
  );
}
