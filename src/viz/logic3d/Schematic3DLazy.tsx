'use client';
import dynamic from 'next/dynamic';

/**
 * Client-only lazy wrapper around the 3D schematic renderer, shared by the
 * flip-flop and MUX/DEMUX diagrams so each avoids its own dynamic() boilerplate
 * (and SSR of the WebGL canvas).
 */
export const Schematic3DLazy = dynamic(() => import('./Schematic3D').then((m) => m.Schematic3D), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-lg bg-surface-elevated" />,
});
