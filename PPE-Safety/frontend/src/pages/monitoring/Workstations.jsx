import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Clock,
  EyeOff,
  MapPinned,
  PencilRuler,
  Timer,
  Trash2,
  TriangleAlert,
  UserCheck,
  UserX,
} from "lucide-react";

import Badge from "../../components/common/Badge";
import Button from "../../components/common/Button";
import Panel from "../../components/common/Panel";
import StatisticsCard from "../../components/common/StatisticsCard";
import PresenceTimeline from "../../components/monitoring/PresenceTimeline";
import StatusCard from "../../components/common/StatusCard";
import { EmptyState, ErrorState } from "../../components/common/States";
import CameraInputCard from "../../components/monitoring/CameraInputCard";
import LiveFeed from "../../components/monitoring/LiveFeed";
import ModuleLayout from "../../components/monitoring/ModuleLayout";
import RecentEvents from "../../components/monitoring/RecentEvents";
import UnverifiedNotice from "../../components/monitoring/UnverifiedNotice";
import DoorCanvas from "../../components/zones/DoorCanvas";
import { cameraApi, createModuleApi } from "../../services/moduleApi";
import { useWebcamAnalysis } from "../../hooks/useWebcamAnalysis";
import { useAlertSound } from "../../hooks/useAlertSound";
import AlertSoundToggle from "../../components/monitoring/AlertSoundToggle";
import StopMonitoringButton from "../../components/monitoring/StopMonitoringButton";
import {
  measuredCount,
  readLegibility,
  resumedSpeech,
  successTone,
  UNVERIFIED_LABEL,
  unverifiedDescription,
  unverifiedSpeech,
} from "../../components/monitoring/legibility";

/**
 * Absence from a workstation.
 *
 * The mirror image of every other page here: the alert is raised by nobody
 * being somewhere, rather than by something being seen. That difference
 * shapes the page — a workstation has to be marked out and named before
 * anything can be said about it, because there is no way to guess where a
 * workstation is, and an absence is only reported once it has lasted.
 *
 * Marking reuses the same box editor the doors use. An operator who has
 * marked a doorway already knows how to mark a bench.
 *
 * Polls faster than most modules because the durations shown are
 * seconds-scale and a stale timer reads as a broken one.
 */

const api = createModuleApi("workstation");
const POLL_MS = 1000;

/** Duration in words. Mirrors the wording the backend uses. */
function describe(seconds) {
  if (!seconds || seconds < 1) return "just now";
  if (seconds < 60) return `${Math.floor(seconds)} sec`;
  if (seconds < 3600)
    return `${Math.floor(seconds / 60)} min ${Math.floor(seconds % 60)} sec`;
  return `${Math.floor(seconds / 3600)} hr ${Math.floor((seconds % 3600) / 60)} min`;
}

export default function Workstations() {
  const [status, setStatus] = useState(null);
  const [serverResults, setResults] = useState(null);
  const [config, setConfig] = useState(null);
  const [error, setError] = useState(null);
  const [serverWatching, setWatching] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [sourceLabel, setSourceLabel] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [saving, setSaving] = useState(false);

  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([api.getStatus(), api.getResults()]);
      if (!mounted.current) return;
      setStatus(s);
      setResults(r);
      setWatching(Boolean(s.camera?.connected));
      setError(null);
    } catch (err) {
      if (!mounted.current) return;
      setError(err?.message || "Could not reach the AI system.");
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const c = await api.getConfig();
        if (mounted.current) setConfig(c);
      } catch {
        // Falls back to whatever the results report.
      }
      await refresh();
    })();

    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const serverStreamUrl = useMemo(
    () => (serverWatching ? api.streamUrl() : null),
    [serverWatching],
  );

  const webcam = useWebcamAnalysis("workstation", { file: videoUrl });

  const watching = serverWatching || webcam.active;

  const results = photo
    ? photo.result
    : webcam.active
      ? webcam.result
      : serverWatching
        ? serverResults
        : null;

  const streamUrl = webcam.active ? null : serverStreamUrl;

  /* ---------------------------------------------------------------- */
  /* Marking                                                           */
  /* ---------------------------------------------------------------- */

  const [marking, setMarking] = useState(false);
  const [frozenUrl, setFrozenUrl] = useState(null);
  const [selected, setSelected] = useState(null);

  // Kept apart from the connection error above, which the one-second poll
  // clears on every success. A refusal — "that overlaps the packing bench" —
  // is the operator's answer to something they just did, and it would
  // otherwise be wiped off the screen before they could read it.
  const [markingError, setMarkingError] = useState(null);

  const marked = config?.workstations ?? [];
  const anyMarked = marked.length > 0;

  /** Send one marking action and take the workstations back from the answer. */
  const mark = useCallback(
    async (action) => {
      setSaving(true);
      setMarkingError(null);

      try {
        const next = await api.saveConfig({ workstation: action });
        if (!mounted.current) return next;

        setConfig((current) => ({ ...current, ...next }));
        await refresh();
        return next;
      } catch (err) {
        const message =
          err?.response?.data?.detail || err?.message || "Could not save that.";
        if (mounted.current) setMarkingError(message);
        return null;
      } finally {
        if (mounted.current) setSaving(false);
      }
    },
    [refresh],
  );

  const startMarking = () => {
    setMarkingError(null);

    // The operator marks a still, not a moving picture. With this device's
    // camera the server has no frame to hand back, so the still is taken
    // locally.
    const still = webcam.active ? webcam.snapshot() : cameraApi.freezeFrameUrl();

    if (!still) {
      setError("The camera has not sent a picture yet. Try again in a moment.");
      return;
    }

    setFrozenUrl(still);
    setSelected(null);
    setMarking(true);
  };

  const stopMarking = () => {
    setMarking(false);
    setFrozenUrl(null);
    setSelected(null);
  };

  const setThreshold = async (seconds) => {
    setSaving(true);
    try {
      await api.saveConfig({ empty_seconds: seconds });
      setConfig(await api.getConfig());
      await refresh();
    } catch (err) {
      setError(err?.message || "Could not change the allowed time.");
    } finally {
      setSaving(false);
    }
  };

  const empty = results?.empty ?? [];

  // Something is covering the lens. Neither "somebody is there" nor "nobody
  // is there" is an honest answer while that is true, so the page says so
  // rather than picking one.
  const blocked = Boolean(results?.view_blocked);

  // Could the AI judge this picture at all? A covered lens and a picture too
  // dark to read are the same fact about the world, and this page used to
  // draw the first in calm grey — the quiet treatment that is exactly what
  // this phase removes. Both now read as the third state, in the module's
  // own words.
  const legibility = readLegibility(results);

  const unreadable = legibility.unreadable || blocked;
  const unverified = legibility.unverified;

  const reason =
    legibility.reason ??
    (blocked ? "Something is covering the camera." : null);

  const alert = Boolean(results?.alert) && !unreadable;

  // The wording the operator asked for, spoken exactly rather than through
  // the usual "Alert! ... Needs attention." template — the name of the
  // workstation is the whole point of the announcement.
  const spoken = empty.length
    ? empty.length === 1
      ? `Alert! The workstation ${empty[0].name} is empty. No one is there!`
      : `Alert! The workstations ${empty
          .map((w) => w.name)
          .join(" and ")} are empty. No one is there!`
    : undefined;

  const sound = useAlertSound(alert, results?.summary, {
    spoken,
    unverified: {
      active: watching && unreadable && !marking,
      spoken: unverifiedSpeech("the workstations", reason),
      resumed:
        watching && !unreadable ? resumedSpeech("The workstations") : null,
    },
  });

  const stopMonitoring = async () => {
    if (webcam.active) {
      webcam.stop();
    }

    if (serverWatching) {
      try {
        await cameraApi.stop();
      } catch (err) {
        setError(
          err?.response?.data?.detail || err?.message || "Could not stop.",
        );
      }
    }

    setWatching(false);
    refresh();
  };

  const stations = results?.detections ?? [];
  const threshold = config?.empty_seconds ?? results?.threshold_seconds ?? 10;

  // How long the AI keeps believing somebody is there after it last saw them.
  // Published by the backend rather than guessed here — and an older one that
  // does not publish it leaves this at zero, which says nothing about the
  // latency instead of saying something invented about it.
  const graceStated = Number(config?.presence_grace_seconds);
  const grace = Number.isFinite(graceStated) && graceStated > 0 ? graceStated : 0;

  return (
    <ModuleLayout
      title="Workstation Absence"
      description="The AI watches each marked workstation and alerts when nobody is there."
      icon={MapPinned}
      watching={watching}
      alert={alert}
      unverified={unreadable && !marking}
      actions={
        <>
          <StopMonitoringButton watching={watching} onStop={stopMonitoring} />
          {marking ? (
            <Button variant="primary" icon={Check} onClick={stopMarking}>
              Done
            </Button>
          ) : (
            <Button
              variant="secondary"
              icon={PencilRuler}
              onClick={startMarking}
              disabled={!watching}
            >
              {anyMarked ? "Adjust workstations" : "Mark workstations"}
            </Button>
          )}

          <AlertSoundToggle
            muted={sound.muted}
            setMuted={sound.setMuted}
            test={sound.test}
            supported={sound.supported}
          />
        </>
      }
      feed={
        <LiveFeed
          streamUrl={streamUrl}
          mediaStream={webcam.active ? webcam.stream : null}
          findings={
            marking
              ? null
              : photo
                ? photo.result
                : webcam.active
                  ? results
                  : null
          }
          frozenUrl={marking ? frozenUrl : (photo?.url ?? null)}
          connected={watching}
          watching={watching}
          alert={alert}
          unverified={unreadable && !marking}
          unverifiedReason={reason}
          statusLabel={
            marking
              ? "Marking workstations"
              : alert
                ? "Workstation empty"
                : photo
                  ? "Checked photo"
                  : undefined
          }
          stats={
            watching && stations.length > 0
              ? [{ label: "Workstations", value: stations.length }]
              : undefined
          }
          overlay={
            marking
              ? (size) => (
                  <DoorCanvas
                    doors={marked}
                    minSide={config?.min_side}
                    minArea={config?.min_area}
                    fallbackLabel="Workstation"
                    selectedId={selected}
                    displaySize={size}
                    onSelect={setSelected}
                    onDraw={(box) => mark({ add: { box } })}
                    onMove={(id, box) => mark({ update: { id, box } })}
                    onDelete={(id) => {
                      setSelected(null);
                      mark({ remove: id });
                    }}
                  />
                )
              : undefined
          }
        />
      }
      side={
        <>
          <CameraInputCard
            connected={serverWatching}
            watching={serverWatching}
            webcam={webcam}
            sourceLabel={sourceLabel}
            onSourceChanged={(label, recording = null) => {
              setSourceLabel(label);
              setVideoUrl(recording);
              refresh();
            }}
            onWatchingChanged={(next) => {
              setWatching(next);
              refresh();
            }}
            onError={setError}
            analysePhoto={(file, onProgress) =>
              api.analysePhoto(file, onProgress)
            }
            onPhotoChecked={(next) =>
              setPhoto((old) => {
                if (old) URL.revokeObjectURL(old.url);
                return next;
              })
            }
            onPhotoCleared={() =>
              setPhoto((old) => {
                if (old) URL.revokeObjectURL(old.url);
                return null;
              })
            }
          />

          <Panel title="Allowed empty time" icon={Timer}>
            <div className="space-y-3">
              <p className="text-sm text-text-secondary">
                Raise an alert once a workstation has had nobody at it for
                longer than:
              </p>

              <div className="flex flex-wrap gap-2">
                {[5, 10, 30, 60, 300].map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant={threshold === s ? "primary" : "secondary"}
                    onClick={() => setThreshold(s)}
                    disabled={saving}
                  >
                    {s < 60 ? `${s} sec` : `${s / 60} min`}
                  </Button>
                ))}
              </div>

              {/* The number above is not the wait. The AI holds somebody at
                  their post for a moment after it last saw them — that is
                  what stops a turned back restarting the clock — and the
                  allowance is only counted from the end of it. So the real
                  time from walking away to an alert is the two added
                  together, and this panel used to state the smaller half of
                  it as though it were the whole. */}
              {grace > 0 && (
                <p className="text-xs text-text-secondary bg-subtle border border-border rounded-lg px-3 py-2">
                  In practice an alert lands about{" "}
                  <span className="font-medium text-text">
                    {describe(threshold + grace)}
                  </span>{" "}
                  after somebody walks away: the {describe(threshold)} above,
                  plus about {describe(grace)} before the AI accepts that
                  they have gone.
                </p>
              )}

              <p className="text-xs text-text-muted">
                Somebody reaching for a tool has not left their post. Too short
                a time here and the alert becomes one to ignore.
              </p>
            </div>
          </Panel>

          <Panel title="Past absences" icon={TriangleAlert}>
            {/* Refreshed when the alert state changes, so something spotted
                while the operator is watching appears without a reload. */}
            <RecentEvents moduleId="workstation" refreshToken={alert ? 1 : 0} />
          </Panel>
        </>
      }
    >
      <StatusCard
        status={
          !anyMarked
            ? "idle"
            : unreadable
              ? "unverified"
              : alert
                ? "alert"
                : watching && stations.length > 0
                  ? "ok"
                  : "idle"
        }
        title={
          !anyMarked
            ? "No workstations marked yet"
            : unreadable
              ? reason
              : alert
                ? results.summary
                : watching && stations.length > 0
                  ? results.summary
                  : "No workstations being watched"
        }
        description={
          !anyMarked
            ? "Connect a camera, then draw a box around each place somebody is meant to be."
            : unreadable
              ? unverifiedDescription(
                  "No workstation is being checked, and the empty-time clocks are held until the AI can see again.",
                )
              : alert
                ? "Nobody is at the workstation. Check whether cover is needed."
                : watching
                  ? `The AI checks every marked workstation for somebody at it. Nobody for longer than ${describe(threshold)} raises an alert.`
                  : "Connect a camera pointed at the workstations to begin."
        }
        pulse
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatisticsCard
          label="Workstations"
          value={results?.workstations_total ?? marked.length}
          icon={MapPinned}
          tone="neutral"
          hint={anyMarked ? "Marked out" : "None marked yet"}
        />
        <StatisticsCard
          label="Somebody there"
          value={measuredCount(results?.workstations_occupied ?? 0, unreadable)}
          icon={UserCheck}
          tone={successTone(
            results?.workstations_occupied > 0 &&
              results?.workstations_empty === 0,
            { unreadable, unverified },
          )}
          hint={unreadable ? "Nothing could be confirmed" : undefined}
        />
        <StatisticsCard
          label="Left empty"
          value={measuredCount(results?.workstations_empty ?? 0, unreadable)}
          icon={UserX}
          tone={
            unreadable
              ? "neutral"
              : results?.workstations_empty > 0
                ? "danger"
                : successTone(true, { unreadable, unverified })
          }
          hint={
            // "Nothing outstanding" claims a check was made. None was.
            unreadable
              ? "Nothing could be checked"
              : results?.workstations_empty > 0
                ? "Needs attention"
                : "Nothing outstanding"
          }
        />
        <StatisticsCard
          label="Longest empty"
          value={unreadable ? "—" : describe(results?.longest_empty_seconds)}
          icon={Clock}
          tone={!unreadable && results?.workstations_empty > 0 ? "danger" : "neutral"}
          hint={unreadable ? "Clocks held while the view is blocked" : undefined}
        />
      </div>

      <PresenceTimeline stations={stations} />

      <Panel
        title="Workstations"
        icon={MapPinned}
        subtitle={
          marking
            ? "Drag a box around each workstation. Click one to move or resize it."
            : anyMarked
              ? `Watching ${marked.length} workstation${marked.length === 1 ? "" : "s"}`
              : "Nothing is watched until you mark a workstation"
        }
        action={
          anyMarked && !marking ? (
            <Button
              size="sm"
              variant="ghost"
              icon={Trash2}
              onClick={() => mark({ clear: true })}
              disabled={saving}
            >
              Clear
            </Button>
          ) : undefined
        }
      >
        {marking ? (
          <>
            {markingError && (
              <p
                className="text-xs text-danger bg-danger-soft border border-danger/20
                           rounded-lg px-3 py-2 mb-3"
                role="alert"
              >
                {markingError}
              </p>
            )}

            <MarkedWorkstations
              stations={marked}
              selectedId={selected}
              defaultThreshold={threshold}
              saving={saving}
              onSelect={setSelected}
              onRename={(id, name) => mark({ update: { id, name } })}
              onThreshold={(id, empty_seconds) =>
                mark({ update: { id, empty_seconds } })
              }
              onDelete={(id) => {
                setSelected(null);
                mark({ remove: id });
              }}
            />
          </>
        ) : unreadable && stations.length === 0 ? (
          /* "Waiting for the first picture" would be wrong twice over: a
             picture arrived, and it could not be judged. */
          <UnverifiedNotice
            reason={reason}
            description="No workstation can be reported as occupied or empty until the AI can see again."
          />
        ) : stations.length === 0 ? (
          <EmptyState
            icon={MapPinned}
            title={
              anyMarked
                ? watching
                  ? "Waiting for the first picture"
                  : "Not watching"
                : "No workstations marked yet"
            }
            description={
              anyMarked
                ? watching
                  ? "The marked workstations will appear here as soon as the camera sends a picture."
                  : "Connect a camera to begin."
                : "Connect a camera, press Mark workstations, and draw a box around each place somebody is meant to be. Each one keeps its name across restarts."
            }
          />
        ) : (
          <ul className="divide-y divide-border -my-2">
            {stations.map((station) => {
              // A station nobody could look at. Either the whole picture was
              // unreadable, or this one box was. Both used to be drawn in the
              // same calm grey as an idle station, one of them beside a green
              // "Occupied" for its neighbours.
              const unchecked = unreadable || station.checkable === false;

              return (
                <li
                  key={station.id}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                        unchecked
                          ? "bg-warning-soft text-warning"
                          : station.severity
                            ? "bg-danger-soft text-danger"
                            : station.occupied
                              ? "bg-success-soft text-success"
                              : "bg-warning-soft text-warning"
                      }`}
                      aria-hidden="true"
                    >
                      {unchecked ? (
                        <EyeOff size={16} />
                      ) : station.occupied ? (
                        <UserCheck size={16} />
                      ) : (
                        <UserX size={16} />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text truncate">
                        {station.name || `Workstation ${station.id}`}
                      </p>
                      <p className="text-xs text-text-secondary">
                        {unchecked
                          ? "The camera cannot see this workstation"
                          : station.occupied
                            ? station.people > 1
                              ? `${station.people} people there`
                              : "Somebody is there"
                            : `Empty for ${describe(station.empty_seconds)}`}
                        {station.threshold_seconds &&
                        station.threshold_seconds !== threshold
                          ? ` · allowed ${describe(station.threshold_seconds)}`
                          : ""}
                      </p>
                    </div>
                  </div>

                  {unchecked ? (
                    <Badge variant="warning">{UNVERIFIED_LABEL}</Badge>
                  ) : station.severity ? (
                    <Badge variant="danger" pulse>
                      Nobody there
                    </Badge>
                  ) : station.occupied ? (
                    <Badge variant="success">Occupied</Badge>
                  ) : (
                    <Badge variant="warning">Empty</Badge>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {(error || webcam.error) && (
        <Panel>
          <ErrorState detail={webcam.error || error} onRetry={refresh} />
        </Panel>
      )}
    </ModuleLayout>
  );
}

/**
 * The marked workstations, while marking.
 *
 * Naming happens here rather than on the picture: a text field floating over
 * a video is fiddly to hit and impossible to read against a bright
 * background, and the operator is already looking at this panel to see what
 * they have marked. Selecting a row highlights it on the picture.
 */
function MarkedWorkstations({
  stations,
  selectedId,
  defaultThreshold,
  saving,
  onSelect,
  onRename,
  onThreshold,
  onDelete,
}) {
  if (stations.length === 0) {
    return (
      <EmptyState
        icon={PencilRuler}
        title="Nothing marked yet"
        description="Drag a box around each workstation on the picture. Give it a name and the alert will say that name out loud."
      />
    );
  }

  return (
    <ul className="divide-y divide-border -my-2">
      {stations.map((station, index) => (
        <li
          key={station.id}
          className={`py-3 px-3 -mx-3 rounded-lg transition ${
            station.id === selectedId ? "bg-warning-soft/40" : ""
          }`}
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onSelect(station.id)}
              className="shrink-0 w-7 h-7 rounded-md bg-subtle text-text-secondary
                         text-xs font-semibold cursor-pointer
                         focus-visible:outline-2 focus-visible:outline-primary"
              aria-label={`Select ${station.name || `workstation ${index + 1}`} on the picture`}
            >
              {index + 1}
            </button>

            <input
              type="text"
              defaultValue={station.name}
              placeholder="Name this workstation"
              maxLength={60}
              onFocus={() => onSelect(station.id)}
              /* Saved on leaving the field rather than per keystroke: every
                 save is a round trip that rewrites the file on disk. */
              onBlur={(e) => {
                const value = e.target.value.trim();
                if (value !== station.name) onRename(station.id, value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              className="flex-1 min-w-0 text-sm rounded-lg border border-border
                         bg-surface px-3 py-1.5
                         focus-visible:outline-2 focus-visible:outline-primary"
            />

            <Button
              size="sm"
              variant="ghost"
              icon={Trash2}
              onClick={() => onDelete(station.id)}
              disabled={saving}
              aria-label={`Remove ${station.name || `workstation ${index + 1}`}`}
            />
          </div>

          <div className="flex items-center gap-2 mt-2 pl-9">
            <span className="text-xs text-text-secondary">Allowed empty:</span>

            <select
              value={station.empty_seconds ?? ""}
              onChange={(e) =>
                onThreshold(
                  station.id,
                  e.target.value === "" ? null : Number(e.target.value),
                )
              }
              disabled={saving}
              className="text-xs rounded-lg border border-border bg-surface px-2 py-1
                         cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
            >
              <option value="">
                Same as everything else ({describe(defaultThreshold)})
              </option>
              {[5, 10, 30, 60, 300, 900].map((s) => (
                <option key={s} value={s}>
                  {describe(s)}
                </option>
              ))}
            </select>
          </div>
        </li>
      ))}
    </ul>
  );
}
