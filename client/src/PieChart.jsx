const COLORS = [
  '#2563eb',
  '#7c3aed',
  '#db2777',
  '#ea580c',
  '#16a34a',
  '#0891b2',
  '#ca8a04',
  '#dc2626',
];

const RADIUS = 40;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function PieChart({ participants }) {
  const votes = participants.filter((p) => p.vote !== null && p.vote !== undefined);
  const total = votes.length;
  if (total === 0) return null;

  const counts = new Map();
  for (const p of votes) {
    counts.set(p.vote, (counts.get(p.vote) ?? 0) + 1);
  }
  const entries = [...counts.entries()].sort((a, b) => a[0] - b[0]);

  let offset = 0;
  const segments = entries.map(([value, count], index) => {
    const fraction = count / total;
    const segment = {
      value,
      count,
      color: COLORS[index % COLORS.length],
      dasharray: `${fraction * CIRCUMFERENCE} ${CIRCUMFERENCE}`,
      dashoffset: -offset * CIRCUMFERENCE,
      percent: Math.round(fraction * 1000) / 10,
    };
    offset += fraction;
    return segment;
  });

  return (
    <div className="pie">
      <h3>Доля голосов</h3>
      <div className="pie-body">
        <div className="pie-chart">
          <svg viewBox="0 0 100 100">
            <g transform="rotate(-90 50 50)">
              <circle cx="50" cy="50" r={RADIUS} className="pie-track" />
              {segments.map((s) => (
                <circle
                  key={s.value}
                  cx="50"
                  cy="50"
                  r={RADIUS}
                  className="pie-segment"
                  stroke={s.color}
                  strokeDasharray={s.dasharray}
                  strokeDashoffset={s.dashoffset}
                />
              ))}
            </g>
          </svg>
          <div className="pie-total">
            <b>{total}</b>
            <span>голосов</span>
          </div>
        </div>
        <ul className="pie-legend">
          {segments.map((s) => (
            <li key={s.value}>
              <span className="pie-dot" style={{ background: s.color }} />
              <span className="pie-value">{s.value}</span>
              <span className="pie-pct">{s.percent}%</span>
              <span className="pie-count">({s.count})</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
