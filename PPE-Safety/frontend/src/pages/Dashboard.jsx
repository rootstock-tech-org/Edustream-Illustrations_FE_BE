import { useCallback, useEffect, useState } from "react";
import { Camera, Eye, TriangleAlert, Users } from "lucide-react";

import Panel from "../components/common/Panel";
import RecentEvents from "../components/monitoring/RecentEvents";
import StatisticsCard from "../components/common/StatisticsCard";
import StatusCard from "../components/common/StatusCard";
import ModuleStatusGrid from "../components/dashboard/ModuleStatusGrid";
import SystemHealthPanel from "../components/dashboard/SystemHealthPanel";
import { readLegibility } from "../components/monitoring/legibility";
import { useModules } from "../modules/useModules";
import { createModuleApi, listModules } from "../services/moduleApi";
import api from "../services/api";

/**
 * Plant overview.
 *
 * Written for whoever walks past the screen: is the plant safe right now, is
 * anything being watched, and does anything need attention. No model names, no
 * inference timings, no confidence scores.
 *
 * Everything shown is measured. The recent-events panel reads the same
 * history the Safety events page does, across every capability rather than
 * one — which is the difference between an overview and a module page.
 */

const POLL_MS = 4000;

export default function Dashboard() {
  const { modules } = useModules();

  const [status, setStatus] = useState(null);
  const [results, setResults] = useState({});
  const [reachable, setReachable] = useState(true);

  // Polled, unlike the registry merge in useModules which runs once at mount.
  // Whether a module is watching changes every time a camera starts or stops,
  // so reading it from a value fixed at page load would be wrong within
  // seconds of anyone touching anything.
  const [live, setLive] = useState({});

  const available = modules.filter((m) => m.available);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/system/status");
      setStatus(data.data);
      setReachable(true);
    } catch {
      setReachable(false);
      return;
    }

    try {
      const catalog = await listModules();
      setLive(Object.fromEntries(catalog.map((m) => [m.module_id, m])));
    } catch {
      // The overview still works from the registry; only the live badges go
      // quiet, which is better than them going wrong.
    }

    // Ask each live module for its own state, so the overview reflects every
    // capability rather than just the first one.
    const serving = modules.filter((m) => m.live);

    const settled = await Promise.allSettled(
      serving.map((m) =>
        createModuleApi(m.id)
          .getResults()
          .then((r) => [m.id, r]),
      ),
    );

    setResults(
      Object.fromEntries(
        settled
          .filter((s) => s.status === "fulfilled")
          .map((s) => s.value),
      ),
    );
  }, [modules]);

  useEffect(() => {
    (async () => {
      await refresh();
    })();

    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  // Only from modules that are still receiving frames. A result is the last
  // thing a module saw, and it outlives the camera that produced it — so
  // without this the headline reads "1 safety issue needs attention" over a
  // camera that was switched off ten minutes ago.
  const reporting = modules
    .filter((m) => live[m.id]?.watching)
    .map((m) => ({ module: m, result: results[m.id] }))
    .filter((r) => r.result);

  // Capabilities that cannot see. This is the whole reason "Needs attention
  // now: 0" was a lie — zero problems found is not zero problems when
  // nothing could be looked at, and every screen we ship rendered the two
  // identically.
  const blind = reporting
    .map(({ module, result }) => ({ module, ...readLegibility(result) }))
    .filter((r) => r.unreadable);

  const seeing = reporting.length - blind.length;

  const alerting = reporting
    .filter(({ result }) => result.alert && !readLegibility(result).unreadable)
    .map(({ result }) => result);

  // What the operator would need to fix, named. "Safety Gear: too dark to
  // check" is actionable; "some capabilities cannot see" is not.
  // The module's own words, already a sentence — its full stop is stripped so
  // the sentences built from it below do not end in two of them.
  const blindDetail = blind
    .map(({ module, reason }) => {
      const why = reason.replace(/\.+$/, "");
      return `${module.label}: ${why.charAt(0).toLowerCase()}${why.slice(1)}`;
    })
    .join(" · ");

  const blindPhrase =
    blind.length === 1
      ? "1 capability cannot see"
      : `${blind.length} capabilities cannot see`;

  // Set up and able to watch, as against actually receiving frames. Both are
  // worth knowing and they are not the same number — this screen used to show
  // the first one under the word "watching", which is how it came to report
  // three modules watching with no camera connected.
  const configured = modules.filter((m) => m.ready).length;
  const watching = modules.filter((m) => live[m.id]?.watching).length;

  // Cameras feeding the system, wherever they are. The server's own capture
  // is one; every browser pushing its camera over a socket is another. This
  // card used to count only the first, so an operator watching through their
  // phone read "0 connected" beside a live picture.
  const serverCam = Boolean(status?.camera?.connected);
  const browserCams = status?.camera?.browser_streams ?? 0;
  const cameras = (serverCam ? 1 : 0) + browserCams;

  const cameraHint = !cameras
    ? "None connected"
    : serverCam && browserCams
      ? `${status.camera.source} + ${browserCams} from ${browserCams === 1 ? "a browser" : "browsers"}`
      : serverCam
        ? status?.camera?.source
        : browserCams === 1
          ? "Someone's own device"
          : `${browserCams} people's own devices`;

  // Only trust a headcount somebody is actually taking.
  const counting = Boolean(status?.occupancy?.measured);
  const people = counting ? status.occupancy.people : null;

  // A capability that cannot see outranks "All clear" and is outranked by a
  // real violation. It is never the green state: "we looked and it is fine"
  // and "we could not look" are different facts and this screen used to
  // render them as the same one.
  const factoryStatus = !reachable
    ? "warning"
    : alerting.length > 0
      ? "alert"
      : blind.length > 0
        ? "unverified"
        : watching > 0
          ? "ok"
          : "idle";

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-[1600px] mx-auto animate-fade-in">
      <header>
        <h1 className="text-xl font-semibold text-text tracking-tight">
          Overview
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          What is being watched right now, and anything that needs attention.
        </p>
      </header>

      <StatusCard
        status={factoryStatus}
        title={
          !reachable
            ? "Cannot reach the AI system"
            : alerting.length > 0
              ? alerting.length === 1
                ? "1 safety issue needs attention"
                : `${alerting.length} safety issues need attention`
              : blind.length > 0
                ? blindPhrase
                : watching > 0
                  ? "All clear"
                  : configured > 0
                    ? "Nothing is being watched right now"
                    : "Nothing is set up yet"
        }
        description={
          !reachable
            ? "Nothing on this screen is up to date. Check that the AI system is running."
            : alerting.length > 0
              ? [
                  alerting.map((a) => a.summary).join(" · "),
                  blind.length > 0 ? `Also ${blindPhrase} — ${blindDetail}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : blind.length > 0
                ? `${blindDetail}. Nothing on this screen is an all-clear for ${blind.length === 1 ? "it" : "them"}` +
                  (seeing > 0
                    ? `; the other ${seeing} being watched ${seeing === 1 ? "is" : "are"} within safety rules.`
                    : ", and nothing else is being watched.")
                : watching > 0
                  ? "Everything being watched is within safety rules."
                  : configured > 0
                    ? `${configured} of ${modules.length} capabilities are set up. Connect a camera on any monitoring page to start watching.`
                    : "Open a monitoring page to connect a camera and set up what should be watched."
        }
        pulse
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Zero problems found is not zero problems when nothing could be
            looked at. With every watching capability blind there is no
            measurement at all, so the figure is a dash — the same convention
            "People in view" below already uses. With some blind and some
            seeing the count is real but partial, so it keeps its number and
            loses its green. */}
        <StatisticsCard
          label="Needs attention now"
          value={blind.length > 0 && seeing === 0 ? "—" : alerting.length}
          icon={TriangleAlert}
          tone={
            alerting.length > 0
              ? "danger"
              : blind.length > 0
                ? "warning"
                : "success"
          }
          hint={
            blind.length > 0
              ? blindPhrase
              : alerting.length === 0
                ? "Nothing outstanding"
                : "Open to review"
          }
        />
        {/* Counts what is receiving frames, not what could. The hint carries
            the other number, so a set-up-but-idle system reads as idle
            rather than as watching. */}
        <StatisticsCard
          label="Being watched"
          value={watching}
          unit={`of ${modules.length}`}
          icon={Eye}
          tone={watching > 0 ? "primary" : "neutral"}
          hint={
            // Receiving frames is not the same as being able to read them,
            // and this card counts the first.
            blind.length > 0
              ? `${blindPhrase}`
              : watching > 0
                ? `${configured} set up, ${available.length} available`
                : configured > 0
                  ? `${configured} set up, none watching`
                  : "Not set up yet"
          }
        />
        <StatisticsCard
          label="Cameras connected"
          value={cameras}
          icon={Camera}
          tone={cameras > 0 ? "success" : "neutral"}
          hint={cameraHint}
        />
        {/* A dash rather than a number when nothing is counting. This card
            used to hold the last figure it ever saw, so it read "1 person in
            view" beside "no camera connected". */}
        <StatisticsCard
          label="People in view"
          value={counting ? people : "—"}
          icon={Users}
          tone="neutral"
          hint={
            counting
              ? "In the latest picture"
              : watching > 0
                ? "Not being counted by what is watching"
                : "Nothing is watching"
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
        <div className="space-y-5 min-w-0">
          <Panel title="Safety monitoring" icon={Eye}>
            <ModuleStatusGrid modules={modules} results={results} live={live} />
          </Panel>

          <Panel title="Recent safety events" icon={TriangleAlert}>
            {/* Across every capability, which is what the dashboard is for —
                the per-module pages each show only their own. */}
            <RecentEvents limit={6} />
          </Panel>
        </div>

        <SystemHealthPanel status={status} reachable={reachable} />
      </div>
    </div>
  );
}
