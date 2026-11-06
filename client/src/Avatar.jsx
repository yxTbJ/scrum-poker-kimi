const PALETTE = [
  '#2563eb',
  '#7c3aed',
  '#db2777',
  '#ea580c',
  '#16a34a',
  '#0891b2',
  '#ca8a04',
  '#dc2626',
  '#4f46e5',
  '#0d9488',
];

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export default function Avatar({ name, id, size = 32 }) {
  const words = name.trim().split(/\s+/);
  const initials = words
    .map((w) => [...w][0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const color = PALETTE[hashString(id || name) % PALETTE.length];
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      title={name}
    >
      <span className="avatar-bg" style={{ background: color }} />
      <span className="avatar-initials">{initials}</span>
    </span>
  );
}
