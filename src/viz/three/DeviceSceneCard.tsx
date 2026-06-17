'use client';
import dynamic from 'next/dynamic';
import { useSimulation } from '@/ui/hooks/useSimulation';
import { useDevice } from '@/ui/hooks/useDevice';
import { useVizStore } from '@/state/viz.store';
import {
  voltageToIntensity,
  currentToActivity,
  channelDensity,
  fieldStrength,
  leakageVisibility,
  heatLevel,
  regionColorToken,
} from '@/viz/mappers/encoding';
import { deviceGeometry } from './geometry';
import { color } from './palette';
import type { SceneData, TransistorVisual } from './scene.types';
import type { TransistorState } from '@/domain/simulation/result.types';

const DeviceScene = dynamic(() => import('./DeviceScene').then((m) => m.DeviceScene), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-xl bg-surface-elevated" />,
});

const num = (v: number | string | undefined) => (v == null ? 0 : typeof v === 'number' ? v : Number(v));

/**
 * Maps the simulation result into the Probe Station's SceneData. All
 * physics→visual encoding happens here via the viz mappers; the 3D scene
 * receives only ready-to-draw values.
 */
export function DeviceSceneCard() {
  const { result } = useSimulation();
  const { values } = useDevice();
  const reducedMotion = useVizStore((s) => s.reducedMotion);

  if (!result) return <div className="h-full min-h-[20rem] w-full animate-pulse rounded-xl bg-surface-elevated" />;

  const vdd = num(values.VDD);
  const op = result.operatingPoint;

  const aggregate = (type: TransistorState['type']): TransistorVisual => {
    const set = op.transistors.filter((t) => t.type === type);
    const lead = set.reduce<TransistorState | null>(
      (best, t) => (!best || currentToActivity(t.current.value) > currentToActivity(best.current.value) ? t : best),
      null,
    );
    const activity = set.reduce((m, t) => Math.max(m, currentToActivity(t.current.value)), 0);
    const density = lead ? channelDensity(lead.region, lead.overdrive.value, activity) : 0;
    const region = lead?.region ?? 'cutoff';
    return {
      id: lead?.id ?? type,
      type,
      region,
      activity,
      channelDensity: density,
      // tint = carrier colour (electrons cool-cyan / holes warm-amber) — used by
      // the channel band and carrier particles. Region polarity is read from the
      // distinct implant materials in the device itself.
      tint: color(type === 'nmos' ? 'electron' : 'hole'),
      regionAccent: color(regionColorToken(region)),
    };
  };

  const data: SceneData = {
    geometry: deviceGeometry(num(values.W), num(values.L), num(values.Tox)),
    heat: heatLevel(num(values.T)),
    voutIntensity: voltageToIntensity(op.outputVoltage.quantity.value, vdd),
    fieldStrength: fieldStrength(vdd),
    leakageVisibility: leakageVisibility(result.metrics.leakage.quantity.value),
    pullUp: aggregate('pmos'),
    pullDown: aggregate('nmos'),
    reducedMotion,
  };

  return (
    <div
      className="relative h-full min-h-[20rem] w-full overflow-hidden rounded-xl ring-1 ring-white/5"
      role="img"
      aria-label={`3D device stage. Output ${data.voutIntensity > 0.5 ? 'high' : 'low'}; pull-up ${data.pullUp.region}, pull-down ${data.pullDown.region}.`}
    >
      <DeviceScene data={data} />
    </div>
  );
}
