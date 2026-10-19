// Векторные иллюстрации в стиле чертежа (лёгкие, без внешних изображений).

export function HeroFrame() {
  // Изометрия стального каркаса: колонны, ригели, связи, размерные линии
  const cols = [0, 1, 2, 3];
  const iso = (x: number, y: number, z: number) => [300 + (x - y) * 52, 300 + (x + y) * 30 - z * 62] as const;
  const line = (a: readonly [number, number], b: readonly [number, number], k: string, w = 3, color = "#9ec5f0", dash?: string) => (
    <line key={k} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={color} strokeWidth={w} strokeLinecap="round" strokeDasharray={dash} />
  );
  const els = [];
  for (const i of cols) {
    for (const j of [0, 2]) {
      els.push(line(iso(i * 1.6, j, 0), iso(i * 1.6, j, 3), `c${i}${j}`, 5, "#e6eef7"));
    }
    els.push(line(iso(i * 1.6, 0, 3), iso(i * 1.6, 1, 3.7), `r1${i}`, 4, "#5aa0e8"));
    els.push(line(iso(i * 1.6, 1, 3.7), iso(i * 1.6, 2, 3), `r2${i}`, 4, "#5aa0e8"));
  }
  for (const j of [0, 2]) els.push(line(iso(0, j, 3), iso(4.8, j, 3), `b${j}`, 4, "#e6eef7"));
  els.push(line(iso(0, 1, 3.7), iso(4.8, 1, 3.7), "ridge", 3, "#5aa0e8"));
  els.push(line(iso(0, 0, 0), iso(1.6, 0, 3), "x1", 2, "#e8590c"));
  els.push(line(iso(1.6, 0, 0), iso(0, 0, 3), "x2", 2, "#e8590c"));
  els.push(line(iso(0, 2.6, 0), iso(4.8, 2.6, 0), "dim", 1.5, "#8696a6", "6 5"));
  const t = iso(2.4, 2.9, 0);
  return (
    <svg viewBox="0 0 600 460" className="h-auto w-full" role="img" aria-label="Изометрия стального каркаса здания">
      {els}
      <text x={t[0]} y={t[1] + 24} fill="#8696a6" fontSize="14" textAnchor="middle" fontFamily="var(--font-plex-mono)">
        L = 24 000
      </text>
      {cols.map((i) => {
        const p = iso(i * 1.6, 0, 0);
        return <circle key={i} cx={p[0]} cy={p[1]} r="5" fill="#16202a" stroke="#9ec5f0" strokeWidth="2" />;
      })}
    </svg>
  );
}

export function WorkPlaceholder({ seed, label }: { seed: number; label: string }) {
  const h = 60 + (seed % 3) * 18;
  const spans = 3 + (seed % 3);
  return (
    <svg viewBox="0 0 320 180" className="h-full w-full" role="img" aria-label={label}>
      <rect width="320" height="180" fill="#eef3f8" />
      <g stroke="#c9d3dd" strokeWidth="1">
        {Array.from({ length: 16 }, (_, i) => (
          <line key={`v${i}`} x1={i * 20} y1="0" x2={i * 20} y2="180" />
        ))}
        {Array.from({ length: 9 }, (_, i) => (
          <line key={`h${i}`} x1="0" y1={i * 20} x2="320" y2={i * 20} />
        ))}
      </g>
      <g stroke="#1d5fa8" strokeWidth="3" fill="none">
        <line x1="30" y1="150" x2="290" y2="150" stroke="#8696a6" strokeDasharray="6 4" strokeWidth="1.5" />
        {Array.from({ length: spans + 1 }, (_, i) => {
          const x = 40 + (240 / spans) * i;
          return <line key={i} x1={x} y1="150" x2={x} y2={150 - h} stroke="#26323e" strokeWidth="4" />;
        })}
        <polyline points={`40,${150 - h} 160,${150 - h - 30} 280,${150 - h}`} />
        {Array.from({ length: spans }, (_, i) => {
          const x = 40 + (240 / spans) * i;
          return <line key={`d${i}`} x1={x} y1="150" x2={x + 240 / spans} y2={150 - h} stroke="#e8590c" strokeWidth="1.5" />;
        })}
      </g>
    </svg>
  );
}
