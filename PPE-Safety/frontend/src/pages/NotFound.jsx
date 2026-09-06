import { Link } from "react-router-dom";
import { Compass } from "lucide-react";

import Button from "../components/common/Button";
import Panel from "../components/common/Panel";
import { EmptyState } from "../components/common/States";

/**
 * Catch-all for unknown routes.
 *
 * Without this, a mistyped or stale address rendered a blank screen, which
 * looks like the application has crashed.
 */
export default function NotFound() {
  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto animate-fade-in">
      <Panel>
        <EmptyState
          icon={Compass}
          title="That page doesn't exist"
          description="The address may be out of date, or the page may have moved."
          action={
            <Button variant="primary" as="span">
              <Link to="/dashboard">Go to Dashboard</Link>
            </Button>
          }
        />
      </Panel>
    </div>
  );
}
