import { quantity } from '@/domain/units';
import { measuredExplanation } from '@/domain/explainability/measured';
import type { StaticCmosNetlist, InputVector } from '@/domain/netlist/netlist';
import type { SimulationEngine, SimulationRequest } from '../engine.interface';
import type {
  SimulationResult,
  SweepPoint,
  TransistorState,
  ExplainedQuantity,
} from '../result.types';
import { vdd as readVdd, cload as readCload, vin as readVin } from '@/domain/devices/shared';
import {
  branchCurrent,
  solveOutputVoltage,
  collectDeviceStates,
  type SolveContext,
} from './network-solver';
import {
  propagationDelayHalf,
  averageDelay,
  dynamicPower,
  staticPower,
  totalPower,
} from './metrics.formulas';

const DEFAULT_SWEEP_POINTS = 201;

/**
 * Closed-form ("analytical") simulation engine. Drives the topology-agnostic
 * network solver and the metric formulas to produce every required output with
 * full explanations. Implements `SimulationEngine`, so a SPICE/WASM backend can
 * replace it transparently.
 */
export class AnalyticalEngine implements SimulationEngine {
  readonly id = 'analytical-mvp';

  simulate(request: SimulationRequest): SimulationResult {
    const { device, values } = request;
    const netlist = device.buildNetlist(values);
    const vdd = readVdd(values);
    const cload = readCload(values);
    const vinValue = readVin(values);
    const sweepPoints = request.options?.sweepPoints ?? DEFAULT_SWEEP_POINTS;

    const transferCurve = this.sweep(netlist, device.sweepInput, vdd, sweepPoints, netlist.inputs);
    const operatingPoint = this.operatingPoint(netlist, vinValue, vdd);
    const metrics = this.metrics(netlist, device.characteristicVectors, vdd, cload);

    return {
      deviceId: device.id,
      engineId: this.id,
      operatingPoint,
      metrics,
      transferCurve,
    };
  }

  /** Tie every input to the analog drive voltage and sweep it 0→VDD. */
  private sweep(
    netlist: StaticCmosNetlist,
    _sweepInput: string,
    vdd: number,
    points: number,
    inputs: readonly string[],
  ): { points: readonly SweepPoint[] } {
    const out: SweepPoint[] = [];
    for (let i = 0; i < points; i++) {
      const vin = (vdd * i) / (points - 1);
      const ctx = tiedContext(netlist, inputs, vin);
      const { vout, current } = solveOutputVoltage(ctx, vdd);
      out.push({ vin, vout, current });
    }
    return { points: out };
  }

  private operatingPoint(netlist: StaticCmosNetlist, vinValue: number, vdd: number) {
    const ctx = tiedContext(netlist, Object.keys(collectInputs(netlist)), vinValue);
    const { vout, current } = solveOutputVoltage(ctx, vdd);

    const states: TransistorState[] = [];
    const recovered: Parameters<typeof collectDeviceStates>[4] = [];
    collectDeviceStates(netlist.pullUp, vdd, vout, ctx, recovered);
    collectDeviceStates(netlist.pullDown, vout, 0, ctx, recovered);
    for (const s of recovered) {
      states.push({ id: s.id, type: s.type, region: s.region, current: s.current, threshold: s.threshold, overdrive: s.overdrive });
    }

    const outputVoltage = explained(
      measuredExplanation({
        value: vout,
        unit: 'V',
        conceptId: 'transfer-characteristic',
        summary: 'Output voltage where pull-up and pull-down currents balance (KCL).',
        method: 'Bisection on V_out until I_pullup = I_pulldown.',
      }),
    );
    const currentQ = explained(
      measuredExplanation({
        value: current,
        unit: 'A',
        conceptId: 'short-circuit-current',
        summary: 'Through-current at the output node at this input.',
        method: 'Branch current at the balanced operating point.',
      }),
    );

    return {
      inputVoltage: quantity(vinValue, 'V'),
      outputVoltage,
      current: currentQ,
      transistors: states,
    };
  }

  private metrics(
    netlist: StaticCmosNetlist,
    vectors: readonly InputVector[],
    vdd: number,
    cload: number,
  ) {
    // --- Leakage: worst-case static current over the characteristic vectors -
    let leak = 0;
    for (const vector of vectors) {
      const ctx = vectorContext(netlist, vector, vdd);
      leak = Math.max(leak, solveOutputVoltage(ctx, vdd).current);
    }
    const leakage = explained(
      measuredExplanation({
        value: leak,
        unit: 'A',
        conceptId: 'subthreshold-conduction',
        summary: 'Worst-case static leakage across logic input states.',
        method: 'Max through-current over characteristic input vectors.',
      }),
    );

    // --- Drive currents → propagation delay --------------------------------
    const inputs = Object.keys(collectInputs(netlist));
    const pdCtx = allHigh(netlist, inputs, vdd);
    const puCtx = allLow(netlist, inputs);
    const iOnPullDown = branchCurrent(netlist.pullDown, vdd, 0, pdCtx);
    const iOnPullUp = branchCurrent(netlist.pullUp, vdd, 0, puCtx);

    const tpHL = propagationDelayHalf({
      C_L: quantity(cload, 'F'),
      V_DD: quantity(vdd, 'V'),
      I_on: quantity(iOnPullDown, 'A'),
    });
    const tpLH = propagationDelayHalf({
      C_L: quantity(cload, 'F'),
      V_DD: quantity(vdd, 'V'),
      I_on: quantity(iOnPullUp, 'A'),
    });
    const tp = averageDelay(
      { t_pHL: tpHL.quantity, t_pLH: tpLH.quantity },
      { children: [tpHL.explanation, tpLH.explanation] },
    );

    // --- Power -------------------------------------------------------------
    const freq = tp.quantity.value > 0 ? 1 / (2 * tp.quantity.value) : 0;
    const pDyn = dynamicPower(
      { 'α': quantity(1, '1'), C_L: quantity(cload, 'F'), V_DD: quantity(vdd, 'V'), f: quantity(freq, 's') },
      { children: [tp.explanation] },
    );
    const pStat = staticPower(
      { I_leak: quantity(leak, 'A'), V_DD: quantity(vdd, 'V') },
      { children: [leakage.explanation] },
    );
    const pTotal = totalPower(
      { P_dyn: pDyn.quantity, P_stat: pStat.quantity },
      { children: [pDyn.explanation, pStat.explanation] },
    );

    return {
      staticPower: explained(pStat),
      dynamicPower: explained(pDyn),
      totalPower: explained(pTotal),
      leakage,
      propagationDelay: explained(tp),
      switchingThreshold: this.switchingThreshold(netlist, inputs, vdd),
    };
  }

  /** V_M: the input where Vout = Vin (the high-gain trip point). */
  private switchingThreshold(
    netlist: StaticCmosNetlist,
    inputs: readonly string[],
    vdd: number,
  ): ExplainedQuantity {
    let lo = 0;
    let hi = vdd;
    let vm = vdd / 2;
    for (let i = 0; i < 60; i++) {
      vm = (lo + hi) / 2;
      const ctx = tiedContext(netlist, inputs, vm);
      const { vout } = solveOutputVoltage(ctx, vdd);
      // Vout - Vin decreases through the trip point (high gain, inverting).
      if (vout > vm) lo = vm;
      else hi = vm;
    }
    return explained(
      measuredExplanation({
        value: vm,
        unit: 'V',
        conceptId: 'switching-threshold',
        summary: 'Switching threshold V_M, where V_out = V_in.',
        method: 'Bisection on V_in until V_out = V_in.',
      }),
    );
  }
}

// --- context helpers -------------------------------------------------------

function collectInputs(netlist: StaticCmosNetlist): Record<string, true> {
  const out: Record<string, true> = {};
  for (const name of netlist.inputs) out[name] = true;
  return out;
}

function tiedContext(netlist: StaticCmosNetlist, inputs: readonly string[], v: number): SolveContext {
  const gateVoltages: Record<string, number> = {};
  for (const name of inputs) gateVoltages[name] = v;
  return { netlist, gateVoltages };
}

function vectorContext(netlist: StaticCmosNetlist, vector: InputVector, vdd: number): SolveContext {
  const gateVoltages: Record<string, number> = {};
  for (const name of netlist.inputs) gateVoltages[name] = vector[name] ? vdd : 0;
  return { netlist, gateVoltages };
}

const allHigh = (netlist: StaticCmosNetlist, inputs: readonly string[], vdd: number): SolveContext =>
  tiedContext(netlist, inputs, vdd);
const allLow = (netlist: StaticCmosNetlist, inputs: readonly string[]): SolveContext =>
  tiedContext(netlist, inputs, 0);

function explained(e: { quantity: ExplainedQuantity['quantity']; explanation: ExplainedQuantity['explanation'] }): ExplainedQuantity {
  return { quantity: e.quantity, explanation: e.explanation };
}
