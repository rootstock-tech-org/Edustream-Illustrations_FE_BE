import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, ChevronDown, ChevronUp, GraduationCap } from "lucide-react";

import Badge from "../components/common/Badge";
import Button from "../components/common/Button";
import Panel from "../components/common/Panel";
import { ErrorState } from "../components/common/States";
import { workersApi } from "../services/workers";

/**
 * The training catalog.
 *
 * The programs a newly registered worker can be allotted — read-only,
 * because they are the product's seeded demonstration content, not operator
 * data. What this page adds over the seed file is the join: how many
 * workers each program has been allotted to, live.
 */

const POLL_MS = 10000;

function ProgramCard({ program, passMark }) {
  const [open, setOpen] = useState(false);

  return (
    <Panel
      title={program.name}
      icon={BookOpen}
      action={
        <Badge variant="primary" dot={false}>
          {program.allotted} allotted
        </Badge>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-text-secondary">{program.summary}</p>

        <p className="text-xs text-text-muted">
          {program.sections.length} sections ·{" "}
          {program.questions}-question assessment · pass mark {passMark}/
          {program.questions}
        </p>

        {open && (
          <ol className="space-y-3">
            {program.sections.map((section, index) => (
              <li
                key={section.title}
                className="rounded-lg border border-border bg-subtle p-3"
              >
                <p className="text-sm font-medium text-text">
                  {index + 1}. {section.title}
                </p>
                <p className="mt-1 text-xs text-text-secondary leading-relaxed">
                  {section.body}
                </p>
              </li>
            ))}
          </ol>
        )}

        <Button
          variant="ghost"
          size="sm"
          icon={open ? ChevronUp : ChevronDown}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "Hide sections" : "Read the sections"}
        </Button>
      </div>
    </Panel>
  );
}

export default function Programs() {
  const [catalog, setCatalog] = useState(null);
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
      const data = await workersApi.programs();
      if (!mounted.current) return;
      setCatalog(data);
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

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-5xl">
      <header className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-xl bg-primary-soft text-primary
                     flex items-center justify-center shrink-0"
        >
          <GraduationCap size={20} />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-text">Programs</h1>
          <p className="text-sm text-text-secondary">
            The induction programs a new worker can be allotted. One is
            assigned automatically at registration and runs on the worker's
            own phone through their link.
          </p>
        </div>
      </header>

      {catalog === null && !error && (
        <Panel>
          <p className="text-sm text-text-secondary">Loading…</p>
        </Panel>
      )}

      {catalog?.programs.map((program) => (
        <ProgramCard
          key={program.id}
          program={program}
          passMark={catalog.pass_mark}
        />
      ))}

      {error && (
        <Panel>
          <ErrorState detail={error} onRetry={refresh} />
        </Panel>
      )}
    </div>
  );
}
