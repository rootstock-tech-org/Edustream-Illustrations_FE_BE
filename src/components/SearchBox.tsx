"use client";

import { useEffect, useRef, useState } from "react";

// Search input with inline ghost-text completion + a suggestions dropdown.
// Ghost/Tab/Right accepts the completion; Enter accepts the ghost first, then
// submits; arrows navigate the dropdown.
export default function SearchBox({
  value,
  onChange,
  onSubmit,
  placeholder = "Type any topic...",
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  placeholder?: string;
}) {
  const [sugs, setSugs] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const q = value.trim();
    if (!q) {
      setSugs([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/suggest?q=${encodeURIComponent(q)}`);
        const j = await r.json();
        setSugs(j.suggestions || []);
        setOpen(true);
      } catch {
        setSugs([]);
      }
    }, 160);
    return () => clearTimeout(t);
  }, [value]);

  // Top suggestion that continues what's typed -> the ghost completion.
  const top = sugs.find(
    (s) => s.toLowerCase().startsWith(value.toLowerCase()) && s.toLowerCase() !== value.toLowerCase()
  );
  const ghost = top ? top.slice(value.length) : "";

  function keyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const atEnd = e.currentTarget.selectionStart === value.length;
    // Right arrow (at the end) or Tab accepts the ghost completion.
    if (ghost && (e.key === "Tab" || (e.key === "ArrowRight" && atEnd))) {
      e.preventDefault();
      onChange(top!);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
    // Enter is left alone -> the form submits (search).
  }

  return (
    <div className="relative flex-1">
      {/* ghost overlay (aligned with the input text) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre px-4 py-3 text-base"
      >
        <span className="invisible">{value}</span>
        <span className="text-slate-400">{ghost}</span>
      </div>

      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={keyDown}
        onFocus={() => sugs.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        placeholder={placeholder}
        className="relative w-full rounded-lg border border-slate-300 bg-transparent px-4 py-3 text-base text-slate-900 outline-none focus:border-slate-900"
      />

      {open && sugs.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          {sugs.map((s) => (
            <li
              key={s}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(s);
                setOpen(false);
                onSubmit(s);
              }}
              className="cursor-pointer px-4 py-2 text-sm text-slate-800 hover:bg-slate-50"
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
