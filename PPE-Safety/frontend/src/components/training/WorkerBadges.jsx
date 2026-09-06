import { useState } from "react";

import Badge from "../common/Badge";

/**
 * The two pieces every page that shows a worker shares.
 *
 * One home for them, because "Skilled" must mean the same thing wherever
 * it is printed: the backend's sixty-percent arithmetic, never a local
 * re-derivation that could drift from it.
 */

/** The worker's photo, with their initials when it cannot be loaded. */
export function WorkerAvatar({ worker, name, size = "w-12 h-12" }) {
  const [broken, setBroken] = useState(false);

  const shown = name || (worker ? `${worker.first_name} ${worker.last_name}` : "?");
  const initials = shown
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  if (!worker || broken) {
    return (
      <div
        className={`${size} rounded-xl bg-primary-soft text-primary shrink-0
                    flex items-center justify-center text-sm font-semibold`}
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      src={`/api/workers/${worker.id}/photo`}
      alt={shown}
      onError={() => setBroken(true)}
      className={`${size} rounded-xl object-cover shrink-0 border border-border`}
    />
  );
}

/** Skilled at sixty percent or better; the backend does the arithmetic. */
export function SkillBadge({ worker }) {
  if (worker?.skilled === true) {
    return (
      <Badge variant="success" dot={false}>
        Skilled
      </Badge>
    );
  }
  if (worker?.skilled === false) {
    return (
      <Badge variant="danger" dot={false}>
        Unskilled
      </Badge>
    );
  }
  return (
    <Badge variant="neutral" dot={false}>
      Not assessed yet
    </Badge>
  );
}
