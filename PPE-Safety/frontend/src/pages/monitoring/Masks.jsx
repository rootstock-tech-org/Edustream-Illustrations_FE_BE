import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ShieldCheck, TriangleAlert, UserX, Users, VenetianMask } from "lucide-react";

import Panel from "../../components/common/Panel";
import StatisticsCard from "../../components/common/StatisticsCard";
import StatusCard from "../../components/common/StatusCard";
import { EmptyState, ErrorState } from "../../components/common/States";
import CameraInputCard from "../../components/monitoring/CameraInputCard";
import LiveFeed from "../../components/monitoring/LiveFeed";
import ModuleLayout from "../../components/monitoring/ModuleLayout";
import RecentEvents from "../../components/monitoring/RecentEvents";
import UnverifiedNotice from "../../components/monitoring/UnverifiedNotice";
import { cameraApi, createModuleApi } from "../../services/moduleApi";
import { useWebcamAnalysis } from "../../hooks/useWebcamAnalysis";
import { useAlertSound } from "../../hooks/useAlertSound";
import AlertSoundToggle from "../../components/monitoring/AlertSoundToggle";
import StopMonitoringButton from "../../components/monitoring/StopMonitoringButton";
import {
  measuredCount,
  partlyUnverifiedTitle,
  peopleCount,
  readLegibility,
  resumedSpeech,
  successTone,
  unverifiedDescription,
  unverifiedSpeech,
} from "../../components/monitoring/legibility";

/**
 * Face mask monitoring.
 *
 * The safety-gear page with one item instead of two: same frame, same
 * inputs, same separation of "checked" from "in view". People too far away
 * or half out of frame cannot have their face judged, and counting them as
 * breaches would raise an alarm for everyone in the background.
 */

const api = createModuleApi("mask");
const POLL_MS = 2000;

export default function Masks() {
  const [status, setStatus] = useState(null);
  const [serverResults, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [serverWatching, setWatching] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [sourceLabel, setSourceLabel] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);

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

  useEffect(() => {
    (async () => {
      await refresh();
    })();

    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const serverStreamUrl = useMemo(
    () => (serverWatching ? api.streamUrl() : null),
    [serverWatching],
  );

  // This device's camera. The browser captures and pushes frames, so the
  // model can run on a GPU elsewhere while the camera stays on the desk.
  const webcam = useWebcamAnalysis("mask", { file: videoUrl });

  const watching = serverWatching || webcam.active;

  // A checked photo: {url, result, name}. While set, the page shows the
  // still with its findings instead of a feed.
  const results = photo
    ? photo.result
    : webcam.active
      ? webcam.result
      : serverWatching
        ? serverResults
        : null;

  const showing = serverWatching || webcam.active || Boolean(photo);

  // Only a server-captured camera arrives as a stream; this device's camera
  // is shown directly from the browser with the findings drawn on top.
  const streamUrl = webcam.active ? null : serverStreamUrl;

  // Could the AI judge this picture at all? Masks lose everybody below about
  // 8% brightness and report "Nobody in view"; this is what stops that
  // reading as an empty, safe room.
  const { unreadable, reason, unverified } = readLegibility(results);

  // An unjudgeable picture cannot raise a violation — and must not silently
  // clear one either, which is why the state below is `unverified` rather
  // than a return to idle.
  const alert = Boolean(results?.alert) && !unreadable;

  const partly = !unreadable && unverified > 0;

  // Sounds where the operator is. The backend's alarm beeps on the
  // machine running the service, which nobody is sitting next to.
  const sound = useAlertSound(alert, results?.summary, {
    unverified: {
      active: showing && unreadable,
      spoken: unverifiedSpeech("Face Masks", reason),
      resumed: showing && !unreadable ? resumedSpeech("Face Masks") : null,
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

  const available = status?.ready !== false;

  const inView = results?.people_total ?? 0;
  const checked = results?.people_checked ?? 0;
  const notChecked = results?.people_not_checked ?? 0;
  const rate = results?.compliance_rate;

  return (
    <ModuleLayout
      title="Face Masks"
      description="The AI checks that everyone in view is wearing a face mask."
      icon={VenetianMask}
      watching={watching}
      alert={alert}
      /* The header badge is about the picture, not about the people in it:
         a frame that could be read is being watched, and saying otherwise
         would contradict the badge on the feed itself. Anyone in it who
         could not be judged is carried by the status card below, which is
         the louder of the two. */
      unverified={unreadable}
      actions={
        <>
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
          findings={photo ? photo.result : webcam.active ? results : null}
          frozenUrl={photo?.url}
          connected={watching}
          watching={watching}
          alert={alert}
          unverified={unreadable}
          unverifiedReason={reason}
          statusLabel={
            alert ? "Mask missing" : photo ? "Checked photo" : undefined
          }
          stats={
            watching && inView > 0
              ? [{ label: "People", value: inView }]
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

          <Panel title="Right now" icon={ShieldCheck}>
            {!showing ? (
              <EmptyState
                icon={VenetianMask}
                title="Not watching"
                description="Connect a camera above to start checking masks."
              />
            ) : unreadable ? (
              /* Before the "Nobody in view" branch: at 8% brightness this
                 module loses everybody, and an empty room was what the
                 operator was shown. */
              <UnverifiedNotice
                reason={reason}
                description="Nobody is being checked for a mask until the picture improves."
              />
            ) : inView === 0 ? (
              <EmptyState
                icon={Users}
                title="Nobody in view"
                description="Checks will appear as soon as someone is visible."
              />
            ) : (
              <dl className="space-y-3 text-sm">
                <Row
                  label="Wearing a mask"
                  value={`${results.wearing_mask} of ${checked}`}
                  bad={results.missing_mask > 0}
                />
                {/* Never added to either side: somebody whose face could not
                    be judged is not wearing a mask and is not missing one. */}
                {unverified > 0 && (
                  <Row
                    label="Seen but not judged"
                    value={`${unverified}`}
                    unverified
                    hint="The picture is not clear enough to say either way"
                  />
                )}
                {notChecked > 0 && (
                  <Row
                    label="Could not be checked"
                    value={`${notChecked}`}
                    muted
                    hint="Too far away to check clearly"
                  />
                )}
              </dl>
            )}
          </Panel>

          <Panel title="Past checks" icon={TriangleAlert}>
            {/* Refreshed when the alert state changes, so something spotted
                while the operator is watching appears without a reload. */}
            <RecentEvents moduleId="mask" refreshToken={alert ? 1 : 0} />
          </Panel>
        </>
      }
    >
      <StatusCard
        status={
          !available
            ? "idle"
            : alert
              ? "alert"
              : unreadable || partly
                ? "unverified"
                : showing && checked > 0
                  ? "ok"
                  : "idle"
        }
        title={
          !available
            ? "Mask checking is not available"
            : alert
              ? results.summary
              : unreadable
                ? reason
                : partly
                  ? partlyUnverifiedTitle(unverified)
                  : showing && checked > 0
                    ? "Everyone checked is wearing a mask"
                    : "Not checking anyone yet"
        }
        description={
          !available
            ? "The mask AI is not installed on this system."
            : alert
              ? unverified > 0
                ? `Check the live view and follow your site's safety procedure. ${peopleCount(unverified)} in the same picture could not be judged either way.`
                : "Check the live view and follow your site's safety procedure."
              : unreadable
                ? unverifiedDescription("Face masks are not being checked.")
                : partly
                  ? `Everyone the AI could check is wearing a mask. ${peopleCount(unverified)} could not be judged, so this is not an all-clear.`
                  : showing
                    ? "The AI is checking masks on everyone close enough to see clearly."
                    : "Connect a camera to begin."
        }
        pulse
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* A dash rather than a zero when the picture could not be read —
            the same convention the dashboard uses for an uncounted headcount. */}
        <StatisticsCard
          label="People in view"
          value={measuredCount(inView, unreadable)}
          icon={Users}
          tone="neutral"
          hint={
            unreadable
              ? unverified > 0
                ? `${unverified} seen, none judged`
                : "Nobody could be counted"
              : unverified > 0
                ? `${unverified} not judged`
                : undefined
          }
        />
        <StatisticsCard
          label="Not wearing a mask"
          value={measuredCount(results?.missing_mask ?? 0, unreadable)}
          unit={!unreadable && checked > 0 ? `of ${checked}` : undefined}
          icon={UserX}
          tone={
            unreadable
              ? "neutral"
              : results?.missing_mask > 0
                ? "danger"
                : successTone(true, { unreadable, unverified })
          }
          hint={
            unreadable
              ? "Nobody was checked"
              : unverified > 0
                ? `${unverified} not judged`
                : notChecked > 0
                  ? `${notChecked} not checked`
                  : checked > 0
                    ? "Everyone checked"
                    : "Nobody close enough to check"
          }
        />
        <StatisticsCard
          label="Wearing a mask"
          value={measuredCount(results?.wearing_mask ?? 0, unreadable)}
          unit={!unreadable && checked > 0 ? `of ${checked}` : undefined}
          icon={ShieldCheck}
          tone={successTone(checked > 0 && results?.missing_mask === 0, {
            unreadable,
            unverified,
          })}
          hint={unreadable ? "Nothing could be confirmed" : undefined}
        />
        <StatisticsCard
          label="Compliance"
          value={rate === null || rate === undefined ? "—" : rate}
          unit={rate === null || rate === undefined ? undefined : "%"}
          icon={VenetianMask}
          tone={
            rate === null || rate === undefined
              ? "neutral"
              : rate === 100
                ? successTone(true, { unreadable, unverified })
                : rate >= 80
                  ? "warning"
                  : "danger"
          }
          hint={
            unreadable
              ? "Nothing could be checked"
              : rate === null || rate === undefined
                ? "Nobody close enough to check"
                : unverified > 0
                  ? `Of the people checked · ${unverified} not judged`
                  : "Of the people checked"
          }
        />
      </div>

      {(error || webcam.error) && (
        <Panel>
          <ErrorState detail={webcam.error || error} onRetry={refresh} />
        </Panel>
      )}
    </ModuleLayout>
  );
}

function Row({ label, value, bad = false, muted = false, unverified = false, hint }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <dt className="text-text-secondary">{label}</dt>
        {hint && <p className="text-xs text-text-muted mt-0.5">{hint}</p>}
      </div>
      <dd
        className={`font-semibold tabular-nums ${
          unverified
            ? "text-warning"
            : muted
              ? "text-text-muted"
              : bad
                ? "text-danger"
                : "text-success"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
