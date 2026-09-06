import { Info, ShieldCheck } from "lucide-react";

import Panel from "../components/common/Panel";
import { useModules } from "../modules/useModules";

/**
 * What the system does, in plain language.
 *
 * Written for a plant operator rather than an engineer: what is being watched,
 * what happens when something is spotted, and what the system deliberately
 * does not do.
 */
export default function About() {
  const { modules, reachable } = useModules();

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5 animate-fade-in">
      <header>
        <h1 className="text-xl font-semibold text-text tracking-tight">
          About this system
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Safety monitoring for the plant, using the cameras you already have.
        </p>
      </header>

      <Panel title="What it does" icon={ShieldCheck}>
        <div className="space-y-3 text-sm text-text-secondary leading-relaxed">
          <p>
            The AI watches live camera pictures and raises an alert the
            moment it sees something unsafe. Every alert is saved with a
            picture, so it can be checked afterwards rather than relying on
            someone remembering what happened.
          </p>
          <p>
            It does not stop machinery, lock doors, or take any action on its
            own. It tells a person, and the person decides what to do.
          </p>
          <p>
            It recognises by name only people an operator has explicitly
            registered on the Face Recognition page. Everyone else is
            watched for situations — someone in a marked area, missing
            safety gear — never for who they are.
          </p>
        </div>
      </Panel>

      <Panel title="What is being watched" icon={Info}>
        {!reachable ? (
          <p className="text-sm text-text-secondary">
            Cannot reach the AI system, so this list may be out of
            date.
          </p>
        ) : (
          <ul className="divide-y divide-border -my-1">
            {modules.map(({ id, label, description, icon: Icon, available }) => (
              <li key={id} className="flex items-start gap-3 py-3">
                <span
                  className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
                    available
                      ? "bg-success-soft text-success"
                      : "bg-subtle text-text-muted"
                  }`}
                  aria-hidden="true"
                >
                  <Icon size={16} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text">
                    {label}
                    {!available && (
                      <span className="text-xs font-normal text-text-muted ml-2">
                        not available yet
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-text-secondary mt-0.5">
                    {description}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel>
        <div className="flex items-center gap-4">
          <img
            src="/brand/rootstock-logo.jpg"
            alt="Rootstock Technology"
            className="h-20 w-auto shrink-0"
          />
          <p className="text-sm text-text-secondary">
            The Visual Analysis Dashboard is built by Rootstock Technology.
          </p>
        </div>
      </Panel>
    </div>
  );
}
