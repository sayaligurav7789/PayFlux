export function LineChart({ data }) {
  if (!data.length) {
    return <div className="chart-empty">No data in the last 14 days.</div>;
  }

  const max = Math.max(...data.map((d) => d.value), 1);
  const w = 300;
  const h = 140;
  const padding = 10;

  const points = data.map((d, i) => {
    const x = padding + (i / Math.max(data.length - 1, 1)) * (w - padding * 2);
    const y = h - padding - (d.value / max) * (h - padding * 2 - 20);
    return { x, y, ...d };
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = `${pathD} L ${points[points.length - 1].x} ${h - padding} L ${points[0].x} ${h - padding} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: h }}>
      <path d={areaD} fill="var(--status-success)" opacity="0.08" />
      <path d={pathD} fill="none" stroke="var(--status-success)" strokeWidth="1.5" />
      {points.map((p) => (
        <circle key={p.label} cx={p.x} cy={p.y} r="2.5" fill="var(--status-success)" />
      ))}
      {points.map(
        (p, i) =>
          (i === 0 || i === points.length - 1 || i % Math.ceil(points.length / 5) === 0) && (
            <text
              key={`label-${p.label}`}
              x={p.x}
              y={h - 1}
              textAnchor="middle"
              fontSize="8"
              fill="var(--text-muted)"
              fontFamily="var(--font-mono)"
            >
              {p.label}
            </text>
          )
      )}
    </svg>
  );
}
