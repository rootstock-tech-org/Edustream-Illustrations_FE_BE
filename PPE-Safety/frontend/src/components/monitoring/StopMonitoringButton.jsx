import { useState } from "react";
import { Square } from "lucide-react";

import Button from "../common/Button";

/**
 * The one button that stops everything on a monitoring page.
 *
 * Stopping used to live inside the camera card and follow the selected
 * source: with the wrong tile picked, the button to stop what was actually
 * running was not on the screen. An operator wanting monitoring off should
 * not have to remember which input it came from — this sits in the page
 * header, in the same place on every page, and halts whatever is watching.
 *
 * Rendered only while something is; a stop button over a stopped page is
 * noise.
 */
export default function StopMonitoringButton({ watching, onStop }) {
  const [stopping, setStopping] = useState(false);

  if (!watching) return null;

  return (
    <Button
      variant="danger"
      icon={Square}
      loading={stopping}
      onClick={async () => {
        setStopping(true);
        try {
          await onStop();
        } finally {
          setStopping(false);
        }
      }}
    >
      Stop monitoring
    </Button>
  );
}
