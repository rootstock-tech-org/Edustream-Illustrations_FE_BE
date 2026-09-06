import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HardHat, ShieldCheck, TriangleAlert, UserX, Users } from "lucide-react";

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
 * Safety gear monitoring — helmet and vest.
 *
 * Built to the same shape as Restricted Zone: ModuleLayout for the frame,
 * LiveFeed for the picture, CameraInputCard for the input. Only the results
 * panel differs.
 *
 * The figures deliberately separate "checked" from "in view". People too far
 * away or half out of frame cannot have their gear judged, and counting them
 * as breaches would raise an alarm for everyone in the background.
 */

const api = createModuleApi("ppe");
const POLL_MS = 2000;

export default function PPE() {
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

  // This device's camera. The browser captures and pushes frames, so the model
  // can run on a GPU elsewhere while the camera stays on the operator's desk.
  // While it is running it supersedes the server-captured stream, and the
  // names below shadow the server state so the rest of the page is unchanged.
  // A recording is analysed in the browser too, not streamed back
  // annotated: the picture is already here once it has been fetched,
  // and sending it back across the network is what made it late.
  const webcam = useWebcamAnalysis("ppe", { file: videoUrl });

  const watching = serverWatching || webcam.active;

  // No fallback to the server's figures while the device camera is starting:
  // they describe a different camera, and showing them beside this one's
  // picture is worse than showing nothing. Null until the first frame lands.
  //
  // Gated on watching too, so stopping clears the figures rather than leaving
  // the last violation on screen looking current.
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

  // Only a server-captured camera arrives as a stream; this device's camera is
  // shown directly from the browser, which is smoother and saves a round trip
  // per frame. The findings are drawn on top in that case — the server stream
  // already has them painted in, so drawing them there would double every box.
  const streamUrl = webcam.active ? null : serverStreamUrl;

  // Could the AI judge this picture at all? Three keys off the result, read
  // in one place so every page says the same thing the same way. An older
  // backend sends none of them and nothing below changes.
  const { unreadable, reason, unverified } = readLegibility(results);

  // A picture nobody could read cannot raise a violation. The backend is
  // required to clear the flag itself; this is the belt to that braces,
  // because a red alarm sitting beside "cannot check" would leave the
  // operator to decide which of the two the screen means.
  const alert = Boolean(results?.alert) && !unreadable;

  // The picture was fine but some of the people in it were not judged. Not a
  // violation, not an all-clear.
  const partly = !unreadable && unverified > 0;

  // Sounds where the operator is. The backend's alarm beeps on the
  // machine running the service, which nobody is sitting next to.
  const sound = useAlertSound(alert, results?.summary, {
    unverified: {
      active: showing && unreadable,
      spoken: unverifiedSpeech("Safety Gear", reason),
      // Only while there is still something to watch, so switching the
      // camera off is not announced as the camera recovering.
      resumed: showing && !unreadable ? resumedSpeech("Safety Gear") : null,
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
      title="Safety Gear"
      description="The AI checks that everyone in view is wearing a helmet and a safety vest."
      icon={HardHat}
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
            alert ? "Safety gear missing" : photo ? "Checked photo" : undefined
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
                icon={HardHat}
                title="Not watching"
                description="Connect a camera above to start checking safety gear."
              />
            ) : unreadable ? (
              /* Ahead of the "Nobody in view" branch on purpose. A picture
                 too dark to read has nobody in it as far as the detector is
                 concerned, and reporting that as an empty room is the exact
                 defect this phase exists to remove. */
              <UnverifiedNotice
                reason={reason}
                description="Nobody is being checked for a helmet or a vest until the picture improves."
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
                  label="Wearing a helmet"
                  value={`${results.wearing_helmet} of ${checked}`}
                  bad={results.missing_helmet > 0}
                />
                <Row
                  label="Wearing a vest"
                  value={`${results.wearing_vest} of ${checked}`}
                  bad={results.missing_vest > 0}
                />
                {/* Its own line, never added to either side. Somebody the AI
                    could not judge is neither wearing their gear nor missing
                    it, and folding them into a total is how a scene nobody
                    could see came to read as a compliant one. */}
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
                    hint={
                      results?.people_too_dark > 0
                        ? "Too far away, or too dark for the AI to see the gear"
                        : "Too far away to check clearly"
                    }
                  />
                )}
              </dl>
            )}
          </Panel>

          <Panel title="Past checks" icon={TriangleAlert}>
            {/* Refreshed when the alert state changes, so something spotted
                while the operator is watching appears without a reload. */}
            <RecentEvents moduleId="ppe" refreshToken={alert ? 1 : 0} />
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
            ? "Safety gear checking is not available"
            : alert
              ? results.summary
              : unreadable
                ? reason
                : partly
                  ? partlyUnverifiedTitle(unverified)
                  : showing && checked > 0
                    ? "Everyone checked is wearing the right gear"
                    : "Not checking anyone yet"
        }
        description={
          !available
            ? "The safety-gear AI is not installed on this system."
            : alert
              ? unverified > 0
                ? `Check the live view and follow your site's safety procedure. ${peopleCount(unverified)} in the same picture could not be judged either way.`
                : "Check the live view and follow your site's safety procedure."
              : unreadable
                ? unverifiedDescription("Helmets and vests are not being checked.")
                : partly
                  ? `Everyone the AI could check is wearing the right gear. ${peopleCount(unverified)} could not be judged, so this is not an all-clear.`
                  : watching
                    ? "The AI is checking helmets and vests on everyone close enough to see clearly."
                    : "Connect a camera to begin."
        }
        pulse
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* A zero from a picture nobody could read is not a measurement, so
            it shows as a dash — the convention the dashboard's "People in
            view" card already uses when nothing is counting. */}
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
                : notChecked > 0
                  ? `${checked} close enough to check`
                  : undefined
          }
        />
        {/* Against everyone in frame, not just those close enough to judge —
            so the hint says how many of them could not be checked. Without
            that the figure reads as "the rest are fine", when some of the
            rest were never looked at.

            Placed next to the total it is measured against, so the two
            numbers are read together rather than across the row. */}
        <StatisticsCard
          label="Not wearing gear"
          value={measuredCount(results?.violations ?? 0, unreadable)}
          unit={!unreadable && inView > 0 ? `of ${inView}` : undefined}
          icon={UserX}
          tone={
            // Green only when someone was actually checked and came back
            // clear. With nobody checkable the honest colour is no colour —
            // zero breaches found is not the same as zero breaches. An
            // unreadable picture and anyone left unjudged both count as
            // "not checkable" here.
            !watching || unreadable || inView === 0 || checked === 0
              ? "neutral"
              : results?.violations > 0
                ? "danger"
                : successTone(true, { unreadable, unverified })
          }
          hint={
            unreadable
              ? "Nobody was checked"
              : inView === 0
                ? "Nobody in view"
                : checked === 0
                  ? "Nobody close enough to check"
                  : [
                      results?.violations > 0
                        ? `${results.missing_helmet} helmet, ${results.missing_vest} vest`
                        : "Everyone checked has their gear",
                      unverified > 0 ? `${unverified} not judged` : null,
                      notChecked > 0 ? `${notChecked} not checked` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")
          }
        />
        <StatisticsCard
          label="Wearing gear correctly"
          value={
            unreadable ? "—" : checked > 0 ? checked - results.violations : 0
          }
          unit={!unreadable && checked > 0 ? `of ${checked}` : undefined}
          icon={ShieldCheck}
          tone={successTone(checked > 0 && results?.violations === 0, {
            unreadable,
            unverified,
          })}
          hint={unreadable ? "Nothing could be confirmed" : undefined}
        />
        <StatisticsCard
          label="Compliance"
          value={rate === null || rate === undefined ? "—" : rate}
          unit={rate === null || rate === undefined ? undefined : "%"}
          icon={HardHat}
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
      <dt className="text-text-secondary">
        {label}
        {hint && (
          <span className="block text-xs text-text-muted mt-0.5">{hint}</span>
        )}
      </dt>
      <dd
        className={`font-semibold tabular-nums shrink-0 ${
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
