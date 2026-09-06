import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Container,
  HelpCircle,
  ListChecks,
  Gauge,
  Info,
  Pentagon,
  Trash2,
  TriangleAlert,
} from "lucide-react";

import Badge from "../../components/common/Badge";
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
 * Suspended load detection.
 *
 * The Restricted Zone page's cousin, and deliberately the same page: freeze a
 * frame, mark the floor, watch it. What is marked here is the floor a lifting
 * machine works over, and it is its own shape — in a real bay the floor a jib
 * swings across is very often the exact strip people are told to keep off, so
 * sharing a polygon with either of the other two would make marking one
 * silently re-aim the rest.
 *
 * What this page has to carry, and carry prominently, is that it is one phase
 * of a capability rather than the whole of it. The name says suspended load;
 * today the module reports who is standing in the lifting area and knows
 * nothing whatever about the load. Those are different claims, and the second
 * is not a weaker version of the first — an operator who reads "no suspended
 * load" as an answer would be reading a sentence the system cannot say.
 *
 * So every load-dependent field arrives as `null`, and the page renders that
 * as "not built yet" rather than as "no". The state panel exists to say so on
 * screen, not to be filled in later and quietly start meaning something.
 */

const api = createModuleApi("suspended-load");
const POLL_MS = 3000;

/**
 * Confidence floors offered on screen, as fractions.
 *
 * Coarse on purpose. These weights answered identically at 0.45, 0.35 and
 * 0.25 on the reference footage — the useful range is wide and flat, not
 * narrow — so 0.01 steps would suggest a precision that measurement does not
 * support. Landmarks either side of the floor the backend chose.
 */
const CONFIDENCE_CHOICES = [0.25, 0.35, 0.45, 0.6, 0.75];

/** Whole percent, which is the only precision anything on this page claims. */
const percent = (value) => `${Math.round(Number(value) * 100)}%`;

/**
 * The choices to show, with the backend's default and whatever is set now
 * folded in.
 *
 * A floor that came from somewhere else — an older saved value, a future
 * default — must still appear as the selected button. Without this it would
 * silently render as "none of these are selected", which reads as though the
 * setting were not applied.
 */
function confidenceChoices(current, fallback) {
  const seen = new Map();

  for (const value of [...CONFIDENCE_CHOICES, fallback, current]) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0 || number > 1) continue;
    seen.set(Math.round(number * 100), number);
  }

  return [...seen.keys()].sort((a, b) => a - b).map((key) => seen.get(key));
}

export default function SuspendedLoad() {
  const [status, setStatus] = useState(null);
  const [serverResults, setResults] = useState(null);
  const [config, setConfig] = useState(null);
  const [error, setError] = useState(null);

  const [serverWatching, setWatching] = useState(false);

  // A checked photo: {url, result, name}. While set, the page shows the
  // still with its findings instead of a feed. Distinct from the frozen
  // still used for marking the area, which takes precedence while drawing.
  const [photo, setPhoto] = useState(null);
  const [sourceLabel, setSourceLabel] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);

  // Derived, not stored: the URL carries a timestamp to force a fresh MJPEG
  // connection, so recomputing it on every render would restart the stream
  // continuously. Memoised on `watching` it changes exactly when it should,
  // and nothing is requested while the camera is stopped.
  const serverStreamUrl = useMemo(
    () => (serverWatching ? api.streamUrl() : null),
    [serverWatching],
  );

  // This device's camera. The browser captures and pushes frames, so the model
  // can run on a GPU elsewhere while the camera stays on the operator's desk.
  // While it is running it supersedes the server-captured stream, and the
  // names below shadow the server state so the rest of the page is unchanged.
  const webcam = useWebcamAnalysis("suspended-load", { file: videoUrl });

  const watching = serverWatching || webcam.active;

  // No fallback to the server's figures while the device camera is starting:
  // they describe a different camera, and showing them beside this one's
  // picture is worse than showing nothing. Null until the first frame lands.
  //
  // Gated on watching too, so stopping clears the figures rather than leaving
  // the last intrusion on screen looking current.
  const results = photo
    ? photo.result
    : webcam.active
      ? webcam.result
      : serverWatching
        ? serverResults
        : null;

  // Only a server-captured camera arrives as a stream; this device's camera is
  // shown directly from the browser, which is smoother and saves a round trip
  // per frame. The findings — the detections and the marked area — are drawn
  // on top in that case. The server stream already has them painted in, so
  // drawing them there too would double every box and every outline.
  const streamUrl = webcam.active ? null : serverStreamUrl;

  // Zone drawing
  const [drawing, setDrawing] = useState(false);
  const [points, setPoints] = useState([]);
  const [closed, setClosed] = useState(false);
  const [frozenUrl, setFrozenUrl] = useState(null);
  const [saving, setSaving] = useState(false);

  // The picture size the corners are in.
  //
  // The corners themselves are *pixels of that picture*, never fractions —
  // ZoneCanvas converts from display space to the camera's own on the way out.
  // Sending fractions instead fails silently and expensively: a "whole frame"
  // of 0..1 rounds to a one-pixel area, and the module then correctly reports
  // "Area clear" for the rest of its life.
  const [frameSize, setFrameSize] = useState(null);

  // Two write paths, two error channels, both kept apart from the connection
  // error above — the poll clears that one on every success, and a refused
  // save is the answer to something the operator just did. Losing it after
  // three seconds leaves a dead-looking button with a live error behind it.
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

  // Load the saved area and the confidence floor once, then poll for state.
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
        // No saved area is a normal state, not an error. The confidence panel
        // falls back to whatever the results report.
      }

      // After the saved area, so the first paint carries both.
      await refresh();
    })();

    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  /* ------------------------------------------------------------------ */
  /* Marking the area                                                    */
  /* ------------------------------------------------------------------ */

  const startDrawing = () => {
    // Freeze the picture so the operator marks a still rather than chasing a
    // moving image. With this device's camera the server has no frame to give
    // — the browser holds the camera and never sends one back — so the still
    // is taken here.
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
      setSaveError("Mark at least 3 corners to make an area.");
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
          "Could not save the area.",
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
          "Could not clear the area.",
      );
    } finally {
      setSaving(false);
    }
  };

  /* ------------------------------------------------------------------ */
  /* The confidence floor                                                */
  /* ------------------------------------------------------------------ */

  const applyConfidence = async (value) => {
    setSaving(true);
    setSettingError(null);

    try {
      await api.saveConfig({ confidence: value });

      // Read back rather than assumed: the backend validates the fraction and
      // is the one that decides what was stored.
      const saved = await api.getConfig();
      if (mounted.current) setConfig(saved);

      await refresh();
    } catch (err) {
      if (mounted.current) {
        setSettingError(
          err?.response?.data?.detail ||
            err?.message ||
            "Could not change the confidence.",
        );
      }
    } finally {
      if (mounted.current) setSaving(false);
    }
  };

  /* ------------------------------------------------------------------ */

  // Could the AI judge this picture at all? A marked area is only as good as
  // the ability to see somebody standing in it, and "Area clear" over a
  // picture nobody could read is the same false all-clear in different words.
  const { unreadable, reason } = readLegibility(results);

  const alert = Boolean(results?.alert) && !unreadable;

  // Sounds where the operator is. The backend's alarm beeps on the machine
  // running the service, which nobody is sitting next to.
  //
  // The sentence comes from the result's `spoken` field rather than being
  // written here, so the words an operator hears and the words the module
  // means cannot drift apart. `spoken` is null when nothing is wrong, which
  // only matters if it were ever read while silent — it is not.
  const sound = useAlertSound(alert, results?.summary, {
    spoken: results?.spoken ?? undefined,
    unverified: {
      active: watching && unreadable && !drawing,
      spoken: unverifiedSpeech("the lifting area", reason),
      resumed:
        watching && !unreadable
          ? resumedSpeech("The lifting area")
          : null,
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

  // Whether an area is marked at all.
  //
  // Taken from /status rather than from the result's `zone_configured`, which
  // looks like the obvious field and is not a live one: /results hands back
  // whatever the module last stored, and saving an area does not refresh that
  // store. Measured on this backend — area saved, camera connected, nothing
  // yet consuming frames — /status reports configured: true while /results
  // still reports zone_configured: false, and the module only starts
  // analysing once something is reading its pictures. /status asks the
  // module the question live every poll; the saved area is the fallback until
  // the first status lands.
  const drawn = closed && points.length >= 3;
  const hasZone = status?.configured ?? drawn;

  // Has anything actually been judged? Same reason: a connected camera whose
  // pictures nobody is reading leaves the stored result at `status: "idle"`,
  // and "Area is clear" over a module that has not looked is the same false
  // all-clear this product spends its screens refusing to print.
  const judged = Boolean(results?.status) && results.status !== "idle";

  // Stated strictly, so a backend that does not publish the field is not
  // accused of a missing model. It matters more here than on most pages: with
  // no weights the module returns an empty result — no alert, a readable
  // picture, nothing found — which this page would otherwise render as a calm
  // "Area is clear" over a module that never looked.
  const modelMissing = status?.model_loaded === false;

  const confidence = Number(
    results?.confidence ?? config?.confidence ?? config?.confidence_default,
  );
  const confidenceDefault = Number(config?.confidence_default);
  const belowMeasuredFloor =
    Number.isFinite(confidence) &&
    Number.isFinite(confidenceDefault) &&
    confidence < confidenceDefault;

  const classes = config?.classes?.length ? config.classes : ["person"];

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
        {hasZone ? "Redraw area" : "Mark area"}
      </Button>
      {hasZone && (
        <Button
          variant="ghost"
          icon={Trash2}
          onClick={clearZone}
          loading={saving}
          aria-label="Remove area"
        />
      )}
    </>
  );

  return (
    <ModuleLayout
      title="Suspended load detection"
      description="The AI watches the floor a lifting machine works over and alerts while somebody is standing in it. It does not yet detect the load itself."
      icon={Container}
      watching={watching}
      alert={alert}
      unverified={unreadable && !drawing}
      actions={
        /* Wrapped and capped, because the shell's action row is `shrink-0`
           with no wrap of its own. Measured on a 390px viewport with an area
           marked and a camera running, these five controls come to 437px —
           47px of sideways scroll, which puts the mute control off the right
           edge of a phone. The cap makes them fold onto a second line
           instead; on a desk it is never reached and nothing moves. */
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
             boxes from a moment ago would sit over a picture they no longer
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
          /* Not while drawing: the operator is marking corners on a still they
             chose, and hatching it over would only be in the way. */
          unverified={unreadable && !drawing}
          unverifiedReason={reason}
          statusLabel={
            drawing
              ? "Marking area"
              : alert
                ? "Person in lifting area"
                : photo
                  ? "Checked photo"
                  : undefined
          }
          /* Only while drawing. Once saved, the area comes back with the
             findings and is drawn with them, so overlaying it here as well
             would draw the same shape twice. */
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
              // The backend drops the area when the camera changes: it was
              // drawn on a different picture. Clear it here too, or the page
              // keeps reporting an area that is no longer being watched.
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

          <Panel title="Marked area" icon={Pentagon}>
            {hasZone && unreadable ? (
              /* The area is still marked, but "somebody standing inside it
                 raises an alert" stops being true the moment the picture
                 cannot be read, and that sentence is the one an operator
                 relies on. Nothing about people is said here: this module
                 judges none, so it leaves nobody unverified. */
              <UnverifiedNotice
                reason={reason}
                description="The area is still marked, but somebody standing in it would not be spotted."
              />
            ) : hasZone ? (
              /* Marked and watched are two facts, and only one of them is
                 about the area. A saved area beside a stopped camera is not
                 being watched by anything, and saying it is would be the same
                 quiet all-clear this product spends the rest of its screens
                 avoiding. */
              <div className="space-y-2 text-sm">
                <p className="text-text">
                  An area with{" "}
                  <span className="font-semibold">
                    {points.length || "several"} corners
                  </span>{" "}
                  is {watching ? "being watched" : "marked"}.
                </p>
                <p className="text-xs text-text-secondary">
                  {watching
                    ? "Somebody standing inside it raises an alert."
                    : "Nothing is watching it until a camera is running."}
                </p>
              </div>
            ) : (
              <EmptyState
                icon={Pentagon}
                title="No area marked yet"
                description={
                  watching
                    ? "Nothing is being watched until an area is marked. Use Mark area above, then click each corner on the picture. Double-click to finish."
                    : "Nothing is being watched. Start watching a camera first, then mark the floor the lifting machine works over."
                }
              />
            )}
          </Panel>

          <Panel title="Alert confidence" icon={Gauge}>
            <div className="space-y-3">
              <p className="text-sm text-text-secondary">
                Ignore any sighting the AI is less sure of than:
              </p>

              <div className="flex flex-wrap gap-2">
                {confidenceChoices(confidence, confidenceDefault).map(
                  (value) => (
                    <Button
                      key={value}
                      size="sm"
                      variant={
                        Math.round(value * 100) === Math.round(confidence * 100)
                          ? "primary"
                          : "secondary"
                      }
                      onClick={() => applyConfidence(value)}
                      disabled={saving}
                    >
                      {percent(value)}
                    </Button>
                  ),
                )}
              </div>

              {/* The module's own account of where its floor came from, shown
                  verbatim beside the control that changes it. Written in the
                  backend rather than here so the number and the reasoning
                  behind it cannot be edited apart. */}
              {config?.confidence_note && (
                <p className="text-xs text-text-secondary bg-subtle border border-border rounded-lg px-3 py-2">
                  {config.confidence_note}
                </p>
              )}

              {belowMeasuredFloor && (
                <p className="text-xs text-warning font-medium">
                  Below {percent(confidenceDefault)} the false positives
                  measured on people-free footage start coming back.
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

          <Panel title="What this page does and does not know" icon={Info}>
            <div className="space-y-3 text-xs text-text-secondary leading-relaxed">
              {/* First, because it is the sentence most likely to be
                  misread from the page's own name. */}
              <p className="text-text font-medium">
                This phase watches the lifting area for people. It does not
                detect the load.
              </p>

              <p>
                Whether anything is hanging, whether it is raised, and whether
                a worker is underneath it are all reported as{" "}
                <span className="font-medium text-text">not known</span> — not
                as &ldquo;no&rdquo;. Those are different answers and only one
                of them is true today.
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <span>It has been taught one thing:</span>
                {classes.map((name) => (
                  <Badge key={name} variant="neutral" dot={false}>
                    {name}
                  </Badge>
                ))}
              </div>

              {/* The figures are the backend's, measured rather than
                  estimated, and they are here because an operator deciding
                  how much weight to put on an alert needs them more than a
                  reviewer reading the service does. */}
              <p>
                It uses stronger person weights than the rest of the system.
                On this bay&apos;s own footage the shared model returned{" "}
                <span className="font-medium text-text">nobody</span> on three
                consecutive samples of frames that held three people. These
                weights find them, and answer the same at 45%, 35% and 25%
                confidence rather than changing their mind as the bar moves.
              </p>

              <p>
                It still misses people. A worker standing by the jib arm went
                undetected in one of those same frames, so an all-clear here is
                weaker evidence than an alert.
              </p>
            </div>
          </Panel>

          <Panel title="Past lifting-area events" icon={TriangleAlert}>
            {/* Refreshed when the alert state changes, so something spotted
                while the operator is watching appears without a reload. */}
            <RecentEvents moduleId="suspended-load" refreshToken={alert ? 1 : 0} />
          </Panel>
        </>
      }
    >
      <StatusCard
        status={
          modelMissing
            ? "idle"
            : alert
              ? "alert"
              : unreadable
                ? "unverified"
                : hasZone && watching && judged
                  ? "ok"
                  : "idle"
        }
        title={
          modelMissing
            ? "Suspended load detection is not available"
            : alert
              ? results.summary
              : unreadable
                ? reason
                : !hasZone
                  ? "No area marked yet"
                  : !watching
                    ? "Not watching this area"
                    : judged
                      ? "Area is clear"
                      : "Waiting for the first picture"
        }
        description={
          modelMissing
            ? "The person-detection model is not installed on this system."
            : alert
              ? "Somebody is standing in the lifting area. Check the live view and respond according to your site's safety procedure."
              : unreadable
                ? unverifiedDescription(
                    hasZone
                      ? "The lifting area is not being watched — somebody could be standing in it."
                      : "Nothing is being watched.",
                  )
                : !hasZone
                  ? "Nothing is watched until an area is marked. Connect a camera, then mark the floor the lifting machine works over."
                  : !watching
                    ? "Connect a camera to begin watching the marked area."
                    : judged
                      ? "The lifting area is being watched. You'll be alerted while somebody is standing in it."
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
      {judged && !modelMissing && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          <StatisticsCard
            label="Workers in view"
            value={measuredCount(results.workers_total ?? 0, unreadable)}
            icon={Container}
            tone="neutral"
            hint={
              unreadable
                ? "Nothing could be checked"
                : "Anywhere in the picture, inside the area or not"
            }
          />
          <StatisticsCard
            label="Inside the marked area"
            value={measuredCount(results.workers_in_area ?? 0, unreadable)}
            icon={Pentagon}
            tone={
              unreadable
                ? "neutral"
                : results.workers_in_area > 0
                  ? "danger"
                  : successTone(hasZone && judged, { unreadable, unverified: 0 })
            }
            hint={
              unreadable
                ? "Nothing could be checked"
                : !hasZone
                  ? "No area marked — nothing is being watched"
                  : results.workers_in_area > 0
                    ? "Needs attention"
                    : "Nothing outstanding"
            }
          />
          <StatisticsCard
            label="Load state"
            value={results.suspended_load === null ? "Not known" : "—"}
            icon={HelpCircle}
            tone="neutral"
            hint="Load detection is a later phase"
          />
          <StatisticsCard
            label="Alert confidence"
            value={Number.isFinite(confidence) ? percent(confidence) : "—"}
            icon={Gauge}
            tone={belowMeasuredFloor ? "warning" : "neutral"}
            hint={
              belowMeasuredFloor
                ? `Below the ${percent(confidenceDefault)} measured floor`
                : "Anything the AI is less sure of is ignored"
            }
          />
        </div>
      )}

      {/* The capability's own progress, on the page it is named for.
          Written as a list of claims with their state rather than a
          progress bar: an operator needs to know which questions this
          screen can answer today, and a bar would tell them how far along
          somebody else's project is. */}
      <Panel title="What this capability answers today" icon={ListChecks}>
        <ul className="space-y-2 text-xs">
          {[
            ["Somebody in the lifting area", true],
            ["A load is present", false],
            ["The load is raised", false],
            ["The load is suspended", false],
            ["A worker is under a suspended load", false],
            ["How close a worker is to a suspended load", false],
          ].map(([claim, answered]) => (
            <li key={claim} className="flex items-center gap-2">
              <Badge variant={answered ? "success" : "neutral"} dot={false}>
                {answered ? "Answered" : "Not yet"}
              </Badge>
              <span className={answered ? "text-text" : "text-text-secondary"}>
                {claim}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-text-secondary leading-relaxed">
          {results?.state_reason ||
            "Load detection is not built yet — this page reports who is in the lifting area, not whether anything is hanging."}
        </p>
      </Panel>

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
