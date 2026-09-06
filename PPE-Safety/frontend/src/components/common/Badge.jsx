const VARIANTS = {
  success: "bg-success-soft text-success border-success/25",
  warning: "bg-warning-soft text-warning border-warning/25",
  danger: "bg-danger-soft text-danger border-danger/25",
  primary: "bg-primary-soft text-primary border-primary/25",
  neutral: "bg-subtle text-text-secondary border-border",
};

/**
 * Status pill.
 *
 * The dot is decorative, so colour is never the only carrier of meaning — the
 * label always says what the state is. Set `dot={false}` for pills that read
 * as labels rather than states.
 */
export default function Badge({
  children,
  variant = "neutral",
  pulse = false,
  dot = true,
  className = "",
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium
        px-2.5 py-1 rounded-full border whitespace-nowrap
        ${VARIANTS[variant]} ${className}`}
    >
      {dot && (
        <span
          aria-hidden="true"
          className={`w-1.5 h-1.5 rounded-full bg-current shrink-0 ${
            pulse ? "animate-pulse-danger" : ""
          }`}
        />
      )}
      {children}
    </span>
  );
}
