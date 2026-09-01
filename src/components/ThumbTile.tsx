// A branded gradient tile used in place of a real photo. The gradient is picked
// deterministically from the seed (source name), so each source looks consistent.
const PALETTES: [string, string][] = [
  ["#4f46e5", "#06b6d4"],
  ["#db2777", "#f97316"],
  ["#0ea5e9", "#22c55e"],
  ["#7c3aed", "#ec4899"],
  ["#0f766e", "#84cc16"],
  ["#b91c1c", "#f59e0b"],
  ["#1d4ed8", "#9333ea"],
  ["#059669", "#0ea5e9"],
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export default function ThumbTile({
  seed,
  label,
  className = "",
}: {
  seed: string;
  label: string;
  className?: string;
}) {
  const [a, b] = PALETTES[hash(seed) % PALETTES.length];
  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden ${className}`}
      style={{ background: `linear-gradient(135deg, ${a}, ${b})` }}
    >
      <span className="px-3 text-center text-sm font-semibold uppercase tracking-wide text-white/90 line-clamp-2">
        {label}
      </span>
    </div>
  );
}
