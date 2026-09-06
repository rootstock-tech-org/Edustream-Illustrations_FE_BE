import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Clock, Pentagon, ScanLine, Trash2, Users } from "lucide-react";

import Badge from "../../components/common/Badge";
import Button from "../../components/common/Button";
import Panel from "../../components/common/Panel";
import StatusCard from "../../components/common/StatusCard";
import { EmptyState, ErrorState } from "../../components/common/States";
import CameraInputCard from "../../components/monitoring/CameraInputCard";
import LiveFeed from "../../components/monitoring/LiveFeed";
import ModuleLayout from "../../components/monitoring/ModuleLayout";
import UnverifiedNotice from "../../components/monitoring/UnverifiedNotice";
import ZoneCanvas from "../../components/zones/ZoneCanvas";
import { cameraApi, createModuleApi } from "../../services/moduleApi";
import { useWebcamAnalysis } from "../../hooks/useWebcamAnalysis";
import { useAlertSound } from "../../hooks/useAlertSound";
import AlertSoundToggle from "../../components/monitoring/AlertSoundToggle";
import StopMonitoringButton from "../../components/monitoring/StopMonitoringButton";
import {
  peopleCount,
  readLegibility,
  resumedSpeech,
  unverifiedDescription,
  unverifiedSpeech,
} from "../../components/monitoring/legibility";

/**
 * Restricted Zone monitoring.
 *
 * Marks zones the way Doors marks doorways: several per camera, each with a
 * name, managed in a list. Mark zones enters a marking mode; every polygon
 * closed with a double-click is saved on the spot and the mode stays on for
 * the next one, so a floor plan of three zones is one session, not three.
 * Names are given afterwards, inline in the list — the same rename-in-place
 * the Doors page uses — and the alert says which zone was entered.
 */

const api = createModuleApi("restricted-zone");
const POLL_MS = 3000;

/** What a zone with no name is called on screen. */
const fallbackName = (zone) => zone.name || `Zone ${zone.id}`;

/**
 * This device's timezone, saved with a curfew so the hours mean the same
 * wherever the server happens to run. Read once — it does not change while
 * a page is open, and an operator who travels re-sets the window anyway.
 */
const DEVICE_ZONE = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
})();

/**
 * A clock reading, as it reads: "Fri 21 Aug, 17:16".
 *
 * The backend sends a wall-clock string, not an instant, so it is parsed as
 * local and rendered straight back. Appending a Z would shift it by exactly
 * the offset this panel exists to expose.
 */
function readClock(value) {
  if (!value) return null;
  const at = value instanceof Date ? value : new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(at.getTime())) return String(value);
  return at.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** A clock gap in words: "5 hours 30 minutes ahead of". */
function driftWords(minutes) {
  const total = Math.abs(minutes);
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  const parts = [];
  if (hours) parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
  if (mins || !hours) parts.push(`${mins} minute${mins === 1 ? "" : "s"}`);
  return `${parts.join(" ")} ${minutes > 0 ? "ahead of" : "behind"}`;
}

export default function RestrictedZone() {
  const [status, setStatus] = useState(null);
  const [serverResults, setResults] = useState(null);
  const [error, setError] = useState(null);

  const [serverWatching, setWatching] = useState(false);

  // A checked photo: {url, result, name}. While set, the page shows the
  // still with its findings instead of a feed. Distinct from the frozen
  // still used for marking, which takes precedence while drawing.
  const [photo, setPhoto] = useState(null);
  const [sourceLabel, setSourceLabel] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);

  // Derived, not stored: the URL carries a timestamp to force a fresh MJPEG
  // connection, so recomputing it on every render would restart the stream
  // continuously.
  const serverStreamUrl = useMemo(
    () => (serverWatching ? api.streamUrl() : null),
    [serverWatching],
  );

  // This device's camera. The browser captures and pushes frames, so the model
  // can run on a GPU elsewhere while the camera stays on the operator's desk.
  const webcam = useWebcamAnalysis("restricted-zone", { file: videoUrl });

  const watching = serverWatching || webcam.active;

  // No fallback to the server's figures while the device camera is starting:
  // they describe a different camera. Gated on watching too, so stopping
  // clears the figures rather than leaving the last violation on screen.
  const results = photo
    ? photo.result
    : webcam.active
      ? webcam.result
      : serverWatching
        ? serverResults
        : null;

  // Only a server-captured camera arrives as a stream; this device's camera is
  // shown directly from the browser with the findings drawn on top.
  const streamUrl = webcam.active ? null : serverStreamUrl;

  // The zones marked on this camera, as the backend lists them.
  const [zones, setZones] = useState([]);

  // Marking mode. `points` is only ever the polygon in progress — the saved
  // zones live in `zones` and are drawn with the findings.
  const [drawing, setDrawing] = useState(false);
  const [points, setPoints] = useState([]);
  const [frozenUrl, setFrozenUrl] = useState(null);
  const [saving, setSaving] = useState(false);

  // The picture size the points are in. Sent with each zone so the backend
  // can scale it if the same camera later runs at a different size.
  const [frameSize, setFrameSize] = useState(null);

  // Which zone's name is being edited, and what it says right now.
  const [renaming, setRenaming] = useState(null);
  const [renameText, setRenameText] = useState("");

  // Kept apart from the connection error, which the poll clears on every
  // success. A refused save is the answer to something the operator just did.
  const [saveError, setSaveError] = useState(null);
  //: The camera's curfew as the backend reports it, plus the draft an
  //: operator is editing. Kept apart so a half-typed time never reads as
  //: the saved schedule.
  const [curfew, setCurfew] = useState(null);
  const [curfewActive, setCurfewActive] = useState(false);
  const [curfewClock, setCurfewClock] = useState("system");
  //: What the clock judging the curfew reads right now, and in whose
  //: hours. Shown because the window and the clock deciding it were only
  //: ever displayed apart: a curfew typed at 15:53 IST and judged at 10:25
  //: UTC looked, on screen, simply like a curfew that was not running.
  const [curfewNow, setCurfewNow] = useState(null);
  const [curfewZone, setCurfewZone] = useState(null);
  const [draft, setDraft] = useState({ start: "22:00", end: "06:00", days: [] });
  const [curfewOpen, setCurfewOpen] = useState(false);

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

  // The live curfew fields from a config payload — and deliberately not
  // `draft`. This runs on the poll timer, and re-seeding the draft every
  // three seconds would overwrite an operator halfway through typing one.
  const applyCurfewState = useCallback((config) => {
    setCurfew(config?.curfew ?? null);
    setCurfewActive(Boolean(config?.curfew_active));
    setCurfewClock(config?.curfew_clock || "system");
    setCurfewNow(config?.curfew_now ?? null);
    setCurfewZone(config?.curfew_zone ?? null);
  }, []);

  const refreshZones = useCallback(async () => {
    try {
      const config = await api.getConfig();
      if (!mounted.current) return;
      setZones(Array.isArray(config?.zones) ? config.zones : []);
      applyCurfewState(config);
      if (config?.curfew) {
        setDraft({
          start: config.curfew.start,
          end: config.curfew.end,
          days: config.curfew.days || [],
        });
      }
    } catch {
      // No saved zones is a normal state, not an error.
    }
  }, [applyCurfewState]);

  // Just the live half, for the timer: a curfew starts and ends while the
  // page sits open, and the clock it is judged by has to keep ticking on
  // screen or the reading beside it is a screenshot of an old minute.
  const refreshCurfewState = useCallback(async () => {
    try {
      const config = await api.getConfig();
      if (!mounted.current) return;
      applyCurfewState(config);
    } catch {
      // The poll already has an error banner; a config blip does not need
      // a second one saying the same thing.
    }
  }, [applyCurfewState]);

  const DAY_LABELS = [
    ["mon", "Mon"], ["tue", "Tue"], ["wed", "Wed"], ["thu", "Thu"],
    ["fri", "Fri"], ["sat", "Sat"], ["sun", "Sun"],
  ];

  const toggleDay = useCallback((day) => {
    setDraft((d) => ({
      ...d,
      days: d.days.includes(day)
        ? d.days.filter((x) => x !== day)
        : [...d.days, day],
    }));
  }, []);

  const saveCurfew = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await api.saveConfig({
        curfew: {
          ...draft,
          enabled: true,
          // The hours belong to whoever typed them. Without this the
          // backend judged them on its own clock, and a window set at
          // 15:53 in a control room ran at 15:53 UTC on the server —
          // five and a half hours off, with nothing on screen saying so.
          timezone: DEVICE_ZONE,
          utc_offset_minutes: -new Date().getTimezoneOffset(),
        },
      });
      await refreshZones();
      setCurfewOpen(false);
    } catch (err) {
      // The backend refuses an unusable window rather than storing one —
      // a curfew that silently became midnight is a bay left unwatched —
      // so its sentence is the one to show.
      setSaveError(err?.message || "Could not save the curfew.");
    } finally {
      setSaving(false);
    }
  }, [draft, refreshZones]);

  const clearCurfew = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await api.saveConfig({ curfew: null });
      await refreshZones();
      setCurfew(null);
      setCurfewActive(false);
    } catch (err) {
      setSaveError(err?.message || "Could not clear the curfew.");
    } finally {
      setSaving(false);
    }
  }, [refreshZones]);


  // Load the saved zones once, then poll for state.
  useEffect(() => {
    (async () => {
      await refreshZones();
      await refresh();
    })();

    const timer = setInterval(() => {
      refresh();
      refreshCurfewState();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh, refreshZones, refreshCurfewState]);

  /* ------------------------------------------------------------------ */
  /* Marking zones                                                       */
  /* ------------------------------------------------------------------ */

  const startDrawing = () => {
    // Freeze the picture so the operator marks a still rather than chasing a
    // moving image. With this device's camera the server has no frame to
    // give, so the still is taken here.
    const still = webcam.active ? webcam.snapshot() : cameraApi.freezeFrameUrl();

    if (!still) {
      setError("The camera has not sent a picture yet. Try again in a moment.");
      return;
    }

    setFrozenUrl(still);
    setPoints([]);
    setSaveError(null);
    setDrawing(true);
  };

  // Called when a polygon is closed — double-click, or the Done button with
  // corners on the canvas. The zone is saved on the spot and the canvas
  // cleared for the next one, so marking three zones is one session.
  const saveCurrent = async () => {
    if (points.length < 3) {
      setSaveError("Mark at least 3 corners to make a zone.");
      return false;
    }

    setSaving(true);

    try {
      await api.saveConfig({
        zone: { add: { polygon: points } },
        frame_width: frameSize?.width,
        frame_height: frameSize?.height,
      });
      setPoints([]);
      setSaveError(null);
      await refreshZones();
      await refresh();
      return true;
    } catch (err) {
      setSaveError(
        err?.response?.data?.detail ||
          err?.message ||
          "Could not save the zone.",
      );
      return false;
    } finally {
      setSaving(false);
    }
  };

  const finishDrawing = async () => {
    // Corners on the canvas are a zone the operator meant; none means they
    // are simply done marking.
    if (points.length >= 3) {
      const ok = await saveCurrent();
      if (!ok) return;
    }

    setDrawing(false);
    setFrozenUrl(null);
    setPoints([]);
  };

  const cancelDrawing = () => {
    setDrawing(false);
    setFrozenUrl(null);
    setPoints([]);
    setSaveError(null);
  };

  const removeZone = async (id) => {
    setSaving(true);
    try {
      await api.saveConfig({ zone: { remove: id } });
      await refreshZones();
      await refresh();
    } catch (err) {
      setSaveError(
        err?.response?.data?.detail || err?.message || "Could not remove it.",
      );
    } finally {
      setSaving(false);
    }
  };

  const clearZones = async () => {
    setSaving(true);
    try {
      // The legacy clear: this camera has no zones now.
      await api.saveConfig({ polygon: [] });
      setPoints([]);
      setDrawing(false);
      setFrozenUrl(null);
      await refreshZones();
      await refresh();
    } catch (err) {
      setSaveError(
        err?.response?.data?.detail || err?.message || "Could not clear.",
      );
    } finally {
      setSaving(false);
    }
  };

  const commitRename = async (zone) => {
    const name = renameText.trim();
    setRenaming(null);

    if (name === (zone.name || "")) return;

    try {
      await api.saveConfig({ zone: { rename: { id: zone.id, name } } });
      await refreshZones();
    } catch (err) {
      setSaveError(
        err?.response?.data?.detail || err?.message || "Could not rename it.",
      );
    }
  };

  /* ------------------------------------------------------------------ */

  // Could the AI judge this picture at all? "All zones clear" over a picture
  // nobody could read is the same false all-clear in a different sentence.
  const { unreadable, reason, unverified } = readLegibility(results);

  const alert = Boolean(results?.alert) && !unreadable;

  // How far the clock judging the curfew is from the one the operator is
  // reading. Both are wall-clock faces, so the difference between them is
  // exactly the thing that made a curfew look broken: right window, right
  // day, wrong hour, and no way to see it.
  const clockGap = useMemo(() => {
    if (!curfewNow) return null;
    const judged = new Date(String(curfewNow).replace(" ", "T"));
    if (Number.isNaN(judged.getTime())) return null;
    const device = new Date();
    return {
      minutes: Math.round((judged.getTime() - device.getTime()) / 60000),
      device,
    };
  }, [curfewNow]);

  // Live per-zone occupancy, by id, from the results. The list panel joins
  // this to the configured zones so each row can say who is in it now.
  const liveZones = useMemo(() => {
    const map = new Map();
    for (const zone of results?.zones ?? []) {
      if (zone?.id != null) map.set(zone.id, zone);
    }
    return map;
  }, [results]);

  // Sounds where the operator is. The sentence comes from the result's
  // `spoken` field — "Alert! Person is in restricted zone {name}" — so the
  // words spoken and the zone entered cannot drift apart.
  const sound = useAlertSound(alert, results?.summary, {
    spoken: results?.spoken ?? undefined,
    unverified: {
      active: watching && unreadable && !drawing,
      spoken: unverifiedSpeech("the Restricted Zone", reason),
      resumed:
        watching && !unreadable ? resumedSpeech("The restricted zone") : null,
    },
  });

  // The header's stop-everything control.
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

  const hasZones = zones.length > 0;
  const occupied = Number(results?.zones_occupied ?? 0);

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
      <Button variant="secondary" onClick={cancelDrawing} disabled={saving}>
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
        {hasZones ? "Mark another zone" : "Mark zones"}
      </Button>
      {hasZones && (
        <Button
          variant="ghost"
          icon={Trash2}
          onClick={clearZones}
          loading={saving}
          aria-label="Remove every zone"
        />
      )}
    </>
  );

  return (
    <ModuleLayout
      title="Restricted Zone"
      description="The AI watches every marked zone and alerts the moment someone steps into one, naming the zone they entered."
      icon={ScanLine}
      watching={watching}
      alert={alert}
      unverified={unreadable && !drawing}
      actions={
        <>
          {zoneActions}
          <StopMonitoringButton watching={watching} onStop={stopMonitoring} />
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
          /* Not while drawing: the operator is marking corners on a still, and
             boxes from a moment ago would sit over a picture they no longer
             describe. */
          findings={
            drawing ? null : photo ? photo.result : webcam.active ? results : null
          }
          frozenUrl={drawing ? frozenUrl : photo?.url ?? null}
          connected={watching}
          watching={watching}
          alert={alert}
          unverified={unreadable && !drawing}
          unverifiedReason={reason}
          statusLabel={
            drawing
              ? "Marking zones — double-click to finish each one"
              : alert
                ? results?.summary || "Person in restricted zone"
                : photo
                  ? "Checked photo"
                  : undefined
          }
          /* Only while drawing. Once saved, the zones come back with the
             findings and are drawn with them. */
          overlay={
            drawing
              ? (size) => (
                  <ZoneCanvas
                    active
                    points={points}
                    setPoints={setPoints}
                    closed={false}
                    onClose={saveCurrent}
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
              // Zones belong to the camera they were drawn on. Switching
              // hides that set and shows the new camera's own — re-read
              // rather than cleared, the way Doors and Workstations behave.
              setPoints([]);
              setDrawing(false);
              setFrozenUrl(null);
              setFrameSize(null);
              refreshZones();
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

          <Panel title="Curfew" icon={Clock}>
            <div className="space-y-3 text-xs">
              {/* The live answer first. During a curfew the whole view is
                  the restricted area, and that is a big enough change to
                  what the camera is doing that it should be the first
                  thing read, not a setting to be inferred. */}
              {curfewActive ? (
                <div className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2">
                  <p className="font-medium text-danger">
                    Curfew running — the whole view is restricted
                  </p>
                  <p className="mt-0.5 text-text-secondary">
                    {watching && unreadable
                      ? "But this picture cannot be judged, so nobody in it would be spotted. Nothing here is an all-clear."
                      : "Anybody in this picture raises an alert, wherever they stand. Marked zones are not consulted while it runs."}
                  </p>
                </div>
              ) : curfew ? (
                <p className="text-text-secondary">
                  Set for <span className="font-medium text-text">
                    {curfew.start}–{curfew.end}
                  </span>{" "}
                  on {curfew.days.map((d) => d[0].toUpperCase() + d.slice(1)).join(", ")}
                  {curfew.crosses_midnight ? " (runs past midnight)" : ""}. Not
                  running at the moment, so the marked zones are watching.
                </p>
              ) : (
                <p className="text-text-secondary">
                  No curfew. Set hours when nobody should be here at all and
                  the whole camera view becomes restricted for that window —
                  there is no area to draw.
                </p>
              )}

              {/* Which clock decided. Not decoration: reviewing a recording,
                  the footage's clock and the wall clock disagree by months,
                  and an operator arguing with an alarm needs to know which
                  one raised it. */}
              {curfew && (
                <div className="space-y-2 text-text-secondary">
                  <p>
                    Judged by the{" "}
                    <span className="font-medium text-text">
                      {curfewClock === "cctv" ? "recording's own clock" : "system clock"}
                    </span>
                    {curfewClock === "cctv"
                      ? " — so footage reviewed later is judged by when it was shot."
                      : curfewZone
                        ? `, read in ${curfewZone} — the timezone this curfew was set in.`
                        : " — this source has no readable burned-in clock, and this window was saved without a timezone."}
                  </p>

                  {/* What that clock reads right now. The window and the
                      clock deciding it were only ever shown apart, so a
                      five-and-a-half-hour gap between them was invisible
                      on the one screen that could have named it. */}
                  {curfewNow && (
                    <p>
                      It reads{" "}
                      <span className="font-medium text-text">
                        {readClock(curfewNow)}
                      </span>
                      .
                    </p>
                  )}

                  {curfewClock === "system" &&
                    clockGap &&
                    Math.abs(clockGap.minutes) > 2 && (
                      <p className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2">
                        That is{" "}
                        <span className="font-medium text-text">
                          {driftWords(clockGap.minutes)}
                        </span>{" "}
                        this device, which reads {readClock(clockGap.device)}.
                        The curfew runs on the clock above — save it again
                        from this device to move it onto this one.
                      </p>
                    )}
                </div>
              )}

              {curfewOpen ? (
                <div className="space-y-3 rounded-md border border-border p-3">
                  <div className="flex items-center gap-2">
                    <label className="text-text-secondary">From</label>
                    <input
                      type="time"
                      value={draft.start}
                      onChange={(e) => setDraft((d) => ({ ...d, start: e.target.value }))}
                      className="rounded border border-border bg-surface px-2 py-1"
                    />
                    <label className="text-text-secondary">to</label>
                    <input
                      type="time"
                      value={draft.end}
                      onChange={(e) => setDraft((d) => ({ ...d, end: e.target.value }))}
                      className="rounded border border-border bg-surface px-2 py-1"
                    />
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {DAY_LABELS.map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => toggleDay(key)}
                        aria-pressed={draft.days.includes(key)}
                        className={`rounded px-2 py-1 text-xs border ${
                          draft.days.includes(key)
                            ? "border-primary bg-primary/10 text-primary font-medium"
                            : "border-border text-text-secondary"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Said before saving rather than discovered afterwards:
                      an overnight window is the normal case here, and the
                      day it needs ticked is the day it starts. */}
                  {DEVICE_ZONE && (
                    <p className="text-text-secondary">
                      Read in{" "}
                      <span className="font-medium text-text">{DEVICE_ZONE}</span>
                      {" "}— this device's timezone, saved with the window so
                      the hours mean the same wherever the server runs.
                    </p>
                  )}

                  {draft.end <= draft.start && (
                    <p className="text-text-secondary">
                      Runs past midnight. Tick the day it{" "}
                      <span className="font-medium text-text">starts</span> — a
                      Friday night curfew needs Friday, not Saturday.
                    </p>
                  )}

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={saveCurfew}
                      disabled={saving || !draft.days.length}
                    >
                      Save curfew
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setCurfewOpen(false)}>
                      Cancel
                    </Button>
                  </div>
                  {!draft.days.length && (
                    <p className="text-text-secondary">Pick at least one day.</p>
                  )}
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setCurfewOpen(true)}>
                    {curfew ? "Change curfew" : "Set a curfew"}
                  </Button>
                  {curfew && (
                    <Button size="sm" variant="ghost" onClick={clearCurfew} disabled={saving}>
                      Clear
                    </Button>
                  )}
                </div>
              )}
            </div>
          </Panel>

          <Panel title="Marked zones" icon={Pentagon}>
            {hasZones && unreadable ? (
              /* The zones are still marked, but "anyone stepping inside
                 raises an alert" stops being true the moment the picture
                 cannot be read. */
              <UnverifiedNotice
                reason={reason}
                description={
                  unverified > 0
                    ? `The zones are still marked, but nobody stepping into one would be spotted. ${peopleCount(unverified)} in view could not be judged.`
                    : "The zones are still marked, but nobody stepping into one would be spotted."
                }
              />
            ) : hasZones ? (
              <div className="space-y-1">
                <ul className="divide-y divide-border -my-1">
                  {zones.map((zone) => {
                    const live = liveZones.get(zone.id);
                    const inside = Number(live?.people_inside ?? 0);
                    const editing = renaming === zone.id;

                    return (
                      <li
                        key={zone.id}
                        className="flex items-center justify-between gap-3 py-2.5"
                      >
                        <div className="min-w-0">
                          {editing ? (
                            <input
                              autoFocus
                              value={renameText}
                              onChange={(e) => setRenameText(e.target.value)}
                              onBlur={() => commitRename(zone)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") commitRename(zone);
                                if (e.key === "Escape") setRenaming(null);
                              }}
                              maxLength={60}
                              placeholder={`Zone ${zone.id}`}
                              className="w-full text-sm font-medium text-text bg-subtle
                                         border border-border rounded-md px-2 py-1
                                         focus:outline-none focus:ring-2 focus:ring-accent/40"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setRenaming(zone.id);
                                setRenameText(zone.name || "");
                              }}
                              title="Rename this zone"
                              className="text-sm font-medium text-text truncate
                                         hover:underline decoration-dotted underline-offset-4"
                            >
                              {fallbackName(zone)}
                            </button>
                          )}
                          <p className="text-xs text-text-secondary">
                            {zone.points.length} corners
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {watching && inside > 0 && !unreadable ? (
                            <Badge variant="danger">
                              {inside} inside
                              {live?.occupied_seconds != null
                                ? ` · ${Math.round(live.occupied_seconds)}s`
                                : ""}
                            </Badge>
                          ) : watching && live && !unreadable ? (
                            <Badge variant="success" dot={false}>
                              clear
                            </Badge>
                          ) : null}
                          <Button
                            variant="ghost"
                            icon={Trash2}
                            onClick={() => removeZone(zone.id)}
                            disabled={saving}
                            aria-label={`Remove ${fallbackName(zone)}`}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <p className="text-xs text-text-muted pt-2 border-t border-border">
                  Click a name to change it — the alert says it aloud:
                  “Person is in restricted zone {zones[0]?.name || "…"}”.
                </p>
              </div>
            ) : (
              <EmptyState
                icon={Pentagon}
                title="No zones marked yet"
                description={
                  curfewActive
                    ? "None are needed while the curfew runs — the whole view is the area."
                    : curfew
                      ? "None are needed during the curfew — the whole view is the area then. Mark zones for the hours outside it."
                      : watching
                        ? "Use Mark zones above, then click the corners of each zone. Double-click to finish one and keep going; Done when the floor is covered."
                        : "Start watching a camera first, then mark each zone to protect."
                }
              />
            )}
          </Panel>
        </>
      }
    >
      <StatusCard
        status={
          alert
            ? "alert"
            : unreadable
              ? "unverified"
              : /* Hours that are running with nothing watching them is not
                   an idle camera and not an all-clear — it is the one
                   state on this page that wants somebody to do something. */
                curfewActive && !watching
                ? "warning"
                : (hasZones || curfewActive) && watching
                  ? "ok"
                  : "idle"
        }
        title={
          alert
            ? results?.summary || "Someone is in a restricted zone"
            : unreadable
              ? reason
              : /* A curfew is the whole setup for a camera with nothing
                   drawn on it, so it leads — the headline used to read
                   "Not watching any zone" over a wholly restricted view.
                   Whether it is running and whether anybody is watching it
                   are two facts, and folding them into one had this card
                   calling a curfew "not running" beside a panel saying it
                   was. */
                curfewActive
                ? watching
                  ? "Curfew running — the whole view is restricted"
                  : "Curfew running — but no camera is watching it"
                : hasZones && watching
                  ? zones.length > 1
                    ? "All zones clear"
                    : "Area is clear"
                  : curfew
                    ? "Curfew set, not running at the moment"
                    : "Not watching any zone"
        }
        description={
          alert
            ? "Check the live view and respond according to your site's safety procedure."
            : unreadable
              ? unverifiedDescription(
                  curfewActive
                    ? "The curfew is running, but nobody in this picture would be spotted."
                    : hasZones
                      ? "The marked zones are not being watched — somebody could be standing in one."
                      : "Nothing is being watched.",
                )
              : curfewActive
                ? watching
                  ? `Nobody should be here between ${curfew.start} and ${curfew.end}. Anybody in view raises an alert, wherever they stand — there is no zone to draw.`
                  : `Nobody should be here between ${curfew.start} and ${curfew.end}, and these are those hours — but no camera is connected, so nothing is being watched.`
                : hasZones && watching
                  ? `${zones.length === 1 ? "The marked zone is" : `All ${zones.length} zones are`} being watched. You'll be alerted the moment someone enters, and the alert names the zone.`
                  : curfew
                    ? `Nobody may be here between ${curfew.start} and ${curfew.end}. Outside those hours the marked zones watch as usual.`
                    : "Connect a camera and mark each zone to begin watching."
        }
        meta={
          status?.camera?.source
            ? `Camera: ${status.camera.source}` +
              (hasZones && occupied > 0 ? ` · ${occupied} zone(s) occupied` : "")
            : undefined
        }
        pulse
      />

      {(saveError || error || webcam.error) && (
        <Panel>
          <ErrorState
            detail={saveError || webcam.error || error}
            onRetry={saveError ? saveCurrent : refresh}
          />
        </Panel>
      )}
    </ModuleLayout>
  );
}
