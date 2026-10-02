"use client";

type Point = { day: string; value: number };

/**
 * Courbe simple en SVG — aucune bibliothèque externe.
 * S'adapte au thème clair/sombre via `currentColor`.
 */
export function LineChart({
  series,
  height = 220,
  labels,
}: {
  series: { points: Point[]; color: string; label: string }[];
  height?: number;
  labels?: boolean;
}) {
  const toutes = series.flatMap((s) => s.points.map((p) => p.value));
  if (toutes.length === 0) {
    return <p className="text-sm text-slate-500">Aucune donnée à afficher.</p>;
  }

  const min = Math.min(...toutes);
  const max = Math.max(...toutes);
  const span = max - min || 1;
  const W = 1000;
  const H = height;
  const pad = 4;

  const chemin = (points: Point[]) =>
    points
      .map((p, i) => {
        const x = points.length === 1 ? W / 2 : (i / (points.length - 1)) * W;
        const y = H - pad - ((p.value - min) / span) * (H - pad * 2);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Évolution : ${series.map((s) => s.label).join(", ")}`}
      >
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1="0"
            x2={W}
            y1={H * f}
            y2={H * f}
            className="stroke-slate-200 dark:stroke-slate-800"
            strokeWidth="1"
          />
        ))}
        {series.map((s) => (
          <path
            key={s.label}
            d={chemin(s.points)}
            fill="none"
            stroke={s.color}
            strokeWidth="2.5"
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
          />
        ))}
      </svg>

      {labels !== false && (
        <div className="mt-3 flex flex-wrap gap-4">
          {series.map((s) => (
            <span key={s.label} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
              <span className="h-0.5 w-4 rounded" style={{ backgroundColor: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
