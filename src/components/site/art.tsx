// Векторные иллюстрации в стиле чертежа (лёгкие, без внешних изображений).

export function HeroFrame() {
  // Изометрия стального каркаса: колонны, ригели, связи, размерные линии
  const cols = [0, 1, 2, 3];
  const iso = (x: number, y: number, z: number) => [300 + (x - y) * 52, 300 + (x + y) * 30 - z * 62] as const;
  const line = (a: readonly [number, number], b: readonly [number, number], k: string, w = 3, color = "#8fb4e0", dash?: string) => (
    <line key={k} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={color} strokeWidth={w} strokeLinecap="round" strokeDasharray={dash} />
  );
  const els = [];
  for (const i of cols) {
    for (const j of [0, 2]) {
      els.push(line(iso(i * 1.6, j, 0), iso(i * 1.6, j, 3), `c${i}${j}`, 5, "#eef2f6"));
    }
    els.push(line(iso(i * 1.6, 0, 3), iso(i * 1.6, 1, 3.7), `r1${i}`, 4, "#6d9bd3"));
    els.push(line(iso(i * 1.6, 1, 3.7), iso(i * 1.6, 2, 3), `r2${i}`, 4, "#6d9bd3"));
  }
  for (const j of [0, 2]) els.push(line(iso(0, j, 3), iso(4.8, j, 3), `b${j}`, 4, "#eef2f6"));
  els.push(line(iso(0, 1, 3.7), iso(4.8, 1, 3.7), "ridge", 3, "#6d9bd3"));
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
        return <circle key={i} cx={p[0]} cy={p[1]} r="5" fill="#202426" stroke="#8fb4e0" strokeWidth="2" />;
      })}
    </svg>
  );
}
