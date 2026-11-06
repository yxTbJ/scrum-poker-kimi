export default function VoteChart({ participants }) {
  const votes = participants.filter((p) => p.vote !== null && p.vote !== undefined);
  if (votes.length === 0) return null;

  const counts = new Map();
  for (const p of votes) {
    counts.set(p.vote, (counts.get(p.vote) ?? 0) + 1);
  }
  const entries = [...counts.entries()].sort((a, b) => a[0] - b[0]);
  const max = Math.max(...entries.map(([, count]) => count));

  return (
    <div className="chart">
      <h3>Распределение голосов</h3>
      <div className="chart-cols">
        {entries.map(([value, count]) => (
          <div key={value} className="chart-col">
            <div className="chart-col-count">{count}</div>
            <div className="chart-col-track">
              <div className="chart-col-bar" style={{ height: `${(count / max) * 100}%` }} />
            </div>
            <div className="chart-col-value">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
