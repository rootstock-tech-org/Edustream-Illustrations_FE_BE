'use client';
import dynamic from 'next/dynamic';
import { useGateResult } from '@/ui/hooks/useSimulation';
import { useDevice } from '@/ui/hooks/useDevice';
import { useVizStore } from '@/state/viz.store';
import { currentToActivity, channelDensity, regionColorToken } from '@/viz/mappers/encoding';
import { color } from './palette';
import { finalStageOutput } from '@/domain/devices/gate-cascade';
import type { GateSceneData } from './GateScene';
import type { TransistorVisual } from './scene.types';
import type { TransistorState } from '@/domain/simulation/result.types';
import type { DeviceState } from '@/domain/simulation/analytical/network-solver';

const GateScene = dynamic(() => import('./GateScene').then((m) => m.GateScene), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-xl bg-surface-elevated" />,
});

const num = (v: number | string | undefined) => (v == null ? 0 : typeof v === 'number' ? v : Number(v));

function toVisual(t: TransistorState | DeviceState): TransistorVisual {
  const activity = currentToActivity(t.current.value);
  const density = channelDensity(t.region, t.overdrive.value, activity);
  return {
    id: t.id,
    type: t.type,
    region: t.region,
    activity,
    channelDensity: density,
    tint: color(t.type === 'nmos' ? 'electron' : 'hole'),
    regionAccent: color(regionColorToken(t.region)),
  };
}

/**
 * Maps the AND/OR device's stage-1 (NAND/NOR) simulation result plus a
 * manually-solved stage-2 (inverter) into the GateScene's data shape. Stage 2
 * reuses the exact same network solver the engine uses for stage 1 — see
 * `gate-cascade.ts` — so both stages are equally physically grounded.
 */
export function GateSceneCard() {
  const result = useGateResult();
  const { device, values } = useDevice();
  const reducedMotion = useVizStore((s) => s.reducedMotion);

  const loading = <div className="h-full min-h-[20rem] w-full animate-pulse rounded-xl bg-surface-elevated" />;

  if (!result) return loading;

  const vdd = num(values.VDD);
  const op = result.operatingPoint;
  const byId = new Map(op.transistors.map((t) => [t.id, t] as const));
  // The simulation store can briefly hold the *previous* device's result for
  // one render after switching tabs (the worker recompute is async), so the
  // AND/OR-gate-specific transistor ids below may not exist yet — bail out to
  // the loading placeholder instead of crashing on a stale/mismatched result.
  const MPA = byId.get('MPA');
  const MPB = byId.get('MPB');
  const MNA = byId.get('MNA');
  const MNB = byId.get('MNB');
  if (!MPA || !MPB || !MNA || !MNB) return loading;

  const nodeVoltage = op.outputVoltage.quantity.value;
  const stage2 = finalStageOutput(nodeVoltage, values, vdd);
  const stage2ById = new Map(stage2.transistors.map((t) => [t.id, t] as const));
  const MP2 = stage2ById.get('MP');
  const MN2 = stage2ById.get('MN');
  if (!MP2 || !MN2) return loading;

  const data: GateSceneData = {
    topology: device.id === 'and2' ? 'and' : 'or',
    vdd,
    nodeVoltage,
    outputVoltage: stage2.vout,
    MPA: toVisual(MPA),
    MPB: toVisual(MPB),
    MNA: toVisual(MNA),
    MNB: toVisual(MNB),
    MP2: toVisual(MP2),
    MN2: toVisual(MN2),
    reducedMotion,
  };

  return (
    <div
      className="relative h-full min-h-[20rem] w-full overflow-hidden rounded-xl ring-1 ring-black/5 dark:ring-white/5"
      role="img"
      aria-label={`3D ${data.topology.toUpperCase()} gate stage. Final output ${data.outputVoltage > vdd / 2 ? 'high' : 'low'}.`}
    >
      <GateScene data={data} />
    </div>
  );
}
