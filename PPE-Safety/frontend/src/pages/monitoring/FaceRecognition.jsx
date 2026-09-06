import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BadgeCheck,
  BookUser,
  ScanFace,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  Users,
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
import RecentEvents from "../../components/monitoring/RecentEvents";
import UnverifiedNotice from "../../components/monitoring/UnverifiedNotice";
import {
  measuredCount,
  peopleCount,
  readLegibility,
  resumedSpeech,
  unverifiedDescription,
  unverifiedSpeech,
} from "../../components/monitoring/legibility";
import {
  cameraApi,
  createModuleApi,
  facePeopleApi,
} from "../../services/moduleApi";
import { SkillBadge, WorkerAvatar } from "../../components/training/WorkerBadges";
import { workersApi } from "../../services/workers";
import { useWebcamAnalysis } from "../../hooks/useWebcamAnalysis";
import { useAlertSound } from "../../hooks/useAlertSound";
import AlertSoundToggle from "../../components/monitoring/AlertSoundToggle";
import StopMonitoringButton from "../../components/monitoring/StopMonitoringButton";

/**
 * Face recognition against the register.
 *
 * People reach the register through worker registration: the photos given
 * there enroll them, and the AI announces them by name the moment they
 * appear on any input — green, because a recognised worker is the system
 * working. The registration form this page used to carry is gone; this
 * page watches and manages the list, it no longer grows it. Everyone not
 * registered is "unknown" and left alone — this recognises the people on
 * the list, it does not identify the public.
 */

const api = createModuleApi("face");
const POLL_MS = 2000;

export default function FaceRecognition() {
  const [status, setStatus] = useState(null);
  const [serverResults, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [serverWatching, setWatching] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [sourceLabel, setSourceLabel] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);

  const [people, setPeople] = useState([]);

  // The worker register, joined to recognitions by face_person_id: when a
  // recognised face belongs to a registered worker, this page can say who
  // they are in full — details, training, and the skill verdict — rather
  // than only that a name matched.
  const [workers, setWorkers] = useState([]);

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

  const refreshPeople = useCallback(async () => {
    try {
      const data = await facePeopleApi.list();
      if (mounted.current) setPeople(data.people);
    } catch {
      // The register list is retried on the next change; the page's own
      // error banner already reports a backend that is down.
    }
    try {
      const data = await workersApi.list();
      if (mounted.current) setWorkers(data.workers);
    } catch {
      // Same policy: a worker-register blip is not a second banner.
    }
  }, []);

  useEffect(() => {
    (async () => {
      await Promise.all([refresh(), refreshPeople()]);
    })();

    const timer = setInterval(() => {
      refresh();
      refreshPeople();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh, refreshPeople]);

  const serverStreamUrl = useMemo(
    () => (serverWatching ? api.streamUrl() : null),
    [serverWatching],
  );

  // This device's camera. The browser captures and pushes frames, so the
  // model can run on a GPU elsewhere while the camera stays on the desk.
  const webcam = useWebcamAnalysis("face", { file: videoUrl });

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

  // Could the AI judge this picture at all? Recognition is the most robust
  // capability here — it matched at 0.86 in near-darkness — so this state
  // should be rare on this page. It is still wired, because "nobody on the
  // register in view" from a picture nothing was compared against is the same
  // sentence as everywhere else.
  const { unreadable, reason, unverified } = readLegibility(results);

  const alert = Boolean(results?.alert) && !unreadable;

  const recognized = unreadable ? [] : (results?.recognized ?? []);

  // Recognised faces that belong to registered workers, with the full
  // worker record attached. The join lives here rather than in the face
  // module: recognition stays about faces, and who a worker is stays the
  // worker register's answer.
  const workerByFace = useMemo(() => {
    const map = new Map();
    for (const worker of workers) {
      if (worker.face_person_id) map.set(worker.face_person_id, worker);
    }
    return map;
  }, [workers]);

  const identifiedWorkers = useMemo(
    () =>
      recognized
        .filter((match) => match.kind === "worker")
        .map((match) => ({
          match,
          worker: workerByFace.get(match.id) || null,
        })),
    [recognized, workerByFace],
  );

  // The exact wording the operator asked for, names filled in: spoken
  // verbatim instead of the generic "Alert! ..." template.
  const spoken = recognized.length
    ? `Person recognized, ${[...new Set(recognized.map((r) => r.name))].join(" and ")}`
    : undefined;

  // Sounds where the operator is: the chime grabs attention, then the
  // sentence above names the person.
  const sound = useAlertSound(alert, results?.summary, {
    spoken,
    unverified: {
      active: showing && unreadable,
      spoken: unverifiedSpeech("Face Recognition", reason),
      resumed:
        showing && !unreadable ? resumedSpeech("Face Recognition") : null,
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

  const available = status?.ready !== false;

  const facesInView = results?.faces_total ?? 0;
  const unknownCount = results?.unknown_count ?? 0;
  const registered = people.length;

  return (
    <ModuleLayout
      title="Face Recognition"
      description="The AI recognises registered people the moment they appear on camera."
      icon={ScanFace}
      watching={watching}
      alert={alert}
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
            alert ? "Person recognized" : photo ? "Checked photo" : undefined
          }
          stats={
            watching && facesInView > 0
              ? [{ label: "Faces", value: facesInView }]
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
                icon={ScanFace}
                title="Not watching"
                description={
                  registered === 0
                    ? "Register workers on the Registration page, then connect a camera."
                    : "Connect a camera above to start recognising."
                }
              />
            ) : unreadable ? (
              <UnverifiedNotice
                reason={reason}
                description="No face is being compared against the register until the picture improves."
              />
            ) : facesInView === 0 ? (
              <EmptyState
                icon={Users}
                title="Nobody in view"
                description="Recognition runs as soon as a face is visible."
              />
            ) : (
              <dl className="space-y-3 text-sm">
                {unverified > 0 && (
                  <Row
                    label={
                      unverified === 1
                        ? "Person seen but not judged"
                        : "People seen but not judged"
                    }
                    hint="Not clear enough to compare against the register"
                    value={`${unverified}`}
                    unverified
                  />
                )}
                {recognized.map((match) => (
                  <Row
                    key={match.id}
                    label={match.name}
                    hint={
                      match.kind === "worker"
                        ? "Registered worker"
                        : match.crime || "No note on record"
                    }
                    value={`${match.confidence}% sure`}
                    bad={match.kind !== "worker"}
                  />
                ))}
                {unknownCount > 0 && (
                  <Row
                    label={
                      unknownCount === 1 ? "Unknown face" : "Unknown faces"
                    }
                    hint="Not on the register — left alone"
                    value={`${unknownCount}`}
                    muted
                  />
                )}
              </dl>
            )}
          </Panel>

          {identifiedWorkers.length > 0 && (
            <Panel title="Identified worker" icon={BadgeCheck}>
              <ul className="space-y-4">
                {identifiedWorkers.map(({ match, worker }) => (
                  <li key={match.id} className="flex gap-3">
                    <WorkerAvatar worker={worker} name={match.name} />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-text">
                          {match.name}
                        </p>
                        {worker ? (
                          <SkillBadge worker={worker} />
                        ) : (
                          <Badge variant="neutral" dot={false}>
                            record removed
                          </Badge>
                        )}
                      </div>

                      {worker ? (
                        <>
                          <p className="text-xs text-text-secondary">
                            {worker.employee_id} · {worker.designation}
                            {worker.department
                              ? ` · ${worker.department}`
                              : ""}
                          </p>
                          <p className="text-xs text-text-secondary">
                            {worker.program_name} —{" "}
                            {worker.training
                              ? "training completed"
                              : "training pending"}
                            {worker.assessment
                              ? ` · scored ${worker.assessment.score}/${worker.assessment.total}`
                              : " · not assessed yet"}
                          </p>
                          {(worker.phone || worker.blood_group) && (
                            <p className="text-xs text-text-muted">
                              {[
                                worker.phone,
                                worker.blood_group
                                  ? `blood group ${worker.blood_group}`
                                  : "",
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-xs text-text-secondary">
                          Recognised from a worker enrollment whose
                          registration was deleted.
                        </p>
                      )}
                      <p className="text-xs text-text-muted">
                        {match.confidence}% sure
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel title="Past sightings" icon={TriangleAlert}>
            {/* Refreshed when the alert state changes, so a sighting appears
                without a reload while the operator is watching. */}
            <RecentEvents moduleId="face" refreshToken={alert ? 1 : 0} />
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
              : unreadable
                ? "unverified"
                : showing && facesInView > 0
                  ? "ok"
                  : "idle"
        }
        title={
          !available
            ? "Face recognition is not available"
            : alert
              ? results.summary
              : unreadable
                ? reason
                : registered === 0
                  ? "Nobody on the register yet"
                  : showing && facesInView > 0
                    ? "Nobody on the register in view"
                    : "Not recognising anyone yet"
        }
        description={
          !available
            ? status?.problem ||
              "The face recognition AI could not be loaded on this system."
            : alert
              ? "A registered person is on camera. Follow your site's procedure."
              : unreadable
                ? unverifiedDescription(
                    unverified > 0
                      ? `Nobody is being compared against the register — ${peopleCount(unverified)} in view could not be judged.`
                      : "Nobody is being compared against the register.",
                  )
                : registered === 0
                  ? "The AI recognises only registered people — workers enroll with their photos on the Registration page."
                  : showing
                    ? "Every face in view is being compared against the register."
                    : "Connect a camera to begin."
        }
        pulse
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatisticsCard
          label="Faces in view"
          value={measuredCount(facesInView, unreadable)}
          icon={ScanFace}
          tone="neutral"
          hint={
            unreadable
              ? unverified > 0
                ? `${unverified} seen, none judged`
                : "No face could be made out"
              : unverified > 0
                ? `${unverified} not judged`
                : undefined
          }
        />
        <StatisticsCard
          label="Recognized"
          value={measuredCount(results?.recognized_count ?? 0, unreadable)}
          icon={TriangleAlert}
          tone={
            unreadable ? "neutral" : recognized.length > 0 ? "danger" : "success"
          }
          hint={
            // "Nobody from the register" claims a comparison happened.
            unreadable
              ? "Nobody could be compared"
              : recognized.length > 0
                ? [...new Set(recognized.map((r) => r.name))].join(", ")
                : "Nobody from the register"
          }
        />
        <StatisticsCard
          label="Unknown faces"
          value={measuredCount(unknownCount, unreadable)}
          icon={Users}
          tone="neutral"
          hint={unreadable ? "Nobody could be compared" : "Not on the register"}
        />
        <StatisticsCard
          label="People registered"
          value={registered}
          icon={BookUser}
          tone="neutral"
          hint="On the watch register"
        />
      </div>

      <RegisteredPeoplePanel
        people={people}
        onRemoved={() => {
          refreshPeople();
          refresh();
        }}
      />

      {(error || webcam.error) && (
        <Panel>
          <ErrorState detail={webcam.error || error} onRetry={refresh} />
        </Panel>
      )}
    </ModuleLayout>
  );
}

function RegisteredPeoplePanel({ people, onRemoved }) {
  const [removing, setRemoving] = useState(null);
  const [error, setError] = useState(null);

  const remove = async (person) => {
    setRemoving(person.id);
    setError(null);

    try {
      await facePeopleApi.remove(person.id);
      onRemoved();
    } catch (err) {
      setError(
        err?.response?.data?.detail || err?.message || "Could not remove.",
      );
    } finally {
      setRemoving(null);
    }
  };

  return (
    <Panel
      title="Registered people"
      icon={BookUser}
      subtitle="One list for every camera on site. Workers join it automatically when registered; removing a person stops recognition of them everywhere, immediately."
    >
      {people.length === 0 ? (
        <EmptyState
          icon={BookUser}
          title="Nobody registered yet"
          description="Register workers with their photos on the Registration page — they appear here and are recognised on every camera."
        />
      ) : (
        <ul className="divide-y divide-border">
          {people.map((person) => (
            <li key={person.id} className="flex items-start gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text flex items-center gap-2">
                  {person.name}
                  {person.kind === "worker" && (
                    <Badge variant="success" dot={false}>
                      worker
                    </Badge>
                  )}
                </p>
                <p className="text-xs text-text-muted truncate">
                  {person.crime || "No note on record"}
                </p>
              </div>
              <span className="text-xs text-text-muted tabular-nums shrink-0 mt-0.5">
                {person.photos} photo{person.photos === 1 ? "" : "s"}
              </span>
              <Button
                variant="ghost"
                size="sm"
                icon={Trash2}
                loading={removing === person.id}
                aria-label={`Remove ${person.name}`}
                onClick={() => remove(person)}
                className="shrink-0 hover:text-danger"
              />
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-xs text-danger mt-2">{error}</p>}
    </Panel>
  );
}

function Row({ label, value, bad = false, muted = false, unverified = false, hint }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <dt className="text-text-secondary font-medium">{label}</dt>
        {hint && <p className="text-xs text-text-muted mt-0.5">{hint}</p>}
      </div>
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
