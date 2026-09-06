/**
 * Card container. The base surface for everything on a page.
 */
export default function Panel({
  title,
  subtitle,
  action,
  icon: Icon,
  children,
  className = "",
  noPadding = false,
  as: Tag = "section",
}) {
  const labelled = Boolean(title);

  return (
    <Tag
      className={`glass rounded-xl flex flex-col ${className}`}
      aria-label={labelled ? title : undefined}
    >
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2.5 min-w-0">
            {Icon && (
              <span className="shrink-0 text-text-muted" aria-hidden="true">
                <Icon size={16} />
              </span>
            )}
            <div className="min-w-0">
              {title && (
                <h3 className="text-sm font-semibold text-text truncate">
                  {title}
                </h3>
              )}
              {subtitle && (
                /* One line on a desk, where there is room for one. On a phone
                   a subtitle cut at "The AI learns their face from the pho…"
                   has lost the half that says what to do, so it wraps
                   instead — the panel grows by a line and keeps its
                   sentence. */
                <p className="text-xs text-text-secondary truncate max-sm:whitespace-normal mt-0.5">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}

      <div className={noPadding ? "flex-1 min-h-0" : "flex-1 min-h-0 p-5"}>
        {children}
      </div>
    </Tag>
  );
}
