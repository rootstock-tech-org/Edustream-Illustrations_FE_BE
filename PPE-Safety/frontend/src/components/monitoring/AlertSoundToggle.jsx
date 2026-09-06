import { Volume2, VolumeX } from "lucide-react";

/**
 * Turn the audible alert on or off.
 *
 * Sits next to the module's own controls rather than in a settings screen: an
 * operator silencing an alarm is doing it *now*, usually because they have
 * already seen the thing it is telling them about.
 *
 * Clicking while muted plays the tone once, so the operator can confirm the
 * sound works without waiting for a real alert.
 */
export default function AlertSoundToggle({ muted, setMuted, test, supported }) {
  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={() => {
        if (muted) test?.();
        setMuted(!muted);
      }}
      aria-pressed={!muted}
      title={muted ? "Alert sound is off — turn on" : "Alert sound is on — turn off"}
      className={`inline-flex items-center gap-2 text-sm font-medium px-3 py-2
        rounded-lg border transition-colors
        ${
          muted
            ? "bg-surface text-text-muted border-border hover:bg-hover"
            : "bg-surface text-text border-border hover:bg-hover"
        }`}
    >
      {muted ? (
        <VolumeX size={16} aria-hidden="true" />
      ) : (
        <Volume2 size={16} aria-hidden="true" />
      )}
      <span className="hidden sm:inline">
        {muted ? "Sound off" : "Sound on"}
      </span>
    </button>
  );
}
