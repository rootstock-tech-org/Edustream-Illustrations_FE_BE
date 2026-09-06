import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import MainLayout from "./layouts/MainLayout";
import About from "./pages/About";
import Assessment from "./pages/Assessment";
import Dashboard from "./pages/Dashboard";
import Events from "./pages/Events";
import Cameras from "./pages/Cameras";
import Lab from "./pages/Lab";
import NotFound from "./pages/NotFound";
import Programs from "./pages/Programs";
import Registration from "./pages/Registration";
import Reports from "./pages/Reports";
import Status from "./pages/Status";
import WorkerPortal from "./pages/WorkerPortal";
import ComingSoon from "./pages/monitoring/ComingSoon";
import { MODULES } from "./modules/registry";
import { SystemHealthProvider } from "./context/SystemHealth";
import "./index.css";

/**
 * Routes.
 *
 * Monitoring routes are generated from the module registry, so a new
 * capability needs no change here. A module without a page routes to the
 * placeholder rather than a blank screen.
 *
 * Whether the system is reachable and whether a camera is feeding it are
 * measured once, above the router, because the navbar states both on every
 * screen and any page is free to read the same answer rather than take its
 * own and disagree.
 */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* The worker's own page, on the worker's own phone. Outside the
            dashboard shell on purpose: no sidebar, no navbar, and no
            SystemHealthProvider — a worker reading their induction has no
            business polling the control room's health endpoint. */}
        <Route path="/worker/:token" element={<WorkerPortal />} />

        <Route
          element={
            <SystemHealthProvider>
              <MainLayout />
            </SystemHealthProvider>
          }
        >
            <Route index element={<Navigate to="/dashboard" replace />} />

            <Route path="/dashboard" element={<Dashboard />} />

            {/* Generated from the registry — see modules/registry.js */}
            {MODULES.map(({ id, path, page: Page }) => (
              <Route
                key={id}
                path={path}
                element={Page ? <Page /> : <ComingSoon moduleId={id} />}
              />
            ))}

            {/* Placeholder route so ComingSoon can read the module id when a
                module is reached by id rather than its declared path. */}
            <Route path="/monitoring/:moduleId" element={<ComingSoon />} />

            <Route path="/events" element={<Events />} />
            <Route path="/cameras" element={<Cameras />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/lab" element={<Lab />} />
            <Route path="/registration" element={<Registration />} />
            <Route path="/programs" element={<Programs />} />
            <Route path="/assessment" element={<Assessment />} />
            <Route path="/status" element={<Status />} />
            {/* Settings had a page of dead controls — toggles wired to
                nothing, a Save that saved nothing. Gone until there are real
                settings to set; redirected in case it is bookmarked. */}
            <Route path="/settings" element={<Navigate to="/dashboard" replace />} />
            <Route path="/about" element={<About />} />

            {/* The original /camera and /zones screens are gone: camera setup
                and zone drawing now live on the monitoring page they belong to.
                Redirected rather than 404'd, in case either is bookmarked. */}
            <Route
              path="/camera"
              element={<Navigate to="/monitoring/restricted-zone" replace />}
            />
            <Route
              path="/zones"
              element={<Navigate to="/monitoring/restricted-zone" replace />}
            />

            <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
