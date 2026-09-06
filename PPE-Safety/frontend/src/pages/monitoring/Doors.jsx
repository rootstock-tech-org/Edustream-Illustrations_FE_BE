import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  CircleHelp,
  Clock,
  DoorOpen,
  EyeOff,
  PencilRuler,
  Timer,
  Trash2,
  TriangleAlert,
} from "lucide-react";

import Badge from "../../components/common/Badge";
import Button from "../../components/common/Button";
import Panel from "../../components/common/Panel";
import StatisticsCard from "../../components/common/StatisticsCard";
import StatusCard from "../../components/common/StatusCard";
import { EmptyState, ErrorState } from "../../components/common/States";
import CameraInputCard from "../../components/monitoring/CameraInputCard";
import LiveFeed from "../../components/monitoring/LiveFeed";
import ModuleLayout from "../../components/monitoring/ModuleLayout";
import UnverifiedNotice from "../../components/monitoring/UnverifiedNotice";
import DoorCanvas from "../../components/zones/DoorCanvas";
import { cameraApi } from "../../services/moduleApi";
import RecentEvents from "../../components/monitoring/RecentEvents";
import { createModuleApi } from "../../services/moduleApi";
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
 * Door monitoring.
 *
 * A door being open is normal; a door being open too long is the event. The
 * page is built around that — every door shows how long it has been in its
 * current state, and the allowed time is adjustable here rather than buried
 * in configuration.
 *
 * Doorways are marked out once and named, and nothing is watched until they
 * are. Left to find doorways by itself the model boxed office partitions,
 * glazing and cupboard fronts and started timers on them — four doors in a
 * room with one. It answers "is this doorway open" well; it was never good
 * at "where are the doorways", and the operator already knows.
 *
 * Polls faster than the other modules because the durations shown are
 * seconds-scale and a stale timer reads as a broken one.
 */

const api = createModuleApi("door");
const POLL_MS = 1000;

/** Duration in words. Mirrors the wording the backend uses. */
function describe(seconds) {
  if (!seconds || seconds < 1) return "just now";
  if (seconds < 60) return `${Math.floor(seconds)} sec`;
  if (seconds < 3600)
    return `${Math.floor(seconds / 60)} min ${Math.floor(seconds % 60)} sec`;
  return `${Math.floor(seconds / 3600)} hr ${Math.floor((seconds % 3600) / 60)} min`;
}

/**
 * The same, for a length of time rather than a length of time so far.
 *
 * `describe` rounds down to whole seconds and calls anything under one
 * "just now", which is right for a clock that is running and wrong for a
 * setting: the confirmation wait is 2.67 seconds and "2 sec" understates the
 * very number this panel exists to stop understating.
 */
function duration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "no time";
  if (seconds < 60) {
    const rounded = Math.round(seconds * 10) / 10;
    return `${rounded} sec`;
  }
  return describe(seconds);
}

export default function Doors() {
  const [status, setStatus] = useState(null);
  const [serverResults, setResults] = useState(null);
  const [config, setConfig] = useState(null);
  const [error, setError] = useState(null);
  const [serverWatching, setWatching] = useState(false);

  // A checked photo: {url, result, name}. While set, the page shows the
  // still with its findings instead of a feed. Distinct from the frozen
  // still used for calibrating, which takes precedence while marking.
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

  // This device's camera. The browser captures and pushes frames, so the model
  // can run on a GPU elsewhere while the camera stays on the operator's desk.
  // While it is running it supersedes the server-captured stream, and the
  // names below shadow the server state so the rest of the page is unchanged.
  // A recording is analysed in the browser too, not streamed back
  // annotated: the picture is already here once it has been fetched,
  // and sending it back across the network is what made it late.
  const webcam = useWebcamAnalysis("door", { file: videoUrl });

  const watching = serverWatching || webcam.active;

  // No fallback to the server's figures while the device camera is starting:
  // they describe a different camera, and showing them beside this one's
  // picture is worse than showing nothing. Null until the first frame lands.
  //
  // Gated on watching too, so stopping clears the figures rather than leaving
  // the last violation on screen looking current.
  const results = photo
    ? photo.result
    : webcam.active
      ? webcam.result
      : serverWatching
        ? serverResults
        : null;

  // Only a server-captured camera arrives as a stream; this device's camera is
  // shown directly from the browser, which is smoother and saves a round trip
  // per frame. The findings are drawn on top in that case — the server stream
  // already has them painted in, so drawing them there would double every box.
  const streamUrl = webcam.active ? null : serverStreamUrl;

  /* ---------------------------------------------------------------- */
  /* Calibration                                                        */
  /* ---------------------------------------------------------------- */

  const [calibrating, setCalibrating] = useState(false);
  const [frozenUrl, setFrozenUrl] = useState(null);
  const [selectedDoor, setSelectedDoor] = useState(null);

  // Kept apart from the connection error above, which the one-second poll
  // clears on every success. A refusal — "that overlaps the fire exit" — is
  // the operator's answer to something they just did, and it was being wiped
  // off the screen before they could read it.
  const [calibrationError, setCalibrationError] = useState(null);

  const marked = config?.doors ?? [];
  const calibrated = marked.length > 0;

  /** Send one calibration action and take the doors back from the answer. */
  const calibrate = useCallback(async (action) => {
    setSaving(true);
    setCalibrationError(null);

    try {
      const next = await api.saveConfig({ door: action });
      if (!mounted.current) return next;

      // The response carries the full list, so the page never has to guess
      // what the server did with an overlapping box or a duplicate name.
      setConfig((current) => ({ ...current, ...next }));
      await refresh();
      return next;
    } catch (err) {
      const message =
        err?.response?.data?.detail || err?.message || "Could not save that.";
      if (mounted.current) setCalibrationError(message);
      return null;
    } finally {
      if (mounted.current) setSaving(false);
    }
  }, [refresh]);

  const startCalibrating = () => {
    setCalibrationError(null);
    // The operator marks a still, not a moving picture. With this device's
    // camera the server has no frame to hand back, so the still is taken
    // locally.
    const still = webcam.active
      ? webcam.snapshot()
      : cameraApi.freezeFrameUrl();

    if (!still) {
      setError("The camera has not sent a picture yet. Try again in a moment.");
      return;
    }

    setFrozenUrl(still);
    setSelectedDoor(null);
    setCalibrating(true);
  };

  const stopCalibrating = () => {
    setCalibrating(false);
    setFrozenUrl(null);
    setSelectedDoor(null);
  };

  const setThreshold = async (seconds) => {
    setSaving(true);
    try {
      await api.saveConfig({ open_seconds: seconds });
      setConfig(await api.getConfig());
      await refresh();
    } catch (err) {
      setError(err?.message || "Could not change the allowed time.");
    } finally {
      setSaving(false);
    }
  };

  // Could the AI judge this picture at all? Doors judge no people, so
  // `people_unverified` is always 0 here — but a doorway nobody could see is
  // still a doorway nobody has confirmed, and "All doors closed" over an
  // unreadable picture is the same false all-clear.
  const { unreadable, reason } = readLegibility(results);

  const alert = Boolean(results?.alert) && !unreadable;

  // Sounds where the operator is. The backend's alarm beeps on the
  // machine running the service, which nobody is sitting next to.
  const sound = useAlertSound(alert, results?.summary, {
    unverified: {
      active: watching && unreadable && !calibrating,
      spoken: unverifiedSpeech("the doors", reason),
      resumed: watching && !unreadable ? resumedSpeech("The doors") : null,
    },
  });

  // The header's stop-everything control. The camera card's own toggle only
  // stops the source whose tile is selected; this halts whatever is running,
  // however it was started.
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

  // Two separate facts, and this page conflated them for as long as it had
  // only one. `ready` is true when the AI is loaded *and* doorways have been
  // marked, so a perfectly healthy install with nothing marked yet read as
  // "The door AI is not installed on this system" — the first thing every new
  // deployment saw on this page, beside a working Mark doors button.
  //
  // The backend now states both facts separately. An older one states
  // neither, so they are inferred from what this page already knows: marked
  // doorways are what being set up means here, and a module that is set up
  // and still not ready can only be missing its model. Where that inference
  // cannot decide — nothing marked, nothing ready — the model is assumed
  // present, because claiming a missing AI is the more damaging of the two
  // wrong answers and is the defect being fixed.
  const configured = status?.configured ?? calibrated;
  const modelLoaded =
    status?.model_loaded ?? (status?.ready !== false || !configured);

  const doors = results?.detections ?? [];
  const threshold = config?.open_seconds ?? results?.threshold_seconds ?? 3;

  // How long the AI argues with itself before it will call a door open. The
  // measured figure is the one an operator lives with — the design constant
  // assumes the model finds the doorway in every frame, and on real footage
  // it finds it in about one in three — so it is preferred where the backend
  // publishes it. A backend that publishes neither leaves this at zero, and
  // the panel says nothing rather than something invented.
  const confirmStated = Number(
    config?.confirm_seconds_measured ?? config?.confirm_seconds,
  );
  const confirmSeconds =
    Number.isFinite(confirmStated) && confirmStated > 0 ? confirmStated : 0;

  // The shortest allowance that buys anything. Below it the confirmation wait
  // is the whole wait, and "fire door: 0.1 seconds" alerts no sooner than
  // 0.8 does — accepted by the module, and until now nowhere on screen.
  const minUsefulStated = Number(config?.min_useful_open_seconds);
  const minUsefulSeconds =
    Number.isFinite(minUsefulStated) && minUsefulStated > 0 ? minUsefulStated : 0;

  /* ---------------------------------------------------------------- */
  /* Two things the backend has been saying that no screen read         */
  /* ---------------------------------------------------------------- */

  // A marked box with more than one doorway in it. Only one of them is ever
  // being timed; the other could stand open all day inside a region reporting
  // "closed". The summary sentence says so and the region is labelled on the
  // picture, but the row for that door — the thing an operator reads to find
  // out about that door — did not.
  const crowded = doors.filter((door) => door.crowded);

  // A doorway whose evidence is a coin flip. Not an alert and not an answer:
  // the AI has looked and cannot commit, which is a different problem from a
  // door being open and a different problem again from a picture too dark to
  // read.
  //
  // Counted from the doors themselves as well as from the summary field, so
  // this works against a backend that reports the state per door before it
  // reports a total, and reads as "none" against one that has neither.
  const unreliableDoors = doors.filter((door) => door.state === "unreliable");
  const statedUnreliable = Number(results?.doors_unreliable);
  const unreliableCount = Number.isFinite(statedUnreliable)
    ? Math.max(statedUnreliable, unreliableDoors.length)
    : unreliableDoors.length;

  /** "the loading bay" / "the loading bay and 2 others", for a sentence. */
  const unreliableNames = (() => {
    const names = unreliableDoors
      .map((door) => door.name || `Door ${door.id}`)
      .filter(Boolean);

    if (names.length === 0) {
      return unreliableCount === 1 ? "a doorway" : `${unreliableCount} doorways`;
    }
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} and ${names[1]}`;
    return `${names[0]} and ${names.length - 1} others`;
  })();

  // Nothing on this page may read as a clean answer while a doorway is
  // unreadable — the same rule Phase 2 applied to a picture nobody could
  // judge, applied here to one doorway inside a picture that was fine.
  const unresolved = { unreadable, unverified: unreliableCount };

  return (
    <ModuleLayout
      title="Doors"
      description="The AI watches every door and alerts when one is left open too long."
      icon={DoorOpen}
      watching={watching}
      alert={alert}
      unverified={unreadable && !calibrating}
      actions={
        <>
          <StopMonitoringButton watching={watching} onStop={stopMonitoring} />
          {calibrating ? (
            <Button variant="primary" icon={Check} onClick={stopCalibrating}>
              Done
            </Button>
          ) : (
            <Button
              variant="secondary"
              icon={PencilRuler}
              onClick={startCalibrating}
              disabled={!watching}
            >
              {calibrated ? "Adjust doors" : "Mark doors"}
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
          /* Not while marking: the operator is drawing on a still, and live
             boxes over it would be describing a moment that has passed. */
          findings={
            calibrating
              ? null
              : photo
                ? photo.result
                : webcam.active
                  ? results
                  : null
          }
          frozenUrl={calibrating ? frozenUrl : photo?.url ?? null}
          connected={watching}
          watching={watching}
          alert={alert}
          unverified={unreadable && !calibrating}
          unverifiedReason={reason}
          statusLabel={
            calibrating
              ? "Marking doors"
              : alert
                ? "Door left open"
                : photo
                  ? "Checked photo"
                  : undefined
          }
          stats={
            watching && doors.length > 0
              ? [{ label: "Doors", value: doors.length }]
              : undefined
          }
          overlay={
            calibrating
              ? (size) => (
                  <DoorCanvas
                    doors={marked}
                    minSide={config?.min_side}
                    minArea={config?.min_area}
                    selectedId={selectedDoor}
                    displaySize={size}
                    onSelect={setSelectedDoor}
                    onDraw={(box) => calibrate({ add: { box } })}
                    onMove={(id, box) => calibrate({ update: { id, box } })}
                    onDelete={(id) => {
                      setSelectedDoor(null);
                      calibrate({ remove: id });
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
            analysePhoto={(file, onProgress) => api.analysePhoto(file, onProgress)}
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

          <Panel title="Allowed open time" icon={Timer}>
            <div className="space-y-3">
              <p className="text-sm text-text-secondary">
                Raise an alert once a door has been open for longer than:
              </p>

              <div className="flex flex-wrap gap-2">
                {[3, 10, 30, 60, 300].map((s) => (
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

              {/* The allowance is the second half of the wait. A door is not
                  reported open until enough sightings have agreed, and only
                  then does this clock start — so the time from a door
                  actually opening to an alert is the two added together, and
                  this panel used to state only the half the operator types.
                  The numbers come from the module rather than from a constant
                  copied over here; an older backend publishes neither and
                  gets the panel exactly as it was. */}
              {confirmSeconds > 0 && (
                <p className="text-xs text-text-secondary bg-subtle border border-border rounded-lg px-3 py-2">
                  In practice an alert lands about{" "}
                  <span className="font-medium text-text">
                    {duration(threshold + confirmSeconds)}
                  </span>{" "}
                  after a door actually opens: the {duration(threshold)} above,
                  plus about {duration(confirmSeconds)} of agreeing sightings
                  before the AI accepts the door is open at all.
                  {minUsefulSeconds > 0 && threshold < minUsefulSeconds ? (
                    <>
                      {" "}
                      <span className="text-warning font-medium">
                        Anything under {duration(minUsefulSeconds)} alerts no
                        sooner than {duration(minUsefulSeconds)} does.
                      </span>
                    </>
                  ) : null}
                </p>
              )}

              <p className="text-xs text-text-muted">
                A loading bay and a fire door rarely deserve the same limit.
              </p>
            </div>
          </Panel>

          <Panel title="Past door events" icon={TriangleAlert}>
            {/* Refreshed when the alert state changes, so something spotted
                while the operator is watching appears without a reload. */}
            <RecentEvents moduleId="door" refreshToken={alert ? 1 : 0} />
          </Panel>
        </>
      }
    >
      <StatusCard
        status={
          !modelLoaded
            ? "idle"
            : !configured
              ? "idle"
              : unreadable
                ? "unverified"
                : alert
                  ? "alert"
                  : // A doorway the AI cannot decide about is amber, and it
                    // outranks the green: "All doors closed" said over a
                    // doorway nothing is known about is the same false
                    // all-clear as saying it over a picture nobody can read.
                    // It does not outrank an alert — a door that is actually
                    // open too long is the more urgent fact.
                    unreliableCount > 0 && watching
                    ? "unverified"
                    : watching && doors.length > 0
                      ? "ok"
                      : "idle"
        }
        title={
          !modelLoaded
            ? "Door monitoring is not available"
            : !configured
              ? "No doors marked yet"
              : unreadable
                ? reason
                : alert
                  ? results.summary
                  : unreliableCount > 0 && watching
                    ? `${unreliableCount} doorway${unreliableCount === 1 ? "" : "s"} cannot be read`
                    : watching && doors.length > 0
                      ? results.summary
                      : "No doors being watched"
        }
        description={
          !modelLoaded
            ? "The door AI is not installed on this system."
            : !configured
              ? "Connect a camera, then mark each doorway you want timed. The AI watches only what you mark."
              : unreadable
                ? unverifiedDescription(
                    "No doorway is being confirmed open or closed until the picture improves.",
                  )
                : alert
                  ? "Close the door, or check why it is being held open."
                  : unreliableCount > 0 && watching
                    ? `The evidence for ${unreliableNames} keeps flipping between open and closed, so the AI is not claiming either. Nothing on this page is an all-clear for ${unreliableCount === 1 ? "that doorway" : "those doorways"} — go and look, and check the camera can see ${unreliableCount === 1 ? "it" : "them"} properly. The rest: ${results.summary}.`
                    : watching
                      ? `The AI times every door from the moment it opens. Anything past ${describe(threshold)} raises an alert.`
                      : "Connect a camera pointed at a door to begin."
        }
        pulse
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatisticsCard
          label="Doors in view"
          value={measuredCount(results?.doors_total ?? 0, unreadable)}
          icon={DoorOpen}
          tone="neutral"
          hint={
            unreadable
              ? `${marked.length} marked, none confirmed`
              : undefined
          }
        />
        <StatisticsCard
          label="Currently open"
          value={measuredCount(results?.doors_open ?? 0, unreadable)}
          icon={DoorOpen}
          tone={
            unreadable
              ? "neutral"
              : results?.doors_open > 0
                ? "warning"
                : successTone(true, unresolved)
          }
          hint={
            unreadable
              ? "Nothing could be confirmed"
              : unreliableCount > 0
                ? `${unreliableCount} could not be read`
                : undefined
          }
        />
        <StatisticsCard
          label="Open too long"
          value={measuredCount(results?.doors_overdue ?? 0, unreadable)}
          icon={TriangleAlert}
          tone={
            unreadable
              ? "neutral"
              : results?.doors_overdue > 0
                ? "danger"
                : successTone(true, unresolved)
          }
          hint={
            // "Nothing outstanding" is the sentence that has to go: it says a
            // check was made and came back clean. A doorway whose state is a
            // coin flip has not been checked either, so it takes the same
            // treatment as an unreadable picture rather than being counted
            // into the good news.
            unreadable
              ? "Nothing could be checked"
              : results?.doors_overdue > 0
                ? "Needs attention"
                : unreliableCount > 0
                  ? `${unreliableCount} doorway${unreliableCount === 1 ? "" : "s"} not checked`
                  : "Nothing outstanding"
          }
        />
        <StatisticsCard
          label="Longest open"
          value={unreadable ? "—" : describe(results?.longest_open_seconds)}
          icon={Clock}
          tone={!unreadable && results?.doors_overdue > 0 ? "danger" : "neutral"}
          hint={unreadable ? "No door was seen to be open or shut" : undefined}
        />
      </div>

      <Panel
        title="Doors"
        icon={DoorOpen}
        subtitle={
          calibrating
            ? "Drag a box over each doorway. Click one to move or resize it."
            : calibrated
              ? // The two counts that change what this list means, said where
                // the list is rather than only in the headline sentence.
                `Watching ${marked.length} marked doorway${marked.length === 1 ? "" : "s"}` +
                (crowded.length > 0
                  ? ` · ${crowded.length} box${crowded.length === 1 ? " has" : "es have"} 2 doorways in ${crowded.length === 1 ? "it" : "them"}`
                  : "") +
                (unreliableCount > 0
                  ? ` · ${unreliableCount} cannot be read`
                  : "")
              : "Nothing is watched until you mark a doorway"
        }
        action={
          calibrated && !calibrating ? (
            <Button
              size="sm"
              variant="ghost"
              icon={Trash2}
              onClick={() => calibrate({ clear: true })}
              disabled={saving}
            >
              Clear
            </Button>
          ) : undefined
        }
      >
        {calibrating ? (
          <>
            {calibrationError && (
              <p
                className="text-xs text-danger bg-danger-soft border border-danger/20
                           rounded-lg px-3 py-2 mb-3"
                role="alert"
              >
                {calibrationError}
              </p>
            )}

            <MarkedDoors
            doors={marked}
            selectedId={selectedDoor}
            defaultThreshold={threshold}
            saving={saving}
            onSelect={setSelectedDoor}
            onRename={(id, name) => calibrate({ update: { id, name } })}
            onThreshold={(id, open_seconds) =>
              calibrate({ update: { id, open_seconds } })
            }
              onDelete={(id) => {
                setSelectedDoor(null);
                calibrate({ remove: id });
              }}
            />
          </>
        ) : unreadable && doors.length === 0 ? (
          /* "No doors in view" is the doors module's version of an empty
             room: a statement about the world made from a picture nothing
             could be read from. */
          <UnverifiedNotice
            reason={reason}
            description="No marked doorway can be confirmed open or closed until the AI can see again."
          />
        ) : doors.length === 0 ? (
          <EmptyState
            icon={DoorOpen}
            title={
              !calibrated
                ? "No doors marked yet"
                : watching
                  ? "No doors in view"
                  : "Not watching"
            }
            description={
              !calibrated
                ? "Connect a camera, press Mark doors, and drag a box over each doorway. Each one keeps its name across restarts, and only those are watched."
                : watching
                  ? "The marked doorways will appear here as soon as the camera sees them."
                  : "Connect a camera to begin."
            }
          />
        ) : (
          <ul className="divide-y divide-border -my-2">
            {doors.map((door) => {
              // While the picture cannot be read, no door's state is a
              // finding — including a green "Closed", which is the one an
              // operator glances at and walks away from.
              const unchecked = unreadable;

              // The AI has looked at this doorway and cannot commit. Amber
              // like the unreadable picture, and for the same reason, but
              // said in its own words: the camera can see this one, it is the
              // answer that will not settle.
              const undecided = !unchecked && door.state === "unreliable";

              // Sighted over and over, never often enough for the AI to
              // settle. Amber for the same reason as the two above: "not seen
              // yet" reads as "wait a moment", and waiting is the one thing
              // that will not fix this one. The operator's move is to move
              // the box or accept this doorway cannot be watched from here.
              const starved =
                !unchecked && !undecided && door.state === null && door.starved;

              return (
                <li
                  key={door.id}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                        unchecked || undecided || starved
                          ? "bg-warning-soft text-warning"
                          : door.state === null || door.stale
                            ? "bg-subtle text-text-muted"
                            : door.severity
                              ? "bg-danger-soft text-danger"
                              : door.state === "open"
                                ? "bg-warning-soft text-warning"
                                : "bg-success-soft text-success"
                      }`}
                      aria-hidden="true"
                    >
                      {unchecked ? (
                        <EyeOff size={16} />
                      ) : undecided || starved ? (
                        <CircleHelp size={16} />
                      ) : (
                        <DoorOpen size={16} />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text truncate">
                        {door.name || `Door ${door.id}`}
                      </p>
                      <p className="text-xs text-text-secondary">
                        {unchecked
                          ? "The camera cannot see this doorway"
                          : undecided
                            ? "The AI cannot tell — the evidence keeps flipping between open and closed"
                            : starved
                              ? "Seen too rarely to judge — the AI finds this doorway in too few frames to settle on an answer. Try marking it more tightly, or a doorway the camera sees more clearly."
                              : door.state === null
                                ? "Not seen yet"
                              : door.state === "open"
                                ? `Open for ${describe(door.open_seconds)}`
                                : "Closed"}
                        {!unchecked && !undecided && door.stale && door.state !== null
                          ? " · not confirmed recently"
                          : ""}
                        {door.threshold_seconds &&
                        door.threshold_seconds !== threshold
                          ? ` · allowed ${describe(door.threshold_seconds)}`
                          : ""}
                      </p>

                      {/* Only one doorway inside this box is ever being
                          timed. Which one is not knowable from here, so the
                          row says what is true: this state describes one of
                          two, and the other is being watched by nobody. */}
                      {door.crowded && (
                        <p className="text-xs text-warning mt-0.5">
                          2 doorways are inside this marked box — only one of
                          them is being timed. Mark them separately.
                        </p>
                      )}
                    </div>
                  </div>

                  {unchecked ? (
                    <Badge variant="warning">{UNVERIFIED_LABEL}</Badge>
                  ) : undecided ? (
                    <Badge variant="warning">Cannot tell</Badge>
                  ) : starved ? (
                    <Badge variant="warning">Seen too rarely</Badge>
                  ) : door.state === null ? (
                    <Badge variant="neutral">Not seen yet</Badge>
                  ) : door.severity ? (
                    <Badge variant="danger" pulse>
                      Open too long
                    </Badge>
                  ) : door.state === "open" ? (
                    <Badge variant={door.stale ? "neutral" : "warning"}>
                      {door.stale ? "Open, unconfirmed" : "Open"}
                    </Badge>
                  ) : (
                    <Badge variant={door.stale ? "neutral" : "success"}>
                      {door.stale ? "Closed, unconfirmed" : "Closed"}
                    </Badge>
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
 * The marked doorways, while calibrating.
 *
 * Naming happens here rather than on the picture: a text field floating over a
 * video is fiddly to hit and impossible to read against a bright background,
 * and the operator is already looking at this panel to see what they have
 * marked. Selecting a row highlights it on the picture, so the two stay in
 * step without either having to duplicate the other.
 */
function MarkedDoors({
  doors,
  selectedId,
  defaultThreshold,
  saving,
  onSelect,
  onRename,
  onThreshold,
  onDelete,
}) {
  if (doors.length === 0) {
    return (
      <EmptyState
        icon={PencilRuler}
        title="No doorways marked yet"
        description="Drag a box over each doorway on the picture. Give it a name and it will keep that name across restarts."
      />
    );
  }

  return (
    <ul className="divide-y divide-border -my-2">
      {doors.map((door, index) => (
        <li
          key={door.id}
          className={`py-3 px-3 -mx-3 rounded-lg transition ${
            door.id === selectedId ? "bg-warning-soft/40" : ""
          }`}
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onSelect(door.id)}
              className="shrink-0 w-7 h-7 rounded-md bg-subtle text-text-secondary
                         text-xs font-semibold cursor-pointer
                         focus-visible:outline-2 focus-visible:outline-primary"
              aria-label={`Select ${door.name || `door ${index + 1}`} on the picture`}
            >
              {index + 1}
            </button>

            <input
              type="text"
              defaultValue={door.name}
              placeholder="Name this door"
              maxLength={60}
              onFocus={() => onSelect(door.id)}
              /* Saved on leaving the field rather than per keystroke: every
                 save is a round trip that rewrites the file on disk. */
              onBlur={(e) => {
                const value = e.target.value.trim();
                if (value !== door.name) onRename(door.id, value);
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
              onClick={() => onDelete(door.id)}
              disabled={saving}
              aria-label={`Remove ${door.name || `door ${index + 1}`}`}
            />
          </div>

          <div className="flex items-center gap-2 mt-2 pl-9">
            <span className="text-xs text-text-secondary">Allowed open:</span>

            <select
              value={door.open_seconds ?? ""}
              onChange={(e) =>
                onThreshold(door.id, e.target.value === "" ? null : Number(e.target.value))
              }
              disabled={saving}
              className="text-xs rounded-lg border border-border bg-surface px-2 py-1
                         cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
            >
              <option value="">
                Same as everything else ({describe(defaultThreshold)})
              </option>
              {[3, 10, 30, 60, 300, 900].map((s) => (
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
