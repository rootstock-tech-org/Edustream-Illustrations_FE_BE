import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Award,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Printer,
  RotateCcw,
  X,
} from "lucide-react";

import { workersApi } from "../services/workers";

/**
 * The worker's own page — the address on the link they were handed.
 *
 * Deliberately outside the dashboard shell: this renders on a worker's
 * phone, and a control room's sidebar has no business there. One screen at
 * a time, in the order the flow demands: welcome, the allotted program's
 * sections, the certificate, then "Take assessment", the quiz, and the
 * score card. A revisit resumes from what the backend says has already
 * happened, so the link can be opened as many times as the worker likes.
 *
 * The certificate and the score card both print — on a phone that means
 * "save as PDF" — via a print stylesheet that hides everything but the
 * card being printed.
 */

/** The screens, in flow order. */
const STAGES = {
  WELCOME: "welcome",
  TRAINING: "training",
  CERTIFICATE: "certificate",
  ASSESSMENT_INTRO: "assessment-intro",
  QUIZ: "quiz",
  SCORECARD: "scorecard",
};

const PRINT_CSS = `
@media print {
  body * { visibility: hidden; }
  .print-area, .print-area * { visibility: visible; }
  .print-area {
    position: absolute;
    inset: 0;
    margin: 0;
    border-width: 4px;
  }
  .no-print { display: none !important; }
}
`;

/** A long date, the way a certificate says it. */
function certDate(iso) {
  if (!iso) return "";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return String(iso);
  return at.toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** The page's standard primary button. */
function BigButton({ onClick, disabled = false, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="no-print w-full rounded-xl bg-primary text-white text-sm font-medium
                 px-4 py-3 disabled:opacity-40
                 focus:outline-none focus:ring-2 focus:ring-primary/40"
    >
      {children}
    </button>
  );
}

/** The certificate, printable. */
function Certificate({ worker }) {
  const training = worker.training;
  return (
    <div
      className="print-area rounded-2xl border-4 border-double border-primary/60
                 bg-surface p-6 sm:p-10 text-center space-y-4"
    >
      <Award size={40} className="mx-auto text-primary" />
      <p className="text-xs uppercase tracking-[0.25em] text-text-secondary">
        Certificate of Completion
      </p>
      <p className="text-sm text-text-secondary">This certifies that</p>
      <p className="text-2xl font-semibold text-text">
        {worker.first_name} {worker.last_name}
      </p>
      <p className="text-xs text-text-muted">
        {worker.designation} · Employee ID {worker.employee_id}
      </p>
      <p className="text-sm text-text-secondary">
        has successfully completed the training program
      </p>
      <p className="text-lg font-medium text-primary">{worker.program.name}</p>
      <div className="pt-4 border-t border-border text-xs text-text-muted space-y-1">
        <p>Completed on {certDate(training.completed_at)}</p>
        <p>Certificate no. {training.certificate_id}</p>
      </div>
    </div>
  );
}

/** The score card, printable. */
function ScoreCard({ worker }) {
  const result = worker.assessment;
  const quiz = worker.program.quiz;
  const percent = Math.round((result.score / result.total) * 100);

  return (
    <div
      className="print-area rounded-2xl border-4 border-double border-primary/60
                 bg-surface p-6 sm:p-8 space-y-4"
    >
      <div className="text-center space-y-2">
        <ClipboardCheck size={36} className="mx-auto text-primary" />
        <p className="text-xs uppercase tracking-[0.25em] text-text-secondary">
          Assessment Score Card
        </p>
        <p className="text-xl font-semibold text-text">
          {worker.first_name} {worker.last_name}
        </p>
        <p className="text-xs text-text-muted">
          {worker.program.name} · Employee ID {worker.employee_id}
        </p>
      </div>

      <div className="text-center py-2">
        <p className="text-4xl font-semibold text-text">
          {result.score}/{result.total}
        </p>
        <p className="mt-1 text-sm text-text-secondary">{percent}%</p>
        <p
          className={`mt-2 inline-block rounded-full px-4 py-1 text-sm font-medium ${
            result.passed
              ? "bg-success-soft text-success"
              : "bg-danger-soft text-danger"
          }`}
        >
          {result.passed ? "PASSED" : "NOT PASSED"}
        </p>
      </div>

      <ol className="space-y-1.5">
        {quiz.map((question, index) => (
          <li key={index} className="flex items-start gap-2 text-xs">
            {result.per_question[index] ? (
              <Check size={14} className="mt-0.5 shrink-0 text-success" />
            ) : (
              <X size={14} className="mt-0.5 shrink-0 text-danger" />
            )}
            <span className="text-text-secondary">{question.question}</span>
          </li>
        ))}
      </ol>

      <div className="pt-3 border-t border-border text-xs text-text-muted space-y-1 text-center">
        <p>Taken on {certDate(result.taken_at)}</p>
        <p>Score card no. {result.scorecard_id}</p>
      </div>
    </div>
  );
}

export default function WorkerPortal() {
  const { token } = useParams();

  const [worker, setWorker] = useState(null);
  const [invalid, setInvalid] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const [stage, setStage] = useState(null);
  const [sectionIndex, setSectionIndex] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState([]);

  useEffect(() => {
    document.title = "Training";
  }, []);

  // First load: ask the backend how far this worker already is, and land
  // on the right screen — the link resumes, it never starts over.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await workersApi.portal(token);
        if (!alive) return;
        setWorker(data);
        setStage(
          data.assessment
            ? STAGES.SCORECARD
            : data.training
              ? STAGES.CERTIFICATE
              : STAGES.WELCOME,
        );
      } catch (err) {
        if (!alive) return;
        if (err?.response?.status === 404) setInvalid(true);
        else setError(err?.message || "Could not load your training.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  const program = worker?.program;
  const sections = program?.sections ?? [];
  const quiz = program?.quiz ?? [];

  const complete = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await workersApi.complete(token);
      setWorker(data);
      setStage(STAGES.CERTIFICATE);
      window.scrollTo(0, 0);
    } catch (err) {
      setError(
        err?.response?.data?.detail || err?.message || "Could not save.",
      );
    } finally {
      setBusy(false);
    }
  }, [token]);

  const submitAssessment = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await workersApi.assess(token, answers);
      setWorker(data);
      setStage(STAGES.SCORECARD);
      window.scrollTo(0, 0);
    } catch (err) {
      setError(
        err?.response?.data?.detail || err?.message || "Could not submit.",
      );
    } finally {
      setBusy(false);
    }
  }, [token, answers]);

  const startQuiz = () => {
    setAnswers(Array(quiz.length).fill(null));
    setQuestionIndex(0);
    setStage(STAGES.QUIZ);
    window.scrollTo(0, 0);
  };

  const progressDots = useMemo(() => {
    if (stage !== STAGES.TRAINING) return null;
    return (
      <div className="no-print flex justify-center gap-1.5">
        {sections.map((_, index) => (
          <span
            key={index}
            className={`h-1.5 rounded-full transition-all ${
              index === sectionIndex
                ? "w-6 bg-primary"
                : index < sectionIndex
                  ? "w-1.5 bg-primary/50"
                  : "w-1.5 bg-border"
            }`}
          />
        ))}
      </div>
    );
  }, [stage, sections, sectionIndex]);

  /* ---------------------------------------------------------------- */

  if (invalid) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-sm text-center space-y-3">
          <X size={32} className="mx-auto text-danger" />
          <h1 className="text-lg font-semibold text-text">
            This link isn't valid
          </h1>
          <p className="text-sm text-text-secondary">
            It may have been mistyped, or the registration it belonged to was
            removed. Ask the office for a fresh link.
          </p>
        </div>
      </div>
    );
  }

  if (!worker || !stage) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <p className="text-sm text-text-secondary">
          {error || "Loading your training…"}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <style>{PRINT_CSS}</style>

      <div className="max-w-md mx-auto p-4 sm:p-6 space-y-4">
        {/* Who this page belongs to — on every screen, so a phone found on
            a bench answers whose training it is showing. */}
        <header className="no-print flex items-center gap-3 pt-2">
          <div
            className="w-9 h-9 rounded-xl bg-primary-soft text-primary
                       flex items-center justify-center shrink-0"
          >
            <BookOpen size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-text truncate">
              {worker.first_name} {worker.last_name}
            </p>
            <p className="text-xs text-text-secondary truncate">
              {program.name}
            </p>
          </div>
        </header>

        {stage === STAGES.WELCOME && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-surface p-5 space-y-3">
              <h1 className="text-lg font-semibold text-text">
                Welcome, {worker.first_name}
              </h1>
              <p className="text-sm text-text-secondary">
                You have been allotted the training program{" "}
                <span className="font-medium text-text">{program.name}</span>.
              </p>
              <p className="text-sm text-text-secondary">{program.summary}</p>
              <p className="text-xs text-text-muted">
                {sections.length} short sections · a {quiz.length}-question
                assessment at the end · your certificate is issued on
                completion.
              </p>
            </div>
            <BigButton
              onClick={() => {
                setSectionIndex(0);
                setStage(STAGES.TRAINING);
              }}
            >
              Start training
            </BigButton>
          </div>
        )}

        {stage === STAGES.TRAINING && (
          <div className="space-y-4">
            {progressDots}
            <div className="rounded-2xl border border-border bg-surface p-5 space-y-3">
              <p className="text-xs text-text-muted">
                Section {sectionIndex + 1} of {sections.length}
              </p>
              <h2 className="text-base font-semibold text-text">
                {sections[sectionIndex].title}
              </h2>
              <p className="text-sm text-text-secondary leading-relaxed">
                {sections[sectionIndex].body}
              </p>
            </div>

            <div className="no-print flex gap-2">
              <button
                type="button"
                onClick={() => setSectionIndex((i) => Math.max(0, i - 1))}
                disabled={sectionIndex === 0}
                className="rounded-xl border border-border bg-surface px-4 py-3
                           text-sm text-text disabled:opacity-40"
                aria-label="Previous section"
              >
                <ChevronLeft size={16} />
              </button>
              {sectionIndex < sections.length - 1 ? (
                <BigButton onClick={() => setSectionIndex((i) => i + 1)}>
                  <span className="inline-flex items-center gap-1.5">
                    Next section <ChevronRight size={16} />
                  </span>
                </BigButton>
              ) : (
                <BigButton onClick={complete} disabled={busy}>
                  {busy ? "Saving…" : "Complete training"}
                </BigButton>
              )}
            </div>
          </div>
        )}

        {stage === STAGES.CERTIFICATE && (
          <div className="space-y-4">
            <Certificate worker={worker} />
            <div className="no-print flex gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-xl border border-border bg-surface px-4 py-3
                           text-sm text-text inline-flex items-center gap-1.5"
              >
                <Printer size={16} /> Save
              </button>
              <BigButton onClick={() => setStage(STAGES.ASSESSMENT_INTRO)}>
                Continue
              </BigButton>
            </div>
          </div>
        )}

        {stage === STAGES.ASSESSMENT_INTRO && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-surface p-5 text-center space-y-3">
              <ClipboardCheck size={32} className="mx-auto text-primary" />
              <h1 className="text-lg font-semibold text-text">
                Take assessment
              </h1>
              <p className="text-sm text-text-secondary">
                {quiz.length} questions on what the training covered. You need{" "}
                {program.pass_mark} right to pass, and you can retake it if it
                goes badly.
              </p>
            </div>
            <BigButton onClick={startQuiz}>Start assessment</BigButton>
            <button
              type="button"
              onClick={() => setStage(STAGES.CERTIFICATE)}
              className="no-print w-full text-center text-xs text-text-secondary underline
                         underline-offset-4"
            >
              View my certificate again
            </button>
          </div>
        )}

        {stage === STAGES.QUIZ && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-surface p-5 space-y-3">
              <p className="text-xs text-text-muted">
                Question {questionIndex + 1} of {quiz.length}
              </p>
              <h2 className="text-base font-semibold text-text">
                {quiz[questionIndex].question}
              </h2>
              <div className="space-y-2">
                {quiz[questionIndex].options.map((option, optionIndex) => {
                  const chosen = answers[questionIndex] === optionIndex;
                  return (
                    <button
                      key={optionIndex}
                      type="button"
                      onClick={() =>
                        setAnswers((a) => {
                          const next = [...a];
                          next[questionIndex] = optionIndex;
                          return next;
                        })
                      }
                      aria-pressed={chosen}
                      className={`w-full text-left text-sm rounded-xl border px-4 py-3 ${
                        chosen
                          ? "border-primary bg-primary/10 text-text font-medium"
                          : "border-border bg-subtle text-text-secondary"
                      }`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="no-print flex gap-2">
              <button
                type="button"
                onClick={() => setQuestionIndex((i) => Math.max(0, i - 1))}
                disabled={questionIndex === 0}
                className="rounded-xl border border-border bg-surface px-4 py-3
                           text-sm text-text disabled:opacity-40"
                aria-label="Previous question"
              >
                <ChevronLeft size={16} />
              </button>
              {questionIndex < quiz.length - 1 ? (
                <BigButton
                  onClick={() => setQuestionIndex((i) => i + 1)}
                  disabled={answers[questionIndex] === null}
                >
                  <span className="inline-flex items-center gap-1.5">
                    Next question <ChevronRight size={16} />
                  </span>
                </BigButton>
              ) : (
                <BigButton
                  onClick={submitAssessment}
                  disabled={busy || answers.some((a) => a === null)}
                >
                  {busy ? "Grading…" : "Submit answers"}
                </BigButton>
              )}
            </div>
          </div>
        )}

        {stage === STAGES.SCORECARD && (
          <div className="space-y-4">
            <ScoreCard worker={worker} />
            <div className="no-print flex gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-xl border border-border bg-surface px-4 py-3
                           text-sm text-text inline-flex items-center gap-1.5"
              >
                <Printer size={16} /> Save
              </button>
              {!worker.assessment.passed && (
                <BigButton onClick={startQuiz}>
                  <span className="inline-flex items-center gap-1.5">
                    <RotateCcw size={16} /> Retake assessment
                  </span>
                </BigButton>
              )}
            </div>
            <button
              type="button"
              onClick={() => setStage(STAGES.CERTIFICATE)}
              className="no-print w-full text-center text-xs text-text-secondary underline
                         underline-offset-4"
            >
              View my certificate
            </button>
          </div>
        )}

        {error && worker && (
          <p
            role="alert"
            className="no-print text-xs text-danger bg-danger-soft rounded-lg px-3 py-2"
          >
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
