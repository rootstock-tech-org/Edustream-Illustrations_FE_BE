import { useParams } from "react-router-dom";
import { Clock } from "lucide-react";

import Panel from "../../components/common/Panel";
import { EmptyState } from "../../components/common/States";
import ModuleLayout from "../../components/monitoring/ModuleLayout";
import { getModule } from "../../modules/registry";

/**
 * Placeholder for a declared module whose page is not built yet.
 *
 * Routed to automatically for any registry entry without a `page`, so the
 * navigation never leads somewhere broken and the product's full shape stays
 * visible while modules are still being built.
 */
export default function ComingSoon({ moduleId }) {
  // Registry routes pass the id as a prop because they are declared with
  // explicit paths and carry no route params. The catch-all
  // /monitoring/:moduleId route supplies it the other way.
  const params = useParams();
  const module = getModule(moduleId ?? params.moduleId);

  const Icon = module?.icon ?? Clock;

  return (
    <ModuleLayout
      title={module?.label ?? "Monitoring"}
      description={module?.description}
      icon={Icon}
      watching={false}
    >
      <Panel>
        <EmptyState
          icon={Clock}
          title="Not available yet"
          description={
            module?.plannedNote ??
            "This monitoring page is still being built. It will work exactly like the Restricted Zone page — pick a camera, then watch."
          }
        />
      </Panel>
    </ModuleLayout>
  );
}
