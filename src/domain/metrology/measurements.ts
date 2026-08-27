import type {
  MeasurementDefinition,
  MeasurementResult,
  MeasurementState,
  MeasurementType,
} from './types';

export const MEASUREMENTS: Record<MeasurementType, MeasurementDefinition> = {
  'film-thickness': {
    id: 'film-thickness',
    name: 'Film Thickness',
    shortName: 'Thickness',
    description:
      'Evaluates whether a deposited or grown film is at the expected thickness for the selected process condition.',
    unit: 'length',
  },

  'sheet-resistance': {
    id: 'sheet-resistance',
    name: 'Sheet Resistance',
    shortName: 'Sheet Resistance',
    description:
      'Evaluates the electrical resistance of a thin conductive or semiconductive film.',
    unit: 'Ω/□',
  },

  'critical-dimension': {
    id: 'critical-dimension',
    name: 'Critical Dimension',
    shortName: 'CD',
    description:
      'Evaluates the physical width or spacing of a patterned semiconductor feature.',
    unit: 'length',
  },
};

const RESULT_TEXT: Record<
  MeasurementType,
  Record<
    MeasurementState,
    Omit<MeasurementResult, 'measurement' | 'state'>
  >
> = {
  'film-thickness': {
    nominal: {
      observedLabel: 'Within expected behaviour',
      expectedBehaviour:
        'The film thickness is consistent with the intended fabrication condition.',
      possibleCause:
        'The deposition or growth process is behaving as expected.',
      consequence:
        'The fabricated layer is suitable for the intended process step.',
    },

    lower: {
      observedLabel: 'Thinner than expected',
      expectedBehaviour:
        'The resulting film is below the expected thickness for the selected process condition.',
      possibleCause:
        'Possible insufficient deposition or growth relative to the intended process condition.',
      consequence:
        'The reduced film thickness can affect subsequent process dimensions or electrical behaviour.',
    },

    higher: {
      observedLabel: 'Thicker than expected',
      expectedBehaviour:
        'The resulting film is above the expected thickness for the selected process condition.',
      possibleCause:
        'Possible excessive deposition or growth relative to the intended process condition.',
      consequence:
        'The increased thickness can alter subsequent dimensions or electrical behaviour.',
    },
  },

  'sheet-resistance': {
    nominal: {
      observedLabel: 'Within expected behaviour',
      expectedBehaviour:
        'The electrical resistance of the film is consistent with the intended material and thickness.',
      possibleCause:
        'The conductive film properties are behaving as expected.',
      consequence:
        'The layer can provide its intended electrical function.',
    },

    lower: {
      observedLabel: 'Lower resistance than expected',
      expectedBehaviour:
        'The film exhibits lower sheet resistance than the expected process behaviour.',
      possibleCause:
        'Possible increase in conductive material thickness or change in film resistivity.',
      consequence:
        'Current can encounter less resistance through the film.',
    },

    higher: {
      observedLabel: 'Higher resistance than expected',
      expectedBehaviour:
        'The film exhibits higher sheet resistance than the expected process behaviour.',
      possibleCause:
        'Possible reduction in conductive film thickness or increase in film resistivity.',
      consequence:
        'The layer may provide greater resistance to current flow.',
    },
  },

  'critical-dimension': {
    nominal: {
      observedLabel: 'Within expected behaviour',
      expectedBehaviour:
        'The patterned feature remains consistent with the intended geometry.',
      possibleCause:
        'Lithography and pattern-transfer conditions are behaving as expected.',
      consequence:
        'The fabricated feature remains close to the intended design geometry.',
    },

    lower: {
      observedLabel: 'Smaller than expected',
      expectedBehaviour:
        'The measured feature dimension is smaller than the intended geometry.',
      possibleCause:
        'Possible lithography or pattern-transfer variation, including excessive material removal.',
      consequence:
        'The reduced feature dimension can affect device geometry and electrical characteristics.',
    },

    higher: {
      observedLabel: 'Larger than expected',
      expectedBehaviour:
        'The measured feature dimension is larger than the intended geometry.',
      possibleCause:
        'Possible lithography or pattern-transfer variation, including insufficient material removal.',
      consequence:
        'The increased feature dimension can affect device geometry and electrical characteristics.',
    },
  },
};

export function getMeasurementResult(
  type: MeasurementType,
  state: MeasurementState,
): MeasurementResult {
  return {
    measurement: MEASUREMENTS[type],
    state,
    ...RESULT_TEXT[type][state],
  };
}