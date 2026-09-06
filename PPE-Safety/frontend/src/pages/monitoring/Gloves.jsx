import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Hand, ShieldCheck, TriangleAlert, Users } from "lucide-react";

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
 * Gloves monitoring.
 *
 * Simpler than safety gear: the model recognises a bare hand directly, so a
 * violation is something seen rather than something inferred. The figures
 * therefore count hands, and a person is flagged once regardless of how many
 * of their hands are visible.
 */

const api = createModuleApi("gloves");
const POLL_MS = 2000;

export default function Gloves() {
  const [status, setStatus] = useState(null);
  const [serverResults, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [serverWatching, setWatching] = useState(false);
  const [sourceLabel, setSourceLabel] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);

  // A checked photo: {url, result, name}. While set, the page shows the
  // still with its findings instead of a feed.
  const [photo, setPhoto] = useState(null);

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
  const webcam = useWebcamAnalysis("gloves", { file: videoUrl });

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

  // Watching a feed or holding a checked photo — either way there is
  // something on screen whose findings are worth showing.
  const showing = serverWatching || webcam.active || Boolean(photo);

  // Only a server-captured camera arrives as a stream; this device's camera is
  // shown directly from the browser, which is smoother and saves a round trip
  // per frame. The findings are drawn on top in that case — the server stream
  // already has them painted in, so drawing them there would double every box.
  const streamUrl = webcam.active ? null : serverStreamUrl;

  // Could the AI judge this picture at all? Gloves had no darkness check of
  // its own at all — bare hands simply disappeared between 50% and 35%
  // brightness — so this is the first thing on this page that ever noticed.
  const { unreadable, reason, unverified } = readLegibility(results);

  const alert = Boolean(results?.alert) && !unreadable;

  const partly = !unreadable && unverified > 0;

  // Sounds where the operator is. The backend's alarm beeps on the
  // machine running the service, which nobody is sitting next to.
  const sound = useAlertSound(alert, results?.summary, {
    unverified: {
      active: showing && unreadable,
      spoken: unverifiedSpeech("Gloves", reason),
      resumed: showing && !unreadable ? resumedSpeech("Gloves") : null,
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
  const hands = results?.hands_total ?? 0;
  const rate = results?.compliance_rate;

  return (
    <ModuleLayout
      title="Gloves"
      description="The AI checks that gloves are being worn where they are required."
      icon={Hand}
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
            alert ? "Gloves missing" : photo ? "Checked photo" : undefined
          }
          stats={
            watching && hands > 0
              ? [{ label: "Hands", value: hands }]
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
                icon={Hand}
                title="Not watching"
                description="Connect a camera above to start checking gloves."
              />
            ) : unreadable ? (
              /* Ahead of "No hands in view": bare hands vanish from this
                 model long before the picture looks unusable, and an empty
                 pair of hands is what an operator was shown instead. */
              <UnverifiedNotice
                reason={reason}
                description="No hand is being checked for a glove until the picture improves."
              />
            ) : hands === 0 ? (
              <EmptyState
                icon={Users}
                title="No hands in view"
                description="Checks will appear as soon as hands are visible."
              />
            ) : (
              <dl className="space-y-3 text-sm">
                <Row
                  label="Hands with gloves"
                  value={`${results.hands_gloved} of ${hands}`}
                  good
                />
                <Row
                  label="Bare hands"
                  value={`${results.hands_bare}`}
                  bad={results.hands_bare > 0}
                />
                {/* Kept out of both hand counts on purpose. */}
                {unverified > 0 && (
                  <Row
                    label="Seen but not judged"
                    value={`${unverified}`}
                    unverified
                    hint="The picture is not clear enough to say either way"
                  />
                )}
                <Row
                  label="People in view"
                  value={`${results.people_total}`}
                  muted
                />
              </dl>
            )}
          </Panel>

          <Panel title="Past checks" icon={TriangleAlert}>
            {/* Refreshed when the alert state changes, so something spotted
                while the operator is watching appears without a reload. */}
            <RecentEvents moduleId="gloves" refreshToken={alert ? 1 : 0} />
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
                : showing && hands > 0
                  ? "ok"
                  : "idle"
        }
        title={
          !available
            ? "Glove checking is not available"
            : alert
              ? results.summary
              : unreadable
                ? reason
                : partly
                  ? partlyUnverifiedTitle(unverified)
                  : showing && hands > 0
                    ? "Gloves are being worn"
                    : "Not checking anyone yet"
        }
        description={
          !available
            ? "The gloves AI is not installed on this system."
            : alert
              ? unverified > 0
                ? `Check the live view and follow your site's safety procedure. ${peopleCount(unverified)} in the same picture could not be judged either way.`
                : "Check the live view and follow your site's safety procedure."
              : unreadable
                ? unverifiedDescription("Gloves are not being checked.")
                : partly
                  ? `Every hand the AI could check has a glove on it. ${peopleCount(unverified)} could not be judged, so this is not an all-clear.`
                  : watching
                    ? "The AI checks each hand for gloves as it comes into view."
                    : "Connect a camera to begin."
        }
        pulse
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatisticsCard
          label="People in view"
          value={measuredCount(results?.people_total ?? 0, unreadable)}
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
          label="Hands with gloves"
          value={measuredCount(results?.hands_gloved ?? 0, unreadable)}
          unit={!unreadable && hands > 0 ? `of ${hands}` : undefined}
          icon={ShieldCheck}
          tone={successTone(hands > 0 && results?.hands_bare === 0, {
            unreadable,
            unverified,
          })}
          hint={unreadable ? "Nothing could be confirmed" : undefined}
        />
        <StatisticsCard
          label="Bare hands"
          value={measuredCount(results?.hands_bare ?? 0, unreadable)}
          icon={TriangleAlert}
          tone={
            unreadable
              ? "neutral"
              : results?.hands_bare > 0
                ? "danger"
                : successTone(true, { unreadable, unverified })
          }
          hint={
            // "Nothing outstanding" is a claim about what was looked for.
            // With an unreadable picture nothing was looked for at all.
            unreadable
              ? "Nothing could be checked"
              : results?.people_affected > 0
                ? `${results.people_affected} affected`
                : unverified > 0
                  ? `${unverified} not judged`
                  : "Nothing outstanding"
          }
        />
        <StatisticsCard
          label="Compliance"
          value={rate === null || rate === undefined ? "—" : rate}
          unit={rate === null || rate === undefined ? undefined : "%"}
          icon={Hand}
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
                ? "No hands in view"
                : unverified > 0
                  ? `Of the hands seen · ${unverified} not judged`
                  : "Of the hands seen"
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

function Row({
  label,
  value,
  good = false,
  bad = false,
  muted = false,
  unverified = false,
  hint,
}) {
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
                : good
                  ? "text-success"
                  : "text-text"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
