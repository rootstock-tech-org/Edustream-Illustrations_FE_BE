import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";

import Navbar from "./Navbar";
import Sidebar from "./Sidebar";
import { getModuleByPath } from "../modules/registry";
import { useSystemHealth } from "../hooks/useSystemHealth";

/** Titles for the fixed pages. Module titles come from the registry. */
const TITLES = {
  "/dashboard": "Dashboard",
  "/events": "Safety Events",
  "/cameras": "Cameras",
  "/reports": "Reports",
  "/registration": "Registration",
  "/programs": "Programs",
  "/assessment": "Assessment",
  "/status": "Status",
  "/settings": "Settings",
  "/about": "About",
};

/**
 * The frame every screen sits in.
 *
 * The navbar's two status pills used to be fed by a `systemStatus` prop that
 * nothing ever passed, so they showed the same two values on every page
 * forever. They now come from the measured state, which is polled once for
 * the whole app rather than per page.
 *
 * Below the phone breakpoint the sidebar leaves the flow and becomes a drawer
 * over the page. Whether it is open lives here rather than in the sidebar,
 * because the control that opens it is in the top bar and the scrim that
 * closes it is neither.
 */
export default function MainLayout() {
  const { pathname } = useLocation();
  const health = useSystemHealth();

  const [menuOpen, setMenuOpen] = useState(false);

  // Arriving somewhere new is the end of using the menu — including a
  // navigation the drawer did not start, like a link inside a page or the
  // browser's Back. Adjusted during render rather than in an effect: React
  // restarts the render with the new value before anything is painted, where
  // an effect would paint the drawer over the page it has just left.
  const [menuPath, setMenuPath] = useState(pathname);
  if (menuPath !== pathname) {
    setMenuPath(pathname);
    setMenuOpen(false);
  }

  const title =
    TITLES[pathname] ?? getModuleByPath(pathname)?.label ?? "Visual Analysis Dashboard";

  // No background of its own, deliberately. The page's light lives on `body`,
  // and a solid sheet here painted straight over it — which is why the frosted
  // panels first read as flat white cards.
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />

      {/* The scrim. Rendered only while the drawer is open, and only ever
          below `md` — it is what makes the page behind read as out of reach,
          and it is the second way out of the menu after Escape. */}
      {menuOpen && (
        <button
          type="button"
          className="md:hidden fixed inset-0 z-40 bg-text/25 cursor-default"
          aria-label="Close menu"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <Navbar
          pageTitle={title}
          system={health.system}
          camera={health.camera}
          onOpenMenu={() => setMenuOpen(true)}
        />

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
