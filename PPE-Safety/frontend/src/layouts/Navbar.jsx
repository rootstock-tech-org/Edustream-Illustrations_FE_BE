import { useEffect, useState } from "react";
import { Bell, Menu, Moon, Sun, Video, Wifi } from "lucide-react";

import { NOT_WORKING, WORKING } from "../hooks/useSystemHealth";
import { applyTheme, flipTheme, loadTheme, saveTheme } from "../state/theme.js";

/**
 * Top bar: where you are, what time it is, and whether the system is working.
 *
 * The status pills deliberately say "System" and "Camera" rather than naming
 * services or models — an operator needs to know whether monitoring is working,
 * not which process is running.
 *
 * Neither pill has a default. They used to — `backendOnline = true` and
 * `cameraOnline = false` — and because nothing ever passed the props, those
 * defaults were the only thing this bar ever showed: green through a total
 * outage, grey over a live picture. An unwired status prop must break loudly
 * rather than read as "working", so the states are required and the only
 * value that means anything is a measured one.
 */
export default function Navbar({ pageTitle, system, camera, onOpenMenu }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="h-16 glass !border-0 !border-b !border-solid !shadow-none sticky top-0 z-30 flex items-center justify-between gap-3 px-4 md:px-6 shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        {/* The only way back to the navigation once the sidebar has become a
            drawer, so it exists exactly where the drawer does and nowhere
            else. */}
        <button
          type="button"
          onClick={onOpenMenu}
          className="md:hidden -ml-1.5 text-text-secondary hover:text-text p-1.5 rounded-lg hover:bg-hover shrink-0"
          aria-label="Open menu"
        >
          <Menu size={20} aria-hidden="true" />
        </button>

        <h1 className="text-base font-semibold text-text truncate">
          {pageTitle}
        </h1>
      </div>

      <div className="flex items-center gap-4 sm:gap-5 shrink-0">
        <span className="hidden sm:block text-xs text-text-muted tabular-nums">
          {now.toLocaleDateString()} · {now.toLocaleTimeString()}
        </span>

        <div className="flex items-center gap-3 sm:gap-4 sm:border-l border-border sm:pl-5">
          <StatusPill
            icon={Wifi}
            label="System"
            state={system}
            okText="working"
            badText="not responding"
            tone="danger"
          />
          {/* A camera that is off is an ordinary state — somebody has not
              started one yet — so it is grey rather than red. A system that
              is not responding is a fault. */}
          <StatusPill
            icon={Video}
            label="Camera"
            state={camera}
            okText="connected"
            badText="not connected"
          />
        </div>

        {/* Both go on a phone, and neither costs the operator anything: the
            bell is not wired to anything yet, and the avatar is the same
            initial the drawer's own footer carries. What they were costing
            was the page title, squeezed to two letters and an ellipsis. */}
        <ThemeToggle />

        <button
          className="hidden sm:block relative text-text-secondary hover:text-text p-1.5 rounded-lg hover:bg-hover"
          aria-label="Notifications"
        >
          <Bell size={18} aria-hidden="true" />
        </button>

        <span className="hidden sm:flex w-8 h-8 rounded-full bg-primary-soft text-primary items-center justify-center text-xs font-semibold">
          P
        </span>
      </div>
    </header>
  );
}

/**
 * One pill, in one of three states.
 *
 * The third state is the point of it: until a check has come back nothing is
 * known, and the dot is hollow rather than filled — an outline reads as "no
 * answer yet" where any solid colour reads as an answer. Screen readers are
 * told the same thing in words, because a colour an operator cannot see is
 * not a status they have been given.
 */
function StatusPill({ icon: Icon, label, state, okText, badText, tone }) {
  const ok = state === WORKING;
  const bad = state === NOT_WORKING;
  // Everything else is unknown — UNKNOWN itself, and equally a prop nobody
  // wired up, which is how this bar lied for as long as it did.
  const unknown = !ok && !bad;

  const colour = ok
    ? "text-success"
    : bad && tone === "danger"
      ? "text-danger"
      : "text-text-muted";

  return (
    <span
      className="flex items-center gap-1.5 text-xs text-text-secondary"
      title={`${label}: ${ok ? okText : bad ? badText : "checking"}`}
    >
      <Icon
        size={14}
        className={`${colour} ${unknown ? "opacity-50" : ""}`}
        aria-hidden="true"
      />
      {/* On a phone the icon and the dot carry the state and the word goes —
          the width it costs is the difference between "Workstation Absence"
          in the title and "Workstation Absen…". aria-hidden because the
          sentence below already names the pill, at every size, exactly
          once. */}
      <span className="hidden sm:inline" aria-hidden="true">{label}</span>
      <span className="sr-only">
        {`${label}: ${ok ? okText : bad ? badText : "not checked yet"}`}
      </span>
      <span
        aria-hidden="true"
        className={`w-1.5 h-1.5 rounded-full ${
          unknown
            ? "border border-text-muted animate-pulse"
            : ok
              ? "bg-success"
              : tone === "danger"
                ? "bg-danger"
                : "bg-text-muted"
        }`}
      />
    </span>
  );
}

/**
 * Light or dark, for the whole dashboard.
 *
 * The icon shows where the control goes rather than where it is — a moon to
 * turn the lights off, a sun to turn them back on — and the label says it in
 * words, because an icon-only control that toggles something invisible to a
 * screen reader is a control only some operators have.
 *
 * The document may already be dark before React runs: a small script in
 * index.html applies the stored choice before first paint, so the page never
 * flashes white on its way to dark. This reads that same store, so the two
 * can only ever agree.
 */
function ThemeToggle() {
  const [theme, setTheme] = useState(loadTheme);

  useEffect(() => {
    applyTheme(theme);
    saveTheme(theme);
  }, [theme]);

  const next = flipTheme(theme);
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className="relative text-text-secondary hover:text-text p-1.5 rounded-lg hover:bg-hover"
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
    >
      {theme === "dark" ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
    </button>
  );
}
