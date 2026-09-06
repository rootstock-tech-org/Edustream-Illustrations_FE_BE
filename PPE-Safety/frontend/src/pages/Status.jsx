import { useCallback, useEffect, useRef, useState } from "react";
import { GraduationCap, ListChecks, Users } from "lucide-react";

import Badge from "../components/common/Badge";
import Panel from "../components/common/Panel";
import { EmptyState, ErrorState } from "../components/common/States";
import { SkillBadge, WorkerAvatar } from "../components/training/WorkerBadges";
import { workersApi } from "../services/workers";

/**
 * Every registered worker, and where they stand.
 *
 * One row per worker: have they completed their training program, what did
 * they score, and the verdict the user asked for — Skilled at sixty percent
 * or better, Unskilled below it, and honestly nothing at all until they
 * have been assessed. The arithmetic is the backend's, so this page can
 * never disagree with the Face Recognition page about the same person.
 */

const POLL_MS = 5000;

/** A short date for the row: "22 Aug 2026". */
function shortDate(iso) {
  if (!iso) return "";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  return at.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function Status() {
  const [workers, setWorkers] = useState(null);
  const [error, setError] = useState(null);

  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await workersApi.list();
      if (!mounted.current) return;
      setWorkers(data.workers);
      setError(null);
    } catch (err) {
      if (!mounted.current) return;
      setError(err?.message || "Could not reach the AI system.");
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const total = workers?.length ?? 0;
  const completed = workers?.filter((w) => w.training).length ?? 0;
  const skilled = workers?.filter((w) => w.skilled === true).length ?? 0;

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-5xl">
      <header className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-xl bg-primary-soft text-primary
                     flex items-center justify-center shrink-0"
        >
          <ListChecks size={20} />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-text">Status</h1>
          <p className="text-sm text-text-secondary">
            Every registered worker and where they stand: whether their
            training program is completed, their assessment score, and the
            skill verdict at 60%.
          </p>
        </div>
      </header>

      {workers !== null && workers.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Badge variant="neutral" dot={false}>
            {total} registered
          </Badge>
          <Badge variant={completed > 0 ? "primary" : "neutral"} dot={false}>
            {completed} completed training
          </Badge>
          <Badge variant={skilled > 0 ? "success" : "neutral"} dot={false}>
            {skilled} skilled
          </Badge>
        </div>
      )}

      <Panel title="Workers" icon={Users}>
        {workers === null ? (
          <p className="text-sm text-text-secondary">Loading…</p>
        ) : workers.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Nobody registered yet"
            description="Register workers on the Registration page — their training status appears here."
          />
        ) : (
          <ul className="divide-y divide-border -my-2">
            {workers.map((worker) => (
              <li
                key={worker.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3"
              >
                <WorkerAvatar
                  worker={worker}
                  name={`${worker.first_name} ${worker.last_name}`}
                  size="w-10 h-10"
                />

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text truncate">
                    {worker.first_name} {worker.last_name}
                    <span className="ml-2 text-xs font-normal text-text-muted">
                      {worker.employee_id}
                    </span>
                  </p>
                  <p className="text-xs text-text-secondary truncate">
                    {worker.designation}
                    {worker.department ? ` · ${worker.department}` : ""}
                  </p>
                  <p className="flex items-center gap-1 text-xs text-text-muted truncate">
                    <GraduationCap size={12} className="shrink-0" />
                    {worker.program_name}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {worker.training ? (
                    <Badge variant="primary" dot={false}>
                      Completed {shortDate(worker.training.completed_at)}
                    </Badge>
                  ) : (
                    <Badge variant="warning" dot={false}>
                      Training pending
                    </Badge>
                  )}

                  {worker.assessment && (
                    <span className="text-xs text-text-secondary tabular-nums">
                      {worker.assessment.score}/{worker.assessment.total} ·{" "}
                      {Math.round(
                        (worker.assessment.score / worker.assessment.total) *
                          100,
                      )}
                      %
                    </span>
                  )}

                  <SkillBadge worker={worker} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {error && (
        <Panel>
          <ErrorState detail={error} onRetry={refresh} />
        </Panel>
      )}
    </div>
  );
}
