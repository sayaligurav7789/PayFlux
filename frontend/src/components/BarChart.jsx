/**
 * Deliberately hand-rolled with plain SVG rather than a charting library
 * -- keeps the dependency list short and avoids another npm install
 * surface for a project that's already had its share of setup friction.
 */
export function BarChart({ data, colorFor }) {
  if (!data.length) {
    return <div className="chart-empty">No data yet.</div>;
  }

  const max = Math.max(...data.map((d) => d.value), 1);
  const width = 100 / data.length;

  return (
    <svg viewBox="0 0 300 160" style={{ width: '100%', height: 160 }}>
      {data.map((d, i) => {
        const barHeight = (d.value / max) * 120;
        const x = i * (300 / data.length) + 8;
        const barWidth = 300 / data.length - 16;
        return (
          <g key={d.label}>
            <rect
              x={x}
              y={140 - barHeight}
              width={barWidth}
              height={barHeight}
              rx={2}
              fill={colorFor ? colorFor(d.label) : 'var(--status-success)'}
            />
            <text
              x={x + barWidth / 2}
              y={155}
              textAnchor="middle"
              fontSize="9"
              fill="var(--text-muted)"
              fontFamily="var(--font-mono)"
            >
              {d.label}
            </text>
            <text
              x={x + barWidth / 2}
              y={140 - barHeight - 6}
              textAnchor="middle"
              fontSize="10"
              fill="var(--text-secondary)"
              fontFamily="var(--font-mono)"
            >
              {d.value}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
