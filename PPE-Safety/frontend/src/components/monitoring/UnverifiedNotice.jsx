import { EyeOff } from "lucide-react";

import { UNVERIFIED_LABEL } from "./legibility";

/**
 * The third state, inside a panel.
 *
 * Deliberately built to `EmptyState`'s shape — same medallion, same spacing,
 * same two lines of copy — so a screen that cannot be judged sits where the
 * "nothing to show" message used to sit and needs no relearning. Only the
 * palette differs, and it is the one thing that must: "Nobody in view" in
 * calm grey is exactly what a dark room used to render as.
 *
 * Colour is never the whole signal. The crossed-out eye and the words
 * "Cannot check" carry it on their own, with the AI's own reason underneath.
 */
export default function UnverifiedNotice({ reason, description, className = "" }) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 py-10 px-6 text-center ${className}`}
      role="status"
    >
      <span
        className="w-11 h-11 rounded-full bg-warning-soft border border-warning/25
                   flex items-center justify-center text-warning"
        aria-hidden="true"
      >
        <EyeOff size={20} />
      </span>

      <div className="space-y-1 max-w-sm">
        <p className="text-sm font-semibold text-warning">{UNVERIFIED_LABEL}</p>
        {reason && <p className="text-sm font-medium text-text">{reason}</p>}
        {description && (
          <p className="text-xs text-text-secondary leading-relaxed">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
