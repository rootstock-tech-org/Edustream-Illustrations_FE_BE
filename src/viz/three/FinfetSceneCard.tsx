'use client';
import dynamic from 'next/dynamic';
import { useTransistorResult } from '@/ui/hooks/useSimulation';
import { useDevice } from '@/ui/hooks/useDevice';
import { useVizStore } from '@/state/viz.store';
import { currentToActivity, channelDensity, regionColorToken } from '@/viz/mappers/encoding';
import { deviceGeometry } from './geometry';
import { color } from './palette';
import type { TransistorVisual } from './scene.types';
import type { FinfetSceneData } from './FinfetScene';

const FinfetScene = dynamic(() => import('./FinfetScene').then((m) => m.FinfetScene), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-xl bg-surface-elevated" />,
});

const num = (v: number | string | undefined) => (v == null ? 0 : typeof v === 'number' ? v : Number(v));

/** Data wiring for the standalone FinFET tab — mirrors MosfetSceneCard's shape, independent file. */
export function FinfetSceneCard() {
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
    tint: color('electron'),
    regionAccent: color(regionColorToken(op.region)),
  };

  const data: FinfetSceneData = {
    geometry: deviceGeometry(num(values.W), num(values.L), num(values.Tox)),
    visual,
    lLabel: String(values.L ?? ''),
    wLabel: String(values.W ?? ''),
    reducedMotion,
  };

  return (
    <div
      className="relative h-full min-h-[20rem] w-full overflow-hidden rounded-xl ring-1 ring-black/5 dark:ring-white/5"
      role="img"
      aria-label={`3D FinFET stage. Region ${op.region}.`}
    >
      <FinfetScene data={data} />
    </div>
  );
}
