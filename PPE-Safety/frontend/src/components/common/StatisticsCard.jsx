import { Minus, TrendingDown, TrendingUp } from "lucide-react";

const TONES = {
  neutral: { value: "text-text", icon: "bg-subtle text-text-secondary" },
  primary: { value: "text-text", icon: "bg-primary-soft text-primary" },
  success: { value: "text-success", icon: "bg-success-soft text-success" },
  warning: { value: "text-warning", icon: "bg-warning-soft text-warning" },
  danger: { value: "text-danger", icon: "bg-danger-soft text-danger" },
};

/**
 * Single headline number with a label.
 *
 * The dashboard's basic unit — "Workers Monitored: 12", "Compliance: 94%".
 *
 * `trend` is optional and expects a direction plus a plain-language
 * description ("3 fewer than yesterday"), never a bare percentage: a number
 * with no baseline tells an operator nothing. `trendIsGood` decouples
 * direction from colour, because falling violations is good news and falling
 * compliance is not.
 */
export default function StatisticsCard({
  label,
  value,
  unit,
  hint,
  icon: Icon,
  tone = "neutral",
  trend,
  trendIsGood,
  loading = false,
  className = "",
}) {
  const palette = TONES[tone] ?? TONES.neutral;

  return (
    <div
      className={`glass rounded-xl p-5
                  flex items-start justify-between gap-4 ${className}`}
    >
      <div className="min-w-0 space-y-1.5">
        <p className="text-xs font-medium text-text-secondary">{label}</p>

        {loading ? (
          <div className="skeleton h-8 w-20 rounded-md" />
        ) : (
          <p className={`text-2xl font-semibold tracking-tight ${palette.value}`}>
            {value}
            {unit && (
              <span className="text-base font-medium text-text-muted ml-1">
                {unit}
              </span>
            )}
          </p>
        )}

        {trend && !loading && <Trend {...trend} isGood={trendIsGood} />}

        {hint && !trend && (
          <p className="text-xs text-text-muted">{hint}</p>
        )}
      </div>

      {Icon && (
        <span
          className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${palette.icon}`}
          aria-hidden="true"
        >
          <Icon size={18} />
        </span>
      )}
    </div>
  );
}

function Trend({ direction = "flat", label, isGood }) {
  const Icon =
    direction === "up" ? TrendingUp : direction === "down" ? TrendingDown : Minus;

  // Colour reflects whether the change is good news, not which way it points.
  const tone =
    isGood === undefined || direction === "flat"
      ? "text-text-muted"
      : isGood
        ? "text-success"
        : "text-danger";

  return (
    <p className={`flex items-center gap-1 text-xs font-medium ${tone}`}>
      <Icon size={13} aria-hidden="true" />
      {label}
    </p>
  );
}
