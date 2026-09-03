"use client";

import { useState } from "react";

// Fallback chain so a card is never empty:
//   feed image  ->  /api/thumb (og:image / Openverse)  ->  /api/thumb&ph=1 (branded tile)
// If there's no feed image we start straight at the resolver.
export function ThumbImg({
  link,
  image,
  accent,
  title,
  label,
}: {
  link: string;
  image: string | null;
  accent: string;
  title: string;
  label?: string;
}) {
  const base =
    `/api/thumb?u=${encodeURIComponent(link)}` +
    `&a=${encodeURIComponent(accent)}` +
    `&t=${encodeURIComponent(title.slice(0, 120))}` +
    `&c=${encodeURIComponent(label ?? "")}`;

  const chain = image ? [image, base, `${base}&ph=1`] : [base, `${base}&ph=1`];
  const [step, setStep] = useState(0);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={chain[step]}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]"
      onError={() => setStep((s) => Math.min(s + 1, chain.length - 1))}
    />
  );
}
