export type MeasurementType =
  | 'film-thickness'
  | 'sheet-resistance'
  | 'critical-dimension';

export type MeasurementState =
  | 'nominal'
  | 'lower'
  | 'higher';

export interface MeasurementDefinition {
  id: MeasurementType;
  name: string;
  shortName: string;
  description: string;
  unit: string;
}

export interface MeasurementResult {
  measurement: MeasurementDefinition;
  state: MeasurementState;
  observedLabel: string;
  expectedBehaviour: string;
  possibleCause: string;
  consequence: string;
}