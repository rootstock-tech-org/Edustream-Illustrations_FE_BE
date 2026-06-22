'use client';
import dynamic from 'next/dynamic';
import { useTransistorResult } from '@/ui/hooks/useSimulation';
import { useDevice } from '@/ui/hooks/useDevice';
import { useVizStore } from '@/state/viz.store';
import { currentToActivity, channelDensity, heatLevel, regionColorToken } from '@/viz/mappers/encoding';
import { deviceGeometry } from './geometry';
import { color } from './palette';
import { formatLength } from './DimensionLines';
import type { TransistorVisual } from './scene.types';
import type { SingleTransistorData } from './SingleTransistorScene';

const SingleTransistorScene = dynamic(
  () => import('./SingleTransistorScene').then((m) => m.SingleTransistorScene),
  { ssr: false, loading: () => <div className="h-full w-full animate-pulse rounded-xl bg-surface-elevated" /> },
);

const num = (v: number | string | undefined) => (v == null ? 0 : typeof v === 'number' ? v : Number(v));

/**
 * Maps the single-transistor result into the scene's draw data — all the
 * physics→visual encoding (current→activity, region→channel density) flows
 * through the shared viz mappers, exactly as the inverter card does.
 */
export function SingleTransistorCard() {
  const result = useTransistorResult();
  const { values } = useDevice();
  const reducedMotion = useVizStore((s) => s.reducedMotion);

  if (!result) return <div className="h-full min-h-[20rem] w-full animate-pulse rounded-xl bg-surface-elevated" />;

  const op = result.operatingPoint;
  const activity = currentToActivity(op.drainCurrent.quantity.value);
  const visual: TransistorVisual = {
    id: result.type,
    type: result.type,
    region: op.region,
    activity,
    channelDensity: channelDensity(op.region, op.overdrive.value, activity),
    tint: color(result.type === 'nmos' ? 'electron' : 'hole'),
    regionAccent: color(regionColorToken(op.region)),
  };

  const data: SingleTransistorData = {
    geometry: deviceGeometry(num(values.W), num(values.L), num(values.Tox)),
    visual,
    heat: heatLevel(num(values.T)),
    vgs: op.vgs,
    vds: op.vds,
    lLabel: formatLength(num(values.L)),
    wLabel: formatLength(num(values.W)),
    reducedMotion,
  };

  return (
    <div
      className="relative h-full min-h-[20rem] w-full overflow-hidden rounded-xl ring-1 ring-black/5 dark:ring-white/5"
      role="img"
      aria-label={`3D ${result.type.toUpperCase()} stage. Region ${op.region}.`}
    >
      <SingleTransistorScene data={data} />
    </div>
  );
}
