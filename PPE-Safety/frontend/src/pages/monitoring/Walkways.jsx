import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Footprints,
  Info,
  Package,
  Pentagon,
  Timer,
  Trash2,
  TriangleAlert,
  Users,
} from "lucide-react";

import Button from "../../components/common/Button";
import Panel from "../../components/common/Panel";
import StatisticsCard from "../../components/common/StatisticsCard";
import StatusCard from "../../components/common/StatusCard";
import { EmptyState, ErrorState } from "../../components/common/States";
import AlertSoundToggle from "../../components/monitoring/AlertSoundToggle";
import CameraInputCard from "../../components/monitoring/CameraInputCard";
import LiveFeed from "../../components/monitoring/LiveFeed";
import ModuleLayout from "../../components/monitoring/ModuleLayout";
import RecentEvents from "../../components/monitoring/RecentEvents";
import StopMonitoringButton from "../../components/monitoring/StopMonitoringButton";
import UnverifiedNotice from "../../components/monitoring/UnverifiedNotice";
import ZoneCanvas from "../../components/zones/ZoneCanvas";
import { cameraApi, createModuleApi } from "../../services/moduleApi";
import { useWebcamAnalysis } from "../../hooks/useWebcamAnalysis";
import { useAlertSound } from "../../hooks/useAlertSound";
import {
  measuredCount,
  readLegibility,
  resumedSpeech,
  successTone,
  unverifiedDescription,
  unverifiedSpeech,
} from "../../components/monitoring/legibility";

/**
 * Object Blocking Walkways.
 *
 * The same page as the two zone modules — freeze a frame, mark the floor,
 * watch it — because it is the same job with the question inverted: those mark
 * floor something must stay *off*, this marks floor that must stay *clear*.
 *
 * Two things here are specific to this module and both are on screen rather
 * than only in the backend.
 *
 * It carries no object model. It finds what is not the walkway's own floor, by
 * learning the floor's colours from the marked strip itself — a floor colour is
 * one that appears all along the lane, an obstruction is one that appears in a
 * single place. That matters to an operator because it means the module will
 * report a pallet, a drum or a spill without ever having been taught what
 * those are, and equally that it cannot name what it has found.
 *
 * And it waits. "Blocking" is not a fact about one photograph — a cage being
 * pushed through and a cage abandoned look identical in a still — so something
 * has to stay put before anything is raised. That wait is a real delay, so the
 * page says how long it is and shows candidates serving it, rather than
 * leaving an operator to discover it as lag.
 */

const api = createModuleApi("walkways");
const POLL_MS = 3000;

/**
 * Waits offered on screen, in seconds.
 *
 * Landmarks rather than a slider, and coarse for an honest reason: unlike the
 * detector's own settings, this one has no measurement behind it. It is a
 * judgement about the traffic on a particular lane — see the backend's
 * `settle_note` — and offering one-second steps would suggest a precision
 * nobody has established.
 */
const WAIT_CHOICES = [3, 5, 10, 20];

const seconds = (value) => `${Math.round(Number(value))}s`;

/** Whole percent, which is the only precision anything on this page claims. */
const percent = (value) => `${Math.round(Number(value) * 100)}%`;

/**
 * The waits to show, with the backend's default and whatever is set now folded
 * in — so a value from an older save still renders as the selected button
 * rather than as "none of these are selected".
 */
function waitChoices(current, fallback) {
  const seen = new Map();

  for (const value of [...WAIT_CHOICES, fallback, current]) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0 || number > 120) continue;
    seen.set(Math.round(number), number);
  }

  return [...seen.keys()].sort((a, b) => a - b).map((key) => seen.get(key));
}

export default function Walkways() {
  const [status, setStatus] = useState(null);
  const [serverResults, setResults] = useState(null);
  const [config, setConfig] = useState(null);
  const [error, setError] = useState(null);

  const [serverWatching, setWatching] = useState(false);

  // A checked photo: {url, result, name}. While set, the page shows the still
  // with its findings instead of a feed.
  const [photo, setPhoto] = useState(null);
  const [sourceLabel, setSourceLabel] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);

  // Derived, not stored: the URL carries a timestamp to force a fresh MJPEG
  // connection, so recomputing it every render would restart the stream
  // continuously.
  const serverStreamUrl = useMemo(
    () => (serverWatching ? api.streamUrl() : null),
    [serverWatching],
  );

  // This device's camera. The browser captures and pushes frames, so the
  // analysis can run on a GPU elsewhere while the camera stays on the
  // operator's desk.
  const webcam = useWebcamAnalysis("walkways", { file: videoUrl });

  const watching = serverWatching || webcam.active;

  // No fallback to the server's figures while the device camera is starting:
  // they describe a different camera. Gated on watching too, so stopping
  // clears the figures rather than leaving the last finding on screen looking
  // current.
  const results = photo
    ? photo.result
    : webcam.active
      ? webcam.result
      : serverWatching
        ? serverResults
        : null;

  // Only a server-captured camera arrives as a stream; this device's camera is
  // shown directly from the browser, with the findings drawn on top. The
  // server stream already has them painted in.
  const streamUrl = webcam.active ? null : serverStreamUrl;

  // Marking the walkway
  const [drawing, setDrawing] = useState(false);
  const [points, setPoints] = useState([]);
  const [closed, setClosed] = useState(false);
  const [frozenUrl, setFrozenUrl] = useState(null);
  const [saving, setSaving] = useState(false);

  // The picture size the corners are in. The corners themselves are *pixels of
  // that picture*, never fractions — ZoneCanvas converts on the way out.
  const [frameSize, setFrameSize] = useState(null);

  const [saveError, setSaveError] = useState(null);
  const [settingError, setSettingError] = useState(null);

  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [nextStatus, nextResults] = await Promise.all([
        api.getStatus(),
        api.getResults(),
      ]);

      if (!mounted.current) return;

      setStatus(nextStatus);
      setResults(nextResults);
      setWatching(Boolean(nextStatus.camera?.connected));
      setError(null);
    } catch (err) {
      if (!mounted.current) return;
      setError(err?.message || "Could not reach the AI system.");
    }
  }, []);

  // Load the saved walkway and settings once, then poll for state.
  useEffect(() => {
    (async () => {
      try {
        const saved = await api.getConfig();
        if (!mounted.current) return;

        setConfig(saved);

        if (saved?.polygon?.length >= 3) {
          setPoints(saved.polygon);
          setClosed(true);
        }
      } catch {
        // No saved walkway is a normal state, not an error.
      }

      await refresh();
    })();

    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  /* ------------------------------------------------------------------ */
  /* Marking the walkway                                                 */
  /* ------------------------------------------------------------------ */

  const startDrawing = () => {
    // Freeze the picture so the operator marks a still rather than chasing a
    // moving image. With this device's camera the server has no frame to give,
    // so the still is taken here.
    const still = webcam.active ? webcam.snapshot() : cameraApi.freezeFrameUrl();

    if (!still) {
      setError("The camera has not sent a picture yet. Try again in a moment.");
      return;
    }

    setFrozenUrl(still);
    setPoints([]);
    setClosed(false);
    setSaveError(null);
    setDrawing(true);
  };

  const finishDrawing = async () => {
    if (points.length < 3) {
      setSaveError("Mark at least 3 corners to make a walkway.");
      return;
    }

    setSaving(true);

    try {
      await api.saveConfig({
        polygon: points,
        frame_width: frameSize?.width,
        frame_height: frameSize?.height,
      });
      setClosed(true);
      setDrawing(false);
      setFrozenUrl(null);
      setSaveError(null);
      await refresh();
    } catch (err) {
      setSaveError(
        err?.response?.data?.detail ||
          err?.message ||
          "Could not save the walkway.",
      );
    } finally {
      setSaving(false);
    }
  };

  const clearZone = async () => {
    setSaving(true);

    try {
      await api.saveConfig({ polygon: [] });
      setPoints([]);
      setClosed(false);
      setDrawing(false);
      setFrozenUrl(null);
      setError(null);
      await refresh();
    } catch (err) {
      setSaveError(
        err?.response?.data?.detail ||
          err?.message ||
          "Could not clear the walkway.",
      );
    } finally {
      setSaving(false);
    }
  };

  /* ------------------------------------------------------------------ */
  /* The wait                                                            */
  /* ------------------------------------------------------------------ */

  const applyWait = async (value) => {
    setSaving(true);
    setSettingError(null);

    try {
      await api.saveConfig({ settle_seconds: value });

      // Read back rather than assumed: the backend validates the number and is
      // the one that decides what was stored.
      const saved = await api.getConfig();
      if (mounted.current) setConfig(saved);

      await refresh();
    } catch (err) {
      if (mounted.current) {
        setSettingError(
          err?.response?.data?.detail ||
            err?.message ||
            "Could not change the wait.",
        );
      }
    } finally {
      if (mounted.current) setSaving(false);
    }
  };

  /* ------------------------------------------------------------------ */

  // Could the AI judge this picture at all? "Walkway clear" over a picture
  // nobody could read is the same false all-clear in different words.
  const { unreadable, reason } = readLegibility(results);

  // This module has a second way of being unable to answer, and it is its own.
  // The picture can be perfectly legible while the marked strip is not floor —
  // an area drawn over racking or a stack of pallets has no floor to learn
  // from, and calling that clear would be a confident answer to a question
  // nothing asked.
  const floorUnreadable = results?.floor_readable === false;

  const alert = Boolean(results?.alert) && !unreadable;

  // Sounds where the operator is. The sentence comes from the result's
  // `spoken` field rather than being written here, so the words an operator
  // hears and the words the module means cannot drift apart.
  const sound = useAlertSound(alert, results?.summary, {
    spoken: results?.spoken ?? undefined,
    unverified: {
      active: watching && unreadable && !drawing,
      spoken: unverifiedSpeech("the walkway", reason),
      resumed:
        watching && !unreadable ? resumedSpeech("The walkway") : null,
    },
  });

  // The header's stop-everything control. The camera card's own toggle only
  // stops the source whose tile is selected; this halts whatever is running.
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

  // Whether a walkway is marked at all. Taken from /status rather than from
  // the result's `zone_configured`, which is not a live field: /results hands
  // back whatever the module last stored, and saving does not refresh that
  // store. /status asks the module the question live every poll.
  const drawn = closed && points.length >= 3;
  const hasZone = status?.configured ?? drawn;

  // Has anything actually been judged? A connected camera whose pictures
  // nothing is reading leaves the stored result at "idle", and "Walkway is
  // clear" over a module that has not looked is the same false all-clear.
  const judged = Boolean(results?.status) && results.status !== "idle";

  const wait = Number(
    results?.settle_seconds ?? config?.settle_seconds ?? config?.settle_seconds_default,
  );
  const waitDefault = Number(config?.settle_seconds_default);

  const minShare = Number(results?.min_share ?? config?.min_share);
  const blocking = Number(results?.objects_blocking ?? 0);
  const settling = Number(results?.objects_settling ?? 0);
  const excluded = Number(results?.people_excluded ?? 0);

  // -1 is the backend saying the person model failed on this frame, so nobody
  // was cut out. Worth showing plainly: with people not excluded, a worker
  // walking down the lane can be reported as an obstruction.
  const peopleUnknown = excluded < 0;

  const zoneActions = drawing ? (
    <>
      <Button
        variant="primary"
        icon={Check}
        onClick={finishDrawing}
        loading={saving}
      >
        Done
      </Button>
      <Button variant="secondary" onClick={clearZone} disabled={saving}>
        Cancel
      </Button>
    </>
  ) : (
    <>
      <Button
        variant="secondary"
        icon={Pentagon}
        onClick={startDrawing}
        disabled={!watching}
      >
        {hasZone ? "Redraw walkway" : "Mark walkway"}
      </Button>
      {hasZone && (
        <Button
          variant="ghost"
          icon={Trash2}
          onClick={clearZone}
          loading={saving}
          aria-label="Remove walkway"
        />
      )}
    </>
  );

  return (
    <ModuleLayout
      title="Object Blocking Walkways"
      description="The AI watches the marked walkway and alerts when something is left blocking it. People walking through are excluded."
      icon={Footprints}
      watching={watching}
      alert={alert}
      unverified={(unreadable || floorUnreadable) && !drawing}
      actions={
        /* Wrapped and capped for the same reason as the zone pages: the
           shell's action row is `shrink-0` with no wrap of its own, and on a
           390px viewport these controls otherwise push the mute button off the
           right edge. */
        <div className="flex flex-wrap items-center justify-end gap-2 max-w-[calc(100vw-2rem)]">
          {zoneActions}
          <StopMonitoringButton watching={watching} onStop={stopMonitoring} />
          <AlertSoundToggle
            muted={sound.muted}
            setMuted={sound.setMuted}
            test={sound.test}
            supported={sound.supported}
          />
        </div>
      }
      feed={
        <LiveFeed
          streamUrl={streamUrl}
          mediaStream={webcam.active ? webcam.stream : null}
          /* Not while drawing: the operator is marking corners on a still, and
             findings from a moment ago would sit over a picture they no longer
             describe. */
          findings={
            drawing
              ? null
              : photo
                ? photo.result
                : webcam.active
                  ? results
                  : null
          }
          frozenUrl={drawing ? frozenUrl : photo?.url ?? null}
          connected={watching}
          watching={watching}
          alert={alert}
          unverified={unreadable && !drawing}
          unverifiedReason={reason}
          statusLabel={
            drawing
              ? "Marking walkway"
              : alert
                ? "Something is blocking the walkway"
                : photo
                  ? "Checked photo"
                  : settling > 0
                    ? "Checking something in the walkway"
                    : undefined
          }
          /* Only while drawing. Once saved, the walkway comes back with the
             findings and is drawn with them. */
          overlay={
            drawing
              ? (size) => (
                  <ZoneCanvas
                    active
                    points={points}
                    setPoints={setPoints}
                    closed={closed}
                    onClose={finishDrawing}
                    displaySize={size}
                    onFrameSize={setFrameSize}
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
            busy={drawing}
            onSourceChanged={(label, recording = null) => {
              setSourceLabel(label);
              setVideoUrl(recording);
              // The backend drops the walkway when the camera changes: it was
              // drawn on a different picture. Clear it here too, or the page
              // keeps reporting a walkway that is no longer being watched.
              setPoints([]);
              setClosed(false);
              setDrawing(false);
              setFrozenUrl(null);
              setFrameSize(null);
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

          <Panel title="Marked walkway" icon={Pentagon}>
            {hasZone && unreadable ? (
              /* The walkway is still marked, but "something left in it raises
                 an alert" stops being true the moment the picture cannot be
                 read, and that sentence is the one an operator relies on. */
              <UnverifiedNotice
                reason={reason}
                description="The walkway is still marked, but something left blocking it would not be spotted."
              />
            ) : hasZone && floorUnreadable ? (
              /* Legible picture, unusable marking. Its own sentence, because
                 the fix is different: this one is answered by redrawing. */
              <UnverifiedNotice
                reason="Little of the marked area looks like floor."
                description="The walkway is judged by learning what its own floor looks like, and almost none of what is marked is floor. Redraw it around the lane itself rather than the racking or pallets beside it."
              />
            ) : hasZone ? (
              /* Marked and watched are two facts, and only one of them is
                 about the walkway. */
              <div className="space-y-2 text-sm">
                <p className="text-text">
                  A walkway with{" "}
                  <span className="font-semibold">
                    {points.length || "several"} corners
                  </span>{" "}
                  is {watching ? "being watched" : "marked"}.
                </p>
                <p className="text-xs text-text-secondary">
                  {watching
                    ? `Anything left in it for more than ${seconds(wait)} raises an alert.`
                    : "Nothing is watching it until a camera is running."}
                </p>
              </div>
            ) : (
              <EmptyState
                icon={Pentagon}
                title="No walkway marked yet"
                description={
                  watching
                    ? "Nothing is being watched until a walkway is marked. Use Mark walkway above, then click each corner of the lane on the picture. Double-click to finish."
                    : "Nothing is being watched. Start watching a camera first, then mark the lane that has to stay clear."
                }
              />
            )}
          </Panel>

          <Panel title="How long before it alerts" icon={Timer}>
            <div className="space-y-3">
              <p className="text-sm text-text-secondary">
                Something has to stay put for this long before it counts as
                being left there:
              </p>

              <div className="flex flex-wrap gap-2">
                {waitChoices(wait, waitDefault).map((value) => (
                  <Button
                    key={value}
                    size="sm"
                    variant={
                      Math.round(value) === Math.round(wait)
                        ? "primary"
                        : "secondary"
                    }
                    onClick={() => applyWait(value)}
                    disabled={saving}
                  >
                    {seconds(value)}
                  </Button>
                ))}
              </div>

              {/* The module's own account of the setting, shown verbatim
                  beside the control that changes it. Written in the backend so
                  the number and the reasoning behind it cannot be edited
                  apart — including that this one is a judgement rather than a
                  measurement, which is worth an operator knowing. */}
              {config?.settle_note && (
                <p className="text-xs text-text-secondary bg-subtle border border-border rounded-lg px-3 py-2">
                  {config.settle_note}
                </p>
              )}

              {settingError && (
                <p
                  className="text-xs text-danger bg-danger-soft border border-danger/20
                             rounded-lg px-3 py-2"
                  role="alert"
                >
                  {settingError}
                </p>
              )}
            </div>
          </Panel>

          <Panel title="How this AI decides" icon={Info}>
            <div className="space-y-3 text-xs text-text-secondary leading-relaxed">
              <p>
                It has not been taught a list of objects. It learns what the
                marked lane&apos;s own floor looks like — a floor colour is one
                that appears all along the lane, and something lying in it
                appears in{" "}
                <span className="font-medium text-text">one place</span>.
              </p>

              <p>
                So it will report a pallet, a drum, a cage or a spill without
                ever having been shown one — and equally, it cannot tell you
                which of those it has found. It reports that something is
                there, how much of the lane it covers, and where.
              </p>

              {/* The figures are the backend's, measured rather than
                  estimated, and they belong where an operator deciding how
                  much weight to give an alert will read them. */}
              <p>
                Measured on a warehouse aisle, over every frame of a clip: a
                cardboard box left in the lane was found on{" "}
                <span className="font-medium text-text">238 of 240 frames</span>
                , and the clear aisle marked alongside it raised{" "}
                <span className="font-medium text-text">nothing at all</span> on
                any frame.
              </p>

              <p>
                People are cut out of the picture before the floor is judged, so
                a worker using the walkway never raises anything.
              </p>

              <p>
                What it cannot do: see an object the same colour as the floor it
                sits on, or judge a lane that is mostly not floor — mark a bay
                stacked with pallets and the pallets become the floor. Anything
                smaller than{" "}
                <span className="font-medium text-text">
                  {Number.isFinite(minShare) ? percent(minShare) : "a fraction"}
                </span>{" "}
                of the marked lane is treated as a mark on the floor rather than
                an object.
              </p>
            </div>
          </Panel>

          <Panel title="Past walkway events" icon={TriangleAlert}>
            {/* Refreshed when the alert state changes, so something spotted
                while the operator is watching appears without a reload. */}
            <RecentEvents moduleId="walkways" refreshToken={alert ? 1 : 0} />
          </Panel>
        </>
      }
    >
      <StatusCard
        status={
          alert
            ? "alert"
            : unreadable || floorUnreadable
              ? "unverified"
              : hasZone && watching && judged
                ? "ok"
                : "idle"
        }
        title={
          alert
            ? results.summary
            : unreadable
              ? reason
              : floorUnreadable
                ? "Cannot tell — little of the marked area looks like floor"
                : !hasZone
                  ? "No walkway marked yet"
                  : !watching
                    ? "Not watching this walkway"
                    : judged
                      ? "Walkway is clear"
                      : "Waiting for the first picture"
        }
        description={
          alert
            ? "Something has been left in the marked walkway. Check the live view and clear the route."
            : unreadable
              ? unverifiedDescription(
                  hasZone
                    ? "The marked walkway is not being watched — something could be blocking it."
                    : "Nothing is being watched.",
                )
              : floorUnreadable
                ? "The walkway is judged by learning what its own floor looks like, and almost none of the marked area is floor. Redraw it around the lane itself."
                : !hasZone
                  ? "Nothing is watched until a walkway is marked. Connect a camera, then mark the lane that has to stay clear."
                  : !watching
                    ? "Connect a camera to begin watching the marked walkway."
                    : judged
                      ? settling > 0
                        ? `Something is in the walkway and is being timed. It raises an alert if it is still there after ${seconds(wait)}.`
                        : "The marked walkway is being watched. You'll be alerted if anything is left blocking it."
                      : "The camera is connected, but nothing has been judged yet — this is not an all-clear."
        }
        meta={
          status?.camera?.source ? `Camera: ${status.camera.source}` : undefined
        }
        pulse
      />

      {/* Only once something has actually looked. A row of zeroes beside a
          stopped camera — or beside a connected one whose pictures nothing is
          reading yet — is a count nobody took, and reads as an all-clear. */}
      {judged && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          <StatisticsCard
            label="Blocking the walkway"
            value={measuredCount(blocking, unreadable || floorUnreadable)}
            icon={Package}
            tone={
              unreadable || floorUnreadable
                ? "neutral"
                : blocking > 0
                  ? "danger"
                  : successTone(hasZone && judged, {
                      unreadable,
                      unverified: 0,
                    })
            }
            hint={
              unreadable || floorUnreadable
                ? "Nothing could be checked"
                : !hasZone
                  ? "No walkway marked — nothing is being watched"
                  : blocking > 0
                    ? "Needs attention"
                    : "Nothing outstanding"
            }
          />
          <StatisticsCard
            label="Being timed"
            value={measuredCount(settling, unreadable || floorUnreadable)}
            icon={Timer}
            tone={settling > 0 ? "warning" : "neutral"}
            hint={
              unreadable || floorUnreadable
                ? "Nothing could be checked"
                : settling > 0
                  ? `Alerts if still there after ${seconds(wait)}`
                  : "Nothing waiting to be judged"
            }
          />
          <StatisticsCard
            label="People excluded"
            value={peopleUnknown ? "—" : measuredCount(excluded, unreadable)}
            icon={Users}
            tone={peopleUnknown ? "warning" : "neutral"}
            hint={
              peopleUnknown
                ? "The person AI did not run on this picture"
                : "Cut out before the floor was judged, so nobody is reported as an obstruction"
            }
          />
        </div>
      )}

      {(saveError || error || webcam.error) && (
        <Panel>
          <ErrorState
            detail={saveError || webcam.error || error}
            onRetry={saveError ? finishDrawing : refresh}
          />
        </Panel>
      )}
    </ModuleLayout>
  );
}
