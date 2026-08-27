'use client';

export function FeedbackBar({
  inline = false,
  id,
}: {
  inline?: boolean;
  id?: string;
}) {
  return (
    <div
      id={id}
      className={
        inline
          ? 'flex items-center justify-center px-3 py-2 text-[11px] text-ink-muted'
          : 'fixed bottom-3 left-3 z-50 rounded-xl bg-white/90 px-3 py-2 text-[11px] text-ink-muted shadow-lg'
      }
    >
      Feedback
    </div>
  );
}