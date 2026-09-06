import { Link } from "react-router-dom";
import { ChevronRight, EyeOff } from "lucide-react";

import Badge from "../common/Badge";
import {
  readLegibility,
  UNVERIFIED_LABEL,
} from "../monitoring/legibility";

/**
 * What each monitoring capability is doing right now.
 *
 * Driven by the module registry, so a new capability appears here without any
 * change to this component. Each row links to its page — from "something is
 * wrong" to "look at it" in one click.
 */
export default function ModuleStatusGrid({ modules, results = {}, live = {} }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {modules.map((module) => {
        const { id, label, description, icon: Icon, path, available } = module;
        const result = results[id];

        // Frames actually arriving, as reported by the backend — not merely
        // "a model is loaded and we once got a result back". The second was
        // showing green "Watching" badges with every camera disconnected.
        const watching = Boolean(live[id]?.watching);
        const configured = Boolean(module.ready);

        // Whether this capability could read its picture at all. Same rule
        // as its own page, from the same helper, so the overview and the
        // module never disagree about what is being watched.
        const { unreadable, reason } = readLegibility(result);
        const blind = watching && unreadable;

        // A module's last result outlives the camera that produced it, so an
        // alert only means something while frames are still arriving.
        // Otherwise the last violation before someone closed the page stays on
        // screen in red for ever.
        const alerting = watching && Boolean(result?.alert) && !unreadable;

        return (
          <Link
            key={id}
            to={path}
            className={`group rounded-xl border p-4 flex items-start gap-3 transition-all
              ${
                alerting
                  ? "border-danger/30 bg-danger-soft hover:shadow-raised"
                  : blind
                    ? "border-warning/30 bg-warning-soft hover:shadow-raised"
                    : "border-border bg-surface hover:shadow-raised hover:border-border-strong"
              }`}
          >
            <span
              className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center
                ${
                  alerting
                    ? "bg-danger text-white"
                    : blind
                      ? "bg-warning text-white"
                      : available
                        ? "bg-primary-soft text-primary"
                        : "bg-subtle text-text-muted"
                }`}
              aria-hidden="true"
            >
              {blind ? <EyeOff size={18} /> : <Icon size={18} />}
            </span>

            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-text">{label}</p>

                {!available ? (
                  <Badge variant="neutral" dot={false}>
                    Coming soon
                  </Badge>
                ) : alerting ? (
                  <Badge variant="danger" pulse>
                    Action required
                  </Badge>
                ) : blind ? (
                  <Badge variant="warning">{UNVERIFIED_LABEL}</Badge>
                ) : watching ? (
                  <Badge variant="success">Watching</Badge>
                ) : configured ? (
                  <Badge variant="neutral">Set up, not watching</Badge>
                ) : (
                  <Badge variant="neutral">Not set up</Badge>
                )}
              </div>

              <p className="text-xs text-text-secondary leading-relaxed">
                {alerting && result?.summary
                  ? result.summary
                  : blind
                    ? reason
                    : description}
              </p>
            </div>

            <ChevronRight
              size={16}
              className="shrink-0 text-text-muted mt-2.5 transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </Link>
        );
      })}
    </div>
  );
}
