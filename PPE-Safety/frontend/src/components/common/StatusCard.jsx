import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  EyeOff,
  XCircle,
} from "lucide-react";

import { UNVERIFIED_LABEL } from "../monitoring/legibility";

/**
 * Status presets.
 *
 * Every status the platform can show maps to one of these five, so the same
 * state always looks the same wherever it appears. Labels are operator
 * language — "Watching", not "Inference running".
 */
const STATUS = {
  ok: {
    label: "All clear",
    icon: CheckCircle2,
    ring: "border-success/25",
    fill: "bg-success-soft",
    text: "text-success",
  },
  warning: {
    label: "Needs attention",
    icon: AlertTriangle,
    ring: "border-warning/25",
    fill: "bg-warning-soft",
    text: "text-warning",
  },
  /**
   * We could not look.
   *
   * The third state, and the reason this preset exists: an unjudgeable
   * picture used to render as the calm green one. Amber because that is
   * already the palette's "the system cannot tell you" colour — the same one
   * "Cannot reach the AI system" uses — and a crossed-out eye rather than a
   * warning triangle, so the two are told apart without reading the colour.
   * The label and the reason are always spelled out in words beside it.
   */
  unverified: {
    label: UNVERIFIED_LABEL,
    icon: EyeOff,
    ring: "border-warning/25",
    fill: "bg-warning-soft",
    text: "text-warning",
  },
  alert: {
    label: "Action required",
    icon: XCircle,
    ring: "border-danger/25",
    fill: "bg-danger-soft",
    text: "text-danger",
  },
  idle: {
    label: "Not watching",
    icon: CircleDashed,
    ring: "border-border",
    fill: "bg-subtle",
    text: "text-text-muted",
  },
};

/**
 * Prominent state card — the "is everything OK right now?" answer.
 *
 * Unlike StatisticsCard this leads with meaning rather than a number, and is
 * what a supervisor should be able to read from across the room.
 *
 * Live changes are announced politely to screen readers so an operator who
 * isn't looking at the screen still learns the state changed.
 */
export default function StatusCard({
  status = "idle",
  title,
  description,
  meta,
  action,
  pulse = false,
  className = "",
}) {
  const preset = STATUS[status] ?? STATUS.idle;
  const Icon = preset.icon;

  return (
    <div
      className={`rounded-xl border p-5 flex items-start gap-4 transition-colors
                  ${preset.ring} ${preset.fill} ${className}`}
      role="status"
      aria-live="polite"
    >
      <span
        className={`shrink-0 w-10 h-10 rounded-full bg-surface border ${preset.ring}
                    flex items-center justify-center ${preset.text}
                    ${pulse && status === "alert" ? "animate-pulse-danger" : ""}`}
        aria-hidden="true"
      >
        <Icon size={20} />
      </span>

      <div className="min-w-0 flex-1 space-y-1">
        {/* The state's own name, above whatever the module wanted to say.
            An unverified card leads with the reason — "Too dark to check." —
            which on its own could be read as a passing remark rather than as
            the state the screen is in, so the state is named as well. */}
        {status === "unverified" && title && (
          <p className={`text-[11px] font-semibold ${preset.text}`}>
            {preset.label}
          </p>
        )}

        <p className={`text-sm font-semibold ${preset.text}`}>
          {title ?? preset.label}
        </p>

        {description && (
          <p className="text-xs text-text-secondary leading-relaxed">
            {description}
          </p>
        )}

        {meta && <p className="text-[11px] text-text-muted pt-0.5">{meta}</p>}
      </div>

      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
