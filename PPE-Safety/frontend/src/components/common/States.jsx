import { AlertCircle, Inbox, RefreshCw } from "lucide-react";

import Button from "./Button";

/**
 * Loading, empty, and error states.
 *
 * Kept together because they are three answers to the same question — "why is
 * there nothing here?" — and every data surface in the app needs all three.
 * All copy is written for a factory operator: no status codes, no jargon.
 */

/**
 * Placeholder shown while data is being fetched.
 *
 * Prefer `rows` skeletons over a spinner where the shape of the result is
 * known; it stops the layout jumping when content arrives.
 */
export function LoadingState({ label = "Loading…", rows = 0, className = "" }) {
  if (rows > 0) {
    return (
      <div
        className={`space-y-2.5 ${className}`}
        role="status"
        aria-live="polite"
      >
        <span className="sr-only">{label}</span>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="skeleton h-10 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 py-10 text-center ${className}`}
      role="status"
      aria-live="polite"
    >
      <RefreshCw
        size={20}
        className="text-text-muted animate-spin"
        aria-hidden="true"
      />
      <p className="text-sm text-text-secondary">{label}</p>
    </div>
  );
}

/**
 * Shown when a request succeeded but there is nothing to display.
 *
 * An empty safety log is good news, so the default copy is neutral rather than
 * apologetic. Pass an `action` when the operator can do something about it.
 */
export function EmptyState({
  icon: Icon = Inbox,
  title = "Nothing to show yet",
  description,
  action,
  className = "",
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 py-12 px-6 text-center ${className}`}
    >
      <span
        className="w-11 h-11 rounded-full bg-subtle border border-border
                   flex items-center justify-center text-text-muted"
        aria-hidden="true"
      >
        <Icon size={20} />
      </span>

      <div className="space-y-1 max-w-sm">
        <p className="text-sm font-medium text-text">{title}</p>
        {description && (
          <p className="text-xs text-text-secondary leading-relaxed">
            {description}
          </p>
        )}
      </div>

      {action}
    </div>
  );
}

/**
 * Shown when a request failed.
 *
 * `detail` carries the technical reason and is rendered small and secondary —
 * useful to a support call, ignorable by the operator. `onRetry` renders a
 * retry button; omit it when retrying cannot help.
 */
export function ErrorState({
  title = "Could not load this",
  detail,
  onRetry,
  className = "",
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 py-10 px-6 text-center ${className}`}
      role="alert"
    >
      <span
        className="w-11 h-11 rounded-full bg-danger-soft border border-danger/20
                   flex items-center justify-center text-danger"
        aria-hidden="true"
      >
        <AlertCircle size={20} />
      </span>

      <div className="space-y-1 max-w-sm">
        <p className="text-sm font-medium text-text">{title}</p>
        <p className="text-xs text-text-secondary leading-relaxed">
          Check that the AI system is running, then try again.
        </p>
        {detail && (
          <p className="text-[11px] text-text-muted font-mono break-words pt-1">
            {detail}
          </p>
        )}
      </div>

      {onRetry && (
        <Button size="sm" icon={RefreshCw} onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
