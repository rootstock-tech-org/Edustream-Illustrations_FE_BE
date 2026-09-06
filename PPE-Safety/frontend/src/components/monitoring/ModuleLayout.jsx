import Badge from "../common/Badge";
import { UNVERIFIED_LABEL } from "./legibility";

/**
 * Page shell shared by every monitoring module.
 *
 * Gives all module pages one identical frame — title, live state, then a
 * two-column body with the camera on the left and results on the right — so
 * an operator who learns one page has learned all of them. A module supplies
 * only its own content; nothing about the arrangement is per-module.
 *
 * Layout collapses to a single column below `lg`, camera first.
 *
 * Usage:
 *
 *   <ModuleLayout
 *     title="Restricted Zone"
 *     description="Alerts when someone enters a marked no-entry area."
 *     watching={isStreaming}
 *     feed={<LiveFeed … />}
 *     side={<CameraInputCard … />}
 *   >
 *     <DetectionSummary … />
 *   </ModuleLayout>
 */
export default function ModuleLayout({
  title,
  description,
  icon: Icon,
  watching = false,
  alert = false,
  /**
   * The picture could not be judged. Sits between "Action required" and
   * "Watching": a module that cannot see is not watching in any sense the
   * operator means by the word, and a green Watching badge over an
   * unreadable camera is the defect this phase exists to remove.
   */
  unverified = false,
  actions,
  feed,
  side,
  children,
}) {
  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-[1600px] mx-auto animate-fade-in">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          {Icon && (
            <span
              className="shrink-0 w-10 h-10 rounded-xl bg-primary-soft text-primary
                         flex items-center justify-center mt-0.5"
              aria-hidden="true"
            >
              <Icon size={20} />
            </span>
          )}

          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-semibold text-text tracking-tight">
                {title}
              </h1>

              {alert ? (
                <Badge variant="danger" pulse>
                  Action required
                </Badge>
              ) : unverified ? (
                <Badge variant="warning">{UNVERIFIED_LABEL}</Badge>
              ) : watching ? (
                <Badge variant="success">Watching</Badge>
              ) : (
                <Badge variant="neutral">Not watching</Badge>
              )}
            </div>

            {description && (
              <p className="text-sm text-text-secondary mt-1 max-w-2xl">
                {description}
              </p>
            )}
          </div>
        </div>

        {actions && (
          <div className="flex items-center gap-2 shrink-0">{actions}</div>
        )}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-5 items-start">
        <div className="space-y-5 min-w-0">
          {feed}
          {children}
        </div>

        {side && <aside className="space-y-5 min-w-0">{side}</aside>}
      </div>
    </div>
  );
}
