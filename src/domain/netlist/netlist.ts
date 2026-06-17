import type { MosfetParameters } from '@/domain/primitives/mosfet';

/**
 * Topology of a static complementary-CMOS gate, expressed as two switch
 * networks. Because the engine solves an ARBITRARY series/parallel network,
 * new gates (NAND, NOR, AOI, …) are added purely as data — a different tree —
 * with no engine changes. This is the extensibility contract of the platform.
 *
 *   VDD ── [ pull-up network: PMOS ] ── OUT ── [ pull-down network: NMOS ] ── GND
 */
export interface StaticCmosNetlist {
  /** Ordered input signal names, e.g. ['A', 'B']. */
  readonly inputs: readonly string[];
  /** Output node name (conventionally 'Y' or 'OUT'). */
  readonly output: string;
  /** All transistor instances by id. */
  readonly transistors: Readonly<Record<string, TransistorInstance>>;
  /** PMOS network between VDD and OUT. */
  readonly pullUp: NetworkNode;
  /** NMOS network between OUT and GND. */
  readonly pullDown: NetworkNode;
}

export interface TransistorInstance {
  readonly id: string;
  /** Full device parameters (carries `type: 'nmos' | 'pmos'`). */
  readonly params: MosfetParameters;
  /** Name of the input signal driving this transistor's gate. */
  readonly gate: string;
}

/** A series/parallel composition of transistors, or a leaf device. */
export type NetworkNode =
  | { readonly kind: 'device'; readonly deviceId: string }
  | { readonly kind: 'series'; readonly children: readonly NetworkNode[] }
  | { readonly kind: 'parallel'; readonly children: readonly NetworkNode[] };

/** A boolean assignment to each input (true = logic high = VDD). */
export type InputVector = Readonly<Record<string, boolean>>;

// --- small builder helpers (keep device files declarative) ----------------
export const device = (deviceId: string): NetworkNode => ({ kind: 'device', deviceId });
export const series = (...children: NetworkNode[]): NetworkNode => ({ kind: 'series', children });
export const parallel = (...children: NetworkNode[]): NetworkNode => ({ kind: 'parallel', children });
