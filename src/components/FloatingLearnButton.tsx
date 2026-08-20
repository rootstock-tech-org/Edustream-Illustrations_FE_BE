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
      className="group fixed bottom-5 right-5 z-50 flex items-center gap-2.5 rounded-full bg-gradient-to-r from-indigo-600 to-blue-600 py-2 pl-2 pr-4 text-white shadow-lg shadow-indigo-600/30 ring-1 ring-white/20 transition hover:-translate-y-0.5 hover:shadow-xl"
    >
      <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full bg-white/15">
        {imgOk ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src="/avsar-bot.png"
            alt=""
            width={56}
            height={56}
            className="h-14 w-14 object-contain"
            onError={() => setImgOk(false)}
          />
        ) : (
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="8" width="16" height="11" rx="3" />
            <path d="M12 8V4M9 3h6M8.5 13h.01M15.5 13h.01" />
            <path d="M9.5 16.5c.8.5 1.6.8 2.5.8s1.7-.3 2.5-.8" />
            <path d="M4 12H2m20 0h-2" />
          </svg>
        )}
      </span>
      <span className="text-sm font-semibold leading-tight">
        Learn with <span className="font-bold">Avsar</span>
      </span>
    </a>
  );
}
