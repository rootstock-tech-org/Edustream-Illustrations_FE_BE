import LabShell from "./shell/LabShell.jsx";
import Factory from "./pages/Factory.jsx";

/**
 * One screen. The lab is a single component — the simulation — so there is
 * no router: whatever path the backend serves it at, this is what opens.
 */
export default function App() {
  return (
    <LabShell>
      <Factory />
    </LabShell>
  );
}
