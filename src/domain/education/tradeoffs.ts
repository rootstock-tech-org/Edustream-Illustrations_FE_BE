/**
 * Curated physical mechanism + tradeoff prose, keyed by parameter and the
 * direction of change. The NARRATIVE is established device physics; which entry
 * is shown is gated by the measured direction of the user's change, and it is
 * always presented alongside the measured deltas from the engine. We never
 * invent numbers — only explain the mechanism behind the measured ones.
 */
export interface ParamNarrative {
  readonly physical: string;
  readonly tradeoff: string;
}

type Directional = { readonly increase?: ParamNarrative; readonly decrease?: ParamNarrative };

export const PARAM_NARRATIVE: Readonly<Record<string, Directional>> = {
  L: {
    decrease: {
      physical: 'Shorter channel — carriers traverse less distance under a stronger lateral field.',
      tradeoff: 'Faster with stronger drive, but leakage and short-channel effects worsen.',
    },
    increase: {
      physical: 'Longer channel — carriers travel farther under a weaker average field.',
      tradeoff: 'Lower leakage and tighter control, at the cost of drive current and speed.',
    },
  },
  W: {
    increase: {
      physical: 'Wider channel — more parallel conduction area for carriers.',
      tradeoff: 'More drive and speed, but larger area, gate capacitance, and dynamic power.',
    },
    decrease: {
      physical: 'Narrower channel — less conduction area.',
      tradeoff: 'Saves area and capacitance, but reduces drive and raises delay.',
    },
  },
  Tox: {
    decrease: {
      physical: 'Thinner oxide raises gate capacitance C_ox, tightening gate control of the channel.',
      tradeoff: 'Stronger drive and steeper switching, but more gate leakage and reliability stress.',
    },
    increase: {
      physical: 'Thicker oxide lowers C_ox, loosening the gate’s grip on the channel.',
      tradeoff: 'Lower gate leakage, but weaker drive and slower switching.',
    },
  },
  Vth: {
    decrease: {
      physical: 'A lower threshold lets the channel form at a smaller gate voltage (more overdrive).',
      tradeoff: 'Faster with more drive, but exponentially higher subthreshold leakage.',
    },
    increase: {
      physical: 'A higher threshold needs more gate voltage before the channel forms.',
      tradeoff: 'Much lower leakage, but reduced overdrive, drive, and speed.',
    },
  },
  VDD: {
    increase: {
      physical: 'A higher supply raises gate overdrive and the field across the channel.',
      tradeoff: 'Faster switching, but dynamic power grows with VDD² and heat rises.',
    },
    decrease: {
      physical: 'A lower supply reduces overdrive and the output swing.',
      tradeoff: 'Large dynamic-power savings (∝ VDD²), but slower switching and less noise margin.',
    },
  },
  Na: {
    increase: {
      physical: 'Heavier doping raises the threshold via the body-effect term and bulk potential.',
      tradeoff: 'Better short-channel control and lower leakage, but reduced mobility and drive.',
    },
    decrease: {
      physical: 'Lighter doping lowers the threshold and depletion charge.',
      tradeoff: 'Higher drive, but weaker channel control and more leakage.',
    },
  },
  T: {
    increase: {
      physical: 'Higher temperature lowers mobility (more phonon scattering) and slightly lowers Vth.',
      tradeoff: 'Leakage rises sharply (exponential), and drive degrades from mobility loss.',
    },
    decrease: {
      physical: 'Lower temperature raises mobility and slightly raises Vth.',
      tradeoff: 'Lower leakage and stronger drive — though temperature is rarely a design knob.',
    },
  },
  Cload: {
    increase: {
      physical: 'A larger load takes more charge to swing through the supply.',
      tradeoff: 'Higher switching energy and longer propagation delay.',
    },
    decrease: {
      physical: 'A smaller load needs less charge to switch.',
      tradeoff: 'Lower delay and switching energy.',
    },
  },
};

export function narrativeFor(key: string, direction: 'increase' | 'decrease'): ParamNarrative | null {
  return PARAM_NARRATIVE[key]?.[direction] ?? null;
}
