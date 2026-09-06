import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  HelpCircle,
} from "lucide-react";

import Badge from "../components/common/Badge";
import Button from "../components/common/Button";
import Panel from "../components/common/Panel";
import { ErrorState } from "../components/common/States";
import { workersApi } from "../services/workers";

/**
 * The assessments — the quizzes each training program ends with.
 *
 * The desk-side view of the quiz bank: every question, its options, and
 * the correct answer marked. This is deliberately the only surface that
 * shows the key. The worker's phone never receives it — grading happens
 * on the server — so reading the answers means standing at this desk,
 * not opening a phone's network inspector.
 *
 * Beside each quiz: how its workers have done so far, because a page
 * called Assessment should say how the assessment is going.
 */

const POLL_MS = 10000;

function QuizCard({ program, passMark }) {
  const [open, setOpen] = useState(false);

  return (
    <Panel
      title={program.name}
      icon={ClipboardCheck}
      action={
        <div className="flex items-center gap-2">
          <Badge variant="neutral" dot={false}>
            {program.taken} taken
          </Badge>
          {/* Green only when somebody has actually passed — a green
              "0 passed" reads as good news about a failure. */}
          <Badge
            variant={program.passed > 0 ? "success" : "neutral"}
            dot={false}
          >
            {program.passed} passed
          </Badge>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-text-muted">
          {program.quiz.length} questions · pass mark {passMark}/
          {program.quiz.length} · graded on the server — workers never see
          this key
        </p>

        {open && (
          <ol className="space-y-3">
            {program.quiz.map((item, index) => (
              <li
                key={index}
                className="rounded-lg border border-border bg-subtle p-3 space-y-2"
              >
                <p className="text-sm font-medium text-text">
                  {index + 1}. {item.question}
                </p>
                <ul className="space-y-1">
                  {item.options.map((option, optionIndex) => {
                    const correct = optionIndex === item.answer;
                    return (
                      <li
                        key={optionIndex}
                        className={`flex items-start gap-2 rounded-md px-2 py-1 text-xs ${
                          correct
                            ? "bg-success-soft text-success font-medium"
                            : "text-text-secondary"
                        }`}
                      >
                        {correct ? (
                          <Check size={14} className="mt-0.5 shrink-0" />
                        ) : (
                          <span className="w-3.5 shrink-0" />
                        )}
                        {option}
                      </li>
                    );
                  })}
                </ul>
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
          {open ? "Hide the questions" : "Read the questions"}
        </Button>
      </div>
    </Panel>
  );
}

export default function Assessment() {
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
      const data = await workersApi.assessments();
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
          <ClipboardCheck size={20} />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-text">Assessment</h1>
          <p className="text-sm text-text-secondary">
            The quiz each training program ends with — questions, options,
            and the correct answer marked. Workers take it on their own
            phone through their link; it is graded here on the server, and
            the key never leaves this room.
          </p>
        </div>
      </header>

      {catalog === null && !error && (
        <Panel>
          <p className="text-sm text-text-secondary">Loading…</p>
        </Panel>
      )}

      {catalog?.programs.map((program) => (
        <QuizCard
          key={program.id}
          program={program}
          passMark={catalog.pass_mark}
        />
      ))}

      {catalog && (
        <p className="flex items-center gap-1.5 text-xs text-text-muted">
          <HelpCircle size={13} />
          A failed assessment can be retaken from the worker's link; the
          latest attempt is the one that counts.
        </p>
      )}

      {error && (
        <Panel>
          <ErrorState detail={error} onRetry={refresh} />
        </Panel>
      )}
    </div>
  );
}
