/**
 * Presentation copy for Anatomy callouts and Learning-mode hover cards. This is
 * UI text, not physics — it explains what each region IS, DOES, and why it
 * MATTERS. Kept in the viz layer so the domain is untouched.
 */
export interface RegionInfo {
  readonly term: string;
  readonly what: string;
  readonly does: string;
  readonly why: string;
}

export const REGION_INFO: Readonly<Record<string, RegionInfo>> = {
  source: {
    term: 'Source',
    what: 'A heavily-doped terminal region.',
    does: 'Supplies the carriers that flow through the channel.',
    why: 'Defines one end of the conduction path; referenced by V_GS.',
  },
  drain: {
    term: 'Drain',
    what: 'A heavily-doped terminal region opposite the source.',
    does: 'Collects the carriers that traverse the channel.',
    why: 'The drain current I_D is what the circuit uses.',
  },
  gate: {
    term: 'Gate',
    what: 'A conductive electrode over the channel.',
    does: 'Its voltage controls whether the channel forms.',
    why: 'The gate is how a transistor switches — the heart of the device.',
  },
  oxide: {
    term: 'Gate Oxide',
    what: 'A very thin insulating layer (SiO₂) under the gate.',
    does: 'Electrically isolates the gate from the substrate.',
    why: 'Its thinness sets gate control (C_ox ∝ 1/T_ox) — thinner = stronger.',
  },
  channel: {
    term: 'Channel',
    what: 'The inversion layer beneath the oxide.',
    does: 'Forms a conductive bridge from source to drain when V_GS > V_th.',
    why: 'No channel, no conduction — this is switching itself.',
  },
  substrate: {
    term: 'Substrate / Body',
    what: 'The bulk silicon the device is built in.',
    does: 'Hosts the channel and sets the body reference.',
    why: 'Doping here shifts the threshold via the body effect.',
  },
};

export const ANATOMY_NODES = ['source', 'drain', 'gate', 'oxide', 'channel', 'substrate'] as const;
