import { Activity } from "lucide-react";

import Badge from "../common/Badge";
import Panel from "../common/Panel";

/**
 * Is the system itself working?
 *
 * Distinct from safety status: this answers "can I trust what the other
 * panels are telling me", which is the question to ask when a screen has been
 * quiet for an hour. Kept in plain language — no process names, no model
 * names, no percentages an operator cannot act on.
 */
export default function SystemHealthPanel({ status, reachable = true }) {
  const camera = status?.camera;
  const system = status?.system;

  const rows = [
    {
      label: "AI engine",
      ok: reachable && Boolean(status?.backend),
      okText: "Running",
      badText: "Not responding",
    },
    {
      label: "Camera",
      // A browser pushing its camera is as much a camera as one the server
      // captures itself; this row used to say "Not connected" over a live
      // picture arriving from an operator's phone.
      ok: Boolean(camera?.connected) || (camera?.browser_streams ?? 0) > 0,
      okText: "Connected",
      badText: "Not connected",
      neutral: true,
    },
    // Measured by actually reading the store, so a full or unwritable disk
    // shows up here rather than the next time someone opens the events page
    // and finds a morning's history missing.
    {
      label: "Safety history",
      ok: reachable && Boolean(status?.database),
      okText: "Recording",
      badText: "Not recording",
    },
  ];

  return (
    <Panel title="System health" icon={Activity}>
      <div className="space-y-3">
        <ul className="space-y-2.5">
          {rows.map(({ label, ok, okText, badText, neutral }) => (
            <li key={label} className="flex items-center justify-between gap-3">
              <span className="text-sm text-text-secondary">{label}</span>
              <Badge
                variant={ok ? "success" : neutral ? "neutral" : "danger"}
              >
                {ok ? okText : badText}
              </Badge>
            </li>
          ))}
        </ul>

        {system && (
          <dl className="border-t border-border pt-3 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <dt className="text-text-secondary">Running for</dt>
              <dd className="text-text font-medium tabular-nums">
                {system.uptime}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-text-secondary">Computer load</dt>
              <dd className="text-text font-medium tabular-nums">
                {system.cpu}%
              </dd>
            </div>
            {camera?.connected && camera.fps > 0 && (
              <div className="flex items-center justify-between">
                <dt className="text-text-secondary">Pictures per second</dt>
                <dd className="text-text font-medium tabular-nums">
                  {camera.fps}
                </dd>
              </div>
            )}
          </dl>
        )}

        {!reachable && (
          <p className="text-xs text-danger border-t border-border pt-3">
            Cannot reach the AI system, so nothing on this screen is
            up to date.
          </p>
        )}
      </div>
    </Panel>
  );
}
