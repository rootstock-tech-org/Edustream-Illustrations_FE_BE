"use client";

import { useState } from "react";
import ThumbTile from "./ThumbTile";

// Shows a topical photo from /api/thumb; if it fails or none is found, falls
// back to the branded gradient tile so a card is never empty.
export default function ThumbImage({
  q,
  seed,
  label,
  className = "",
}: {
  q: string;
  seed: string;
  label: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed || !q.trim()) {
    return <ThumbTile seed={seed} label={label} className={className} />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/thumb?q=${encodeURIComponent(q)}`}
      alt={label}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`object-cover ${className}`}
    />
  );
}
