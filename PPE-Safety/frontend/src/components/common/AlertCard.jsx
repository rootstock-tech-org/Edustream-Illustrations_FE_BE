import { Clock, MapPin } from "lucide-react";

import Badge from "./Badge";

const SEVERITY = {
  high: { variant: "danger", label: "Urgent", bar: "bg-danger" },
  medium: { variant: "warning", label: "Warning", bar: "bg-warning" },
  low: { variant: "primary", label: "Notice", bar: "bg-primary" },
};

/**
 * One safety event, with its evidence image.
 *
 * Used in the alert feed and in module event histories. The snapshot is the
 * point — an alert an operator cannot see is an alert they cannot act on — so
 * the thumbnail leads and the text supports it.
 *
 * `onClick` makes the whole card a button; without it the card is static.
 */
export default function AlertCard({
  title,
  location,
  time,
  severity = "low",
  snapshotUrl,
  acknowledged = false,
  onClick,
  className = "",
}) {
  const preset = SEVERITY[severity] ?? SEVERITY.low;

  const Wrapper = onClick ? "button" : "div";

  return (
    <Wrapper
      onClick={onClick}
      className={`w-full text-left glass rounded-xl
                  overflow-hidden flex items-stretch gap-0 shadow-panel
                  transition-shadow ${onClick ? "hover:shadow-raised" : ""}
                  ${className}`}
    >
      <span className={`w-1 shrink-0 ${preset.bar}`} aria-hidden="true" />

      {snapshotUrl ? (
        <img
          src={snapshotUrl}
          alt={`Snapshot from ${location || "camera"} at ${time}`}
          className="w-24 h-20 object-cover shrink-0 bg-subtle"
          loading="lazy"
        />
      ) : (
        <span
          className="w-24 h-20 shrink-0 bg-subtle flex items-center justify-center
                     text-[10px] text-text-muted text-center px-2"
        >
          No image
        </span>
      )}

      <div className="flex-1 min-w-0 p-3.5 flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-text leading-snug">{title}</p>
          <Badge variant={acknowledged ? "neutral" : preset.variant}>
            {acknowledged ? "Reviewed" : preset.label}
          </Badge>
        </div>

        <div className="flex items-center gap-3 text-xs text-text-secondary">
          {location && (
            <span className="flex items-center gap-1 min-w-0">
              <MapPin size={12} className="shrink-0" aria-hidden="true" />
              <span className="truncate">{location}</span>
            </span>
          )}
          {time && (
            <span className="flex items-center gap-1 shrink-0">
              <Clock size={12} aria-hidden="true" />
              {time}
            </span>
          )}
        </div>
      </div>
    </Wrapper>
  );
}
