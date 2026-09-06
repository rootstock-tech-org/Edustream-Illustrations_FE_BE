import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Camera, Check, MapPin, Pencil, X } from "lucide-react";

import Badge from "../components/common/Badge";
import Button from "../components/common/Button";
import Panel from "../components/common/Panel";
import { EmptyState, ErrorState } from "../components/common/States";
import { cameraRegistryApi } from "../services/cameraRegistry";

/**
 * The camera register, managed.
 *
 * Every camera this deployment has been introduced to: its operator-given
 * name and place, whether it is feeding right now, what kind of source it
 * is, and any clock warning it has earned. Name and location are editable in
 * place; a camera can be disabled without being forgotten; the identifier
 * itself is shown but never editable — it is the one fact the register
 * exists to hold still.
 */

const POLL_MS = 5000;

const STATUS_BADGE = {
  active: { variant: "success", label: "Active" },
  offline: { variant: "neutral", label: "Offline" },
  disabled: { variant: "warning", label: "Disabled" },
};

/**
 * The camera-clock verdict, as a chip beside the camera's own status.
 * "Unknown" is a camera that has not fed frames since the last reset —
 * verdicts are revalidated by watching, never assumed across restarts.
 */
const CLOCK_BADGE = {
  valid: { variant: "success", label: "✓ Clock OK" },
  checking: { variant: "neutral", label: "○ Checking" },
  unavailable: { variant: "warning", label: "⚠ Clock unavailable" },
  invalid: { variant: "warning", label: "⚠ Clock invalid" },
  unknown: { variant: "neutral", label: "Clock unchecked" },
};

/** "browser" / "network" / "local" as the operator reads them. */
function sourceLabel(camera) {
  const kind = camera.source?.kind;
  if (kind === "browser") return camera.source?.label || "Device camera";
  if (kind === "network") return "Network camera";
  if (String(camera.camera_id).startsWith("local:"))
    return `Camera ${String(camera.camera_id).slice(6)}`;
  return camera.source?.label || camera.camera_id.slice(0, 24);
}

function EditRow({ camera, onSaved, onCancel, onError }) {
  const [name, setName] = useState(camera.camera_name);
  const [location, setLocation] = useState(camera.location);
  const [saving, setSaving] = useState(false);

  const valid = name.trim() && location.trim();

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      await cameraRegistryApi.update(camera.camera_id, {
        cameraName: name.trim(),
        location: location.trim(),
      });
      onSaved();
    } catch (err) {
      setSaving(false);
      onError(
        err?.response?.data?.detail || err?.message || "Could not save that.",
      );
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save()}
        maxLength={60}
        placeholder="Camera name"
        className="flex-1 min-w-[10rem] text-sm text-text bg-subtle border border-border
                   rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
      <input
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save()}
        maxLength={60}
        placeholder="Location"
        className="flex-1 min-w-[10rem] text-sm text-text bg-subtle border border-border
                   rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
      <Button variant="primary" icon={Check} onClick={save} loading={saving} disabled={!valid}>
        Save
      </Button>
      <Button variant="ghost" icon={X} onClick={onCancel} disabled={saving} aria-label="Cancel" />
    </div>
  );
}

export default function Cameras() {
  const [cameras, setCameras] = useState(null);
  const [log, setLog] = useState([]);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);

  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await cameraRegistryApi.list();
      if (!mounted.current) return;
      setCameras(data.cameras);
      setLog(data.log || []);
      setError(null);
    } catch (err) {
      if (!mounted.current) return;
      setError(err?.message || "Could not reach the AI system.");
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const toggleEnabled = async (camera) => {
    try {
      await cameraRegistryApi.update(camera.camera_id, {
        enabled: !camera.enabled,
      });
      await refresh();
    } catch (err) {
      setError(
        err?.response?.data?.detail || err?.message || "Could not change that.",
      );
    }
  };

  const warned = (cameras || []).filter((c) => c.clock_warning);

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-5xl">
      <header className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-xl bg-primary-soft text-primary
                     flex items-center justify-center shrink-0"
        >
          <Camera size={20} />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-text">Cameras</h1>
          <p className="text-sm text-text-secondary">
            Every camera this system has been introduced to. Alerts carry the
            name and location registered here.
          </p>
        </div>
      </header>

      {warned.map((camera) => (
        <Panel key={`warn-${camera.camera_id}`}>
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="text-warning shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-text">
                Camera clock warning — {camera.camera_name}
              </p>
              <p className="text-text-secondary">
                Its clock disagrees with this system's by{" "}
                {Math.round(Math.abs(camera.clock_warning.skew_seconds))} seconds.
                Camera time {camera.clock_warning.camera_time} · system time{" "}
                {camera.clock_warning.server_time}. Events from it carry both
                timestamps; nothing is blocked.
              </p>
            </div>
          </div>
        </Panel>
      ))}

      {(cameras || [])
        .filter((camera) => camera.clock_warning_active)
        .map((camera) => (
          <Panel key={`clock-${camera.camera_id}`}>
            <div className="flex items-start gap-3">
              <AlertTriangle size={18} className="text-warning shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-text">
                  Camera clock not configured — {camera.camera_name} (
                  {camera.location})
                </p>
                <p className="text-text-secondary">
                  {camera.camera_clock_status === "invalid"
                    ? "The timestamp burned into its picture jumped backward and cannot be trusted."
                    : "The system could not detect a valid camera timestamp."}{" "}
                  Safety events from this camera currently use the system
                  timestamp. Verify or configure the camera clock — a marked
                  timestamp area helps if the clock is somewhere unusual —
                  before synchronising events with external systems. Watching
                  and detection continue unaffected.
                </p>
              </div>
            </div>
          </Panel>
        ))}

      <Panel title="Registered cameras" icon={Camera}>
        {cameras === null ? (
          <p className="text-sm text-text-secondary">Loading…</p>
        ) : cameras.length === 0 ? (
          <EmptyState
            icon={Camera}
            title="No cameras registered yet"
            description="Start a camera on any monitoring page and you'll be asked to name it. It appears here from then on."
          />
        ) : (
          <ul className="divide-y divide-border -my-2">
            {cameras.map((camera) => {
              const badge =
                STATUS_BADGE[
                  camera.enabled === false ? "disabled" : camera.status
                ] ?? STATUS_BADGE.offline;

              return (
                <li key={camera.camera_id} className="py-3 space-y-2">
                  {editing === camera.camera_id ? (
                    <EditRow
                      camera={camera}
                      onSaved={() => {
                        setEditing(null);
                        refresh();
                      }}
                      onCancel={() => setEditing(null)}
                      onError={setError}
                    />
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text truncate">
                          {camera.camera_name}
                          {camera.clock_warning && (
                            <AlertTriangle
                              size={13}
                              className="inline ml-1.5 -mt-0.5 text-warning"
                              aria-label="Clock warning"
                            />
                          )}
                        </p>
                        <p className="text-xs text-text-secondary flex items-center gap-1">
                          <MapPin size={11} />
                          {camera.location}
                          <span className="text-text-muted">
                            · {sourceLabel(camera)}
                          </span>
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {(() => {
                          const clock =
                            CLOCK_BADGE[camera.camera_clock_status] ??
                            CLOCK_BADGE.unknown;
                          return (
                            <Badge variant={clock.variant}>{clock.label}</Badge>
                          );
                        })()}
                        <Badge variant={badge.variant} dot={badge.variant === "success"}>
                          {badge.label}
                        </Badge>
                        <Button
                          variant="ghost"
                          icon={Pencil}
                          onClick={() => setEditing(camera.camera_id)}
                          aria-label={`Edit ${camera.camera_name}`}
                        />
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => toggleEnabled(camera)}
                        >
                          {camera.enabled === false ? "Enable" : "Disable"}
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {log.length > 0 && (
        <Panel title="Register activity" icon={Camera}>
          <ul className="space-y-1.5 text-xs text-text-secondary max-h-64 overflow-y-auto">
            {log.map((entry, index) => (
              <li key={index} className="flex flex-wrap gap-x-2">
                <span className="text-text-muted shrink-0">
                  {String(entry.at || "").replace("T", " ").replace("+00:00", "")}
                </span>
                <span className="font-medium text-text">
                  {String(entry.event || "").replaceAll("_", " ").toLowerCase()}
                </span>
                {entry.camera_name && <span>· {entry.camera_name}</span>}
                {entry.location && <span>({entry.location})</span>}
                {entry.skew_seconds != null && (
                  <span>· clock off by {Math.round(entry.skew_seconds)}s</span>
                )}
                {entry.new && (
                  <span>
                    · {entry.previous} → {entry.new}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {error && (
        <Panel>
          <ErrorState detail={error} onRetry={refresh} />
        </Panel>
      )}
    </div>
  );
}
