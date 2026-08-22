"use client";

// Floating "Learn with Avsar" button (bottom-right, WhatsApp-style) that replaces
// the per-article "Learn this concept" chips. On a topic page it deep-links to
// that module's AVSAR lessons; elsewhere it opens the course roadmap.
// Drop the mascot art at public/avsar-bot.png; until then an inline bot icon shows.
import { useState } from "react";
import { usePathname } from "next/navigation";
import { lectureForModule, COURSE_ROADMAP } from "../../data/lectures";

export function FloatingLearnButton() {
  const pathname = usePathname();
  const [imgOk, setImgOk] = useState(true);

  const topicId = pathname?.startsWith("/topic/")
    ? decodeURIComponent(pathname.split("/")[2] || "")
    : "";
  const href = (topicId && lectureForModule(topicId)?.url) || COURSE_ROADMAP;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Learn with Avsar"
      title="Learn with Avsar"
      className="group fixed bottom-5 right-5 z-50 flex items-center gap-3 rounded-[10px] border border-[var(--border-strong)] bg-[var(--panel)]/95 py-2 pl-2 pr-4 shadow-[0_10px_30px_-12px_rgba(4,27,76,0.28)] backdrop-blur transition-colors hover:border-[var(--signal)]"
    >
      <span className="avsar-ring relative grid h-12 w-12 shrink-0 place-items-center">
        {imgOk ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src="/avsar-bot.png"
            alt=""
            width={48}
            height={48}
            className="h-12 w-12 scale-150 object-contain"
            onError={() => setImgOk(false)}
          />
        ) : (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="8" width="16" height="11" rx="3" />
            <path d="M12 8V4M9 3h6M8.5 13h.01M15.5 13h.01" />
            <path d="M9.5 16.5c.8.5 1.6.8 2.5.8s1.7-.3 2.5-.8" />
            <path d="M4 12H2m20 0h-2" />
          </svg>
        )}
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-[14px] font-bold text-[var(--text)]">
          Learn with <span className="text-[var(--accent)]">Avsar</span>
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[11px] font-medium text-[var(--indigo)]">
          AI tutor
        </span>
      </span>

      {/* Slow, gentle attention sway with a ~3s pause between rings. */}
      <style>{`
        @keyframes avsarRing {
          0%, 80%, 100% { transform: rotate(0deg); }
          85% { transform: rotate(-6deg); }
          90% { transform: rotate(5deg); }
          95% { transform: rotate(-3deg); }
        }
        .avsar-ring { animation: avsarRing 5s ease-in-out infinite; transform-origin: 50% 22%; }
        @media (prefers-reduced-motion: reduce) { .avsar-ring { animation: none; } }
      `}</style>
    </a>
  );
}
