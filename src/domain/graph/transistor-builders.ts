import type { TransistorResult } from '@/domain/simulation/transistor/transistor.types';
import type { GraphSpec } from './graph.spec';

/**
 * Pure transforms from a TransistorResult into GraphSpecs — the two canonical
 * MOSFET characteristics taught in every device course:
 *   • output family   I_D vs V_DS, one curve per V_GS (cutoff → triode → sat)
 *   • transfer curve  I_D vs V_GS at the operating V_DS (threshold turn-on)
 * For PMOS these are source-referenced magnitudes (|V|, |I|).
 */

const colorFor = (type: TransistorResult['type']) => (type === 'pmos' ? 'pmos' : 'nmos');

/** Output characteristics: the I_D–V_DS family, fanned by stroke opacity. */
export function outputCharacteristics(result: TransistorResult): GraphSpec {
  const mag = result.type === 'pmos';
  const n = result.idVds.length;
  return {
    id: 'id-vds',
    title: mag ? 'Output Characteristics |I_D| vs |V_DS|' : 'Output Characteristics I_D vs V_DS',
    x: { label: mag ? '|V_DS| (V)' : 'V_DS (V)', unit: 'V' },
    y: { label: mag ? '|I_D| (A)' : 'I_D (A)', unit: 'A' },
    series: result.idVds.map((c, i) => ({
      id: c.id,
      label: c.label,
      points: c.points.map((p) => ({ x: p.x, y: p.y })),
      colorToken: colorFor(result.type),
      opacity: 0.4 + (0.6 * i) / Math.max(1, n - 1),
    })),
  };
}

/** Transfer characteristic: I_D–V_GS at the operating V_DS, with V_th marked. */
export function transferCharacteristic(result: TransistorResult): GraphSpec {
  const mag = result.type === 'pmos';
  const vth = result.operatingPoint.threshold.quantity.value;
  return {
    id: 'id-vgs',
    title: mag ? 'Transfer Characteristic |I_D| vs |V_GS|' : 'Transfer Characteristic I_D vs V_GS',
    x: { label: mag ? '|V_GS| (V)' : 'V_GS (V)', unit: 'V' },
    y: { label: mag ? '|I_D| (A)' : 'I_D (A)', unit: 'A' },
    series: [
      {
        id: 'id',
        label: result.idVgs.label,
        points: result.idVgs.points.map((p) => ({ x: p.x, y: p.y })),
        colorToken: 'accent',
      },
    ],
    annotations: [{ kind: 'vline', x: vth, label: `V_th = ${vth.toFixed(3)} V`, colorToken: 'ink-muted' }],
  };
}

export const TRANSISTOR_GRAPH_BUILDERS = [outputCharacteristics, transferCharacteristic] as const;
