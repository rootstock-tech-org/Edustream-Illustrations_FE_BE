"use client";

// Highlights the article a "Do You Know?" ticker deep-links to. Scrolling is done
// natively by the #a-<id> hash in the URL; the ring is pure CSS via :target so a
// re-render (e.g. bookmarks loading) can't wipe it. The effect is only a fallback
// scroll for cases where the browser didn't honour the hash.
import { useEffect } from "react";

export function FocusScroller() {
  useEffect(() => {
    const id = (window.location.hash.match(/^#a-(.+)$/) || [])[1];
    if (!id) return;
    const t = window.setTimeout(() => {
      const el = document.getElementById(`a-${id}`);
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.top < 0 || r.top > window.innerHeight) el.scrollIntoView({ block: "center" });
    }, 250);
    return () => clearTimeout(t);
  }, []);

  return (
    <style>{`
      [id^="a-"] { border-radius: 1rem; }
      [id^="a-"]:target { animation: dykFocus 2.6s ease; }
      @keyframes dykFocus {
        0%, 100% { box-shadow: 0 0 0 0 rgba(79,70,229,0); }
        12%, 62% { box-shadow: 0 0 0 3px rgba(79,70,229,0.6); }
      }
    `}</style>
  );
}

