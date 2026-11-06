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
      {entries.map(([value, count]) => (
        <div key={value} className="chart-row">
          <span className="chart-value">{value}</span>
          <div className="chart-track">
            <div className="chart-bar" style={{ width: `${(count / max) * 100}%` }} />
          </div>
          <span className="chart-count">{count} чел.</span>
        </div>
      ))}
    </div>
  );
}
