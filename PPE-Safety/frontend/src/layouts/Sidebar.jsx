import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { ChevronLeft, ChevronRight, ClipboardCheck, FileText, FlaskConical, GraduationCap, Info, LayoutDashboard, ListChecks, TriangleAlert, UserPlus, Video, X } from "lucide-react";

import { useModules } from "../modules/useModules";
import { useDrawerWidth } from "../hooks/useDrawerWidth";

/**
 * Primary navigation.
 *
 * The monitoring section is generated from the module registry, so adding a
 * capability puts it in the sidebar automatically. Modules the backend does
 * not serve, or whose page is not built, still appear — dimmed and marked —
 * so the operator can see the whole product rather than wondering what is
 * missing.
 *
 * ## Two shapes, one list
 *
 * On a desk it is a column beside the page, 252px wide or 76px collapsed by
 * hand. On a phone it is a drawer over the page, opened from the top bar and
 * out of the flow when shut — because 252px of a 390px screen left the
 * dashboard about 140px to say anything in, which measured as one word per
 * line and, on three pages, text and controls simply running off the edge
 * with no scrollbar to say so.
 *
 * The breakpoint is `md` (768px), matched in JS as well as in CSS: the drawer
 * needs a close button and a scrim, which are the wrong controls entirely on
 * a desk. Above it nothing about this component changes.
 */

const TOP = [{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard }];

const BOTTOM = [
  { to: "/events", label: "Safety Events", icon: TriangleAlert },
  { to: "/cameras", label: "Cameras", icon: Video },
  { to: "/reports", label: "Reports", icon: FileText },
  { to: "/about", label: "About", icon: Info },
];

// Onboarding, not monitoring: registering a worker and reading the
// training catalog are desk jobs, so they sit in their own section rather
// than among the cameras. The Lab leads the section — it is where somebody
// learns what the monitoring pages are doing before they are asked to act
// on one, and it is the only page here that touches no real camera, worker
// or event.
const TRAINING = [
  { to: "/lab", label: "Lab", icon: FlaskConical },
  { to: "/registration", label: "Registration", icon: UserPlus },
  { to: "/programs", label: "Programs", icon: GraduationCap },
  { to: "/assessment", label: "Assessment", icon: ClipboardCheck },
  { to: "/status", label: "Status", icon: ListChecks },
];

export default function Sidebar({ open = false, onClose }) {
  const [collapsed, setCollapsed] = useState(false);
  const { modules } = useModules();
  const drawer = useDrawerWidth();
  const closeRef = useRef(null);

  // Collapsing to icons is a desk affordance. In a drawer the labels are the
  // whole point — there is nothing to save room for once it is over the page.
  const compact = collapsed && !drawer;

  useEffect(() => {
    if (!drawer || !open) return undefined;

    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };

    // Focus follows the drawer, so a keyboard reaches the menu it just
    // opened and Escape lands somewhere sensible.
    closeRef.current?.focus();
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawer, open, onClose]);

  return (
    <aside
      // `fixed` only below md, so the drawer is out of the flow and the page
      // gets the whole screen. `invisible` rather than only translated: an
      // off-canvas menu must not be reachable by Tab either.
      className={`h-screen glass !border-0 !border-r !border-solid !shadow-none flex flex-col
                  transition-[width,transform] duration-200 shrink-0
                  max-md:!fixed max-md:inset-y-0 max-md:left-0 max-md:z-50
                  max-md:shadow-overlay ${
                    compact ? "w-[76px]" : "w-[252px]"
                  } ${
                    drawer && !open
                      ? "max-md:-translate-x-full max-md:invisible"
                      : "max-md:translate-x-0 max-md:visible"
                  }`}
      aria-hidden={drawer && !open ? "true" : undefined}
    >
      <div className="flex items-center justify-between h-16 px-4 border-b border-border shrink-0">
        {!compact && (
          <div className="flex items-center gap-2.5 min-w-0">
            {/* The company logo, exactly as supplied. Served from /brand
                so the artwork can be replaced without touching code. */}
            <img
              src="/brand/rootstock-logo.jpg"
              alt="Rootstock Technology"
              className="h-10 w-auto shrink-0"
            />
            {/* Wraps rather than truncates: the name is two words too long
                for one line beside the logo, and "Visual Analysis ..." is
                nobody's product. */}
            <span className="text-sm font-bold tracking-tight text-text leading-tight">
              Visual Analysis Dashboard
            </span>
          </div>
        )}

        <button
          ref={closeRef}
          onClick={() => (drawer ? onClose?.() : setCollapsed((v) => !v))}
          className="text-text-muted hover:text-text p-1.5 rounded-lg hover:bg-hover shrink-0"
          aria-label={
            drawer ? "Close menu" : compact ? "Expand menu" : "Collapse menu"
          }
        >
          {drawer ? (
            <X size={16} />
          ) : compact ? (
            <ChevronRight size={16} />
          ) : (
            <ChevronLeft size={16} />
          )}
        </button>
      </div>

      <nav className="flex-1 py-3 px-3 overflow-y-auto space-y-1">
        {TOP.map((item) => (
          <NavItem key={item.to} {...item} collapsed={compact} onNavigate={onClose} />
        ))}

        <SectionLabel collapsed={compact}>Monitoring</SectionLabel>

        {modules.map(({ id, path, label, icon, available }) => (
          <NavItem
            key={id}
            to={path}
            label={label}
            icon={icon}
            collapsed={compact}
            muted={!available}
            onNavigate={onClose}
          />
        ))}

        <SectionLabel collapsed={compact}>Records</SectionLabel>

        {BOTTOM.map((item) => (
          <NavItem key={item.to} {...item} collapsed={compact} onNavigate={onClose} />
        ))}

        <SectionLabel collapsed={compact}>Training</SectionLabel>

        {TRAINING.map((item) => (
          <NavItem key={item.to} {...item} collapsed={compact} onNavigate={onClose} />
        ))}
      </nav>

      <div className="border-t border-border p-3 shrink-0">
        <div className="flex items-center gap-2.5 px-1 py-1.5 rounded-lg hover:bg-hover cursor-pointer">
          <span className="w-8 h-8 rounded-full bg-primary-soft text-primary flex items-center justify-center text-xs font-semibold shrink-0">
            P
          </span>
          {!compact && (
            <div className="leading-tight min-w-0">
              <p className="text-xs font-medium text-text truncate">Operator</p>
              <p className="text-[11px] text-text-muted truncate">
                Control Room 1
              </p>
            </div>
          )}
        </div>

      </div>
    </aside>
  );
}

function SectionLabel({ children, collapsed }) {
  if (collapsed) {
    return <div className="h-px bg-border my-3 mx-2" role="presentation" />;
  }

  return (
    <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted px-3 pt-4 pb-1.5">
      {children}
    </p>
  );
}

function NavItem({ to, label, icon: Icon, collapsed, muted = false, onNavigate }) {
  return (
    <NavLink
      to={to}
      title={collapsed ? label : undefined}
      // A drawer that stays open over the page it just navigated to is a
      // drawer the operator has to dismiss by hand every time.
      onClick={onNavigate}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
          isActive
            ? "bg-primary-soft text-primary font-medium"
            : muted
              ? "text-text-muted hover:bg-hover"
              : "text-text-secondary hover:text-text hover:bg-hover"
        }`
      }
    >
      <Icon size={18} className="shrink-0" aria-hidden="true" />
      {!collapsed && <span className="truncate">{label}</span>}
      {!collapsed && muted && (
        <span className="ml-auto text-[10px] text-text-muted shrink-0">
          soon
        </span>
      )}
    </NavLink>
  );
}
