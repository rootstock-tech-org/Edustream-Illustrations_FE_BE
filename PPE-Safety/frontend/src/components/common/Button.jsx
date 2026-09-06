import { Loader2 } from "lucide-react";

const VARIANTS = {
  primary:
    "bg-primary text-white border border-transparent hover:bg-primary-hover shadow-panel",
  secondary:
    "bg-surface text-text border border-border hover:bg-hover hover:border-border-strong",
  danger:
    "bg-danger text-white border border-transparent hover:brightness-95 shadow-panel",
  ghost:
    "bg-transparent text-text-secondary border border-transparent hover:bg-hover hover:text-text",
  soft:
    "bg-primary-soft text-primary border border-transparent hover:brightness-95",
};

const SIZES = {
  sm: "text-xs px-2.5 py-1.5 gap-1.5 rounded-lg",
  md: "text-sm px-3.5 py-2 gap-2 rounded-lg",
  lg: "text-sm px-5 py-2.5 gap-2 rounded-lg",
};

/**
 * Button.
 *
 * `loading` shows a spinner and disables the control, so callers don't have to
 * manage both. An icon-only button must be given `aria-label` — without a text
 * child there is nothing for a screen reader to announce.
 */
export default function Button({
  children,
  variant = "secondary",
  size = "md",
  icon: Icon,
  iconRight = false,
  loading = false,
  disabled = false,
  className = "",
  type = "button",
  ...props
}) {
  const isDisabled = disabled || loading;
  const glyph = loading ? Loader2 : Icon;

  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center font-medium
        transition-colors duration-150 select-none
        disabled:opacity-50 disabled:pointer-events-none
        ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {glyph && !iconRight && (
        <Glyph icon={glyph} spinning={loading} size={size} />
      )}
      {children}
      {glyph && iconRight && (
        <Glyph icon={glyph} spinning={loading} size={size} />
      )}
    </button>
  );
}

function Glyph({ icon: Icon, spinning, size }) {
  return (
    <Icon
      size={size === "sm" ? 14 : 16}
      className={spinning ? "animate-spin" : ""}
      aria-hidden="true"
    />
  );
}
