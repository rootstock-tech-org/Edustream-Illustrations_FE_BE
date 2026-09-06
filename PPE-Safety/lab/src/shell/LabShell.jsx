import { ScanEye } from "lucide-react";

import ThemeToggle from "./ThemeToggle.jsx";

/**
 * The frame the one screen sits in: the product's name, the one tab there
 * is, and the theme toggle.
 */
export default function LabShell({ children }) {
  return (
    <div className="relative z-10 flex min-h-screen flex-col">
      <header className="flex items-center gap-4 border-b border-line bg-panel/70 px-4 backdrop-blur">
        <div className="flex items-center gap-2.5 py-2.5 pr-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-vision-dim text-vision">
            <ScanEye size={19} />
          </div>
          <div className="min-w-0">
            <div className="truncate text-base font-semibold leading-tight text-ink">AI Safety Lab</div>
            <div className="text-[11px] text-ink-faint">Industrial Computer Vision</div>
          </div>
        </div>
        <nav className="hidden self-stretch sm:flex">
          <span className="flex items-center border-b-2 border-vision px-5 text-sm font-medium text-ink">Simulation</span>
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <span
            title="The scene is drawn. Every bar, window, floor and allowance is the deployed system's."
            className="hidden rounded-full border border-hazard/40 bg-hazard-dim px-3 py-1 text-[11px] font-medium text-hazard sm:inline-block"
          >
            Simulated floor · real thresholds
          </span>
          <ThemeToggle />
        </div>
      </header>

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
