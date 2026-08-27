'use client';

import { useEffect, useMemo, useState } from 'react';

type MeasurementType =
  | 'film-thickness'
  | 'sheet-resistance'
  | 'critical-dimension';

type MeasurementState =
  | 'nominal'
  | 'lower'
  | 'higher'
  | 'unavailable';

type Props = {
  onClose: () => void;
  device: any;
  values: Record<string, any>;
};

const MEASUREMENT_TYPES: MeasurementType[] = [
  'film-thickness',
  'sheet-resistance',
  'critical-dimension',
];

const MEASUREMENT_META: Record<
  MeasurementType,
  {
    name: string;
    unit: string;
    layerLabel: string;
    description: string;
  }
> = {
  'film-thickness': {
    name: 'Film Thickness',
    unit: 'nm',
    layerLabel: 'Current oxide / measured layer',
    description:
      'Measures the thickness of the current oxide or deposited film.',
  },

  'sheet-resistance': {
    name: 'Sheet Resistance',
    unit: 'Ω/□',
    layerLabel: 'Current conductive / semiconductor film',
    description:
      'Measures the electrical resistance of the current thin film.',
  },

  'critical-dimension': {
    name: 'Critical Dimension',
    unit: 'nm',
    layerLabel: 'Current patterned feature',
    description:
      'Measures the physical width or spacing of the selected feature.',
  },
};

const STATE_LABELS: Record<MeasurementState, string> = {
  nominal: 'Nominal',
  lower: 'Lower than expected',
  higher: 'Higher than expected',
  unavailable: 'Not available',
};

/* -------------------------------------------------------------------------- */
/*                              HELPER FUNCTIONS                              */
/* -------------------------------------------------------------------------- */

/**
 * Safely read a number from the live simulation state.
 */
function readNumber(
  values: Record<string, any> | undefined,
  names: string[],
): number | null {
  if (!values) {
    return null;
  }

  for (const name of names) {
    const value = values[name];

    if (
      typeof value === 'number' &&
      Number.isFinite(value)
    ) {
      return value;
    }

    if (
      typeof value === 'string' &&
      value.trim() !== ''
    ) {
      const parsed = Number(value);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

/**
 * Convert the live simulator value into the display unit.
 *
 * Film thickness:
 * - If simulator exposes an explicit nm value, use it.
 * - Otherwise assume oxideThickness / tox / filmThickness
 *   is stored in metres and convert metres -> nm.
 *
 * Sheet resistance:
 * - Returned directly in Ω/□.
 *
 * Critical dimension:
 * - Explicit nm values are preferred.
 * - Otherwise metres -> nm conversion is applied.
 */
function getLiveMeasurement(
  measurement: MeasurementType,
  values: Record<string, any>,
): number | null {
  if (measurement === 'film-thickness') {
    const explicitNm = readNumber(values, [
      'oxideThicknessNm',
      'filmThicknessNm',
    ]);

    if (explicitNm !== null) {
      return explicitNm;
    }

    const metres = readNumber(values, [
      'oxideThickness',
      'tox',
      'Tox',
      'filmThickness',
    ]);

    if (metres !== null) {
      return metres * 1e9;
    }

    return null;
  }

  if (measurement === 'sheet-resistance') {
    return readNumber(values, [
      'sheetResistance',
      'sheetResistanceOhm',
      'sheetResistanceOhms',
      'sheetResistanceOmega',
    ]);
  }

  if (measurement === 'critical-dimension') {
    const explicitNm = readNumber(values, [
      'criticalDimensionNm',
      'cdNm',
    ]);

    if (explicitNm !== null) {
      return explicitNm;
    }

    const metres = readNumber(values, [
      'criticalDimension',
      'cd',
    ]);

    if (metres !== null) {
      return metres * 1e9;
    }

    return null;
  }

  return null;
}

/**
 * Find the expected / nominal value.
 *
 * Film thickness is converted to nm if the simulator stores
 * the expected value in metres.
 */
function getExpectedMeasurement(
  measurement: MeasurementType,
  values: Record<string, any>,
): number | null {
  if (measurement === 'film-thickness') {
    const explicitNm = readNumber(values, [
      'expectedOxideThicknessNm',
      'nominalOxideThicknessNm',
      'targetOxideThicknessNm',
      'expectedFilmThicknessNm',
      'nominalFilmThicknessNm',
    ]);

    if (explicitNm !== null) {
      return explicitNm;
    }

    const value = readNumber(values, [
      'expectedOxideThickness',
      'nominalOxideThickness',
      'targetOxideThickness',
      'expectedFilmThickness',
      'nominalFilmThickness',
    ]);

    if (value !== null) {
      /*
       * If the expected oxide value is very small, it is most
       * likely stored in metres.
       */
      if (Math.abs(value) < 1e-3) {
        return value * 1e9;
      }

      return value;
    }

    return null;
  }

  if (measurement === 'sheet-resistance') {
    return readNumber(values, [
      'expectedSheetResistance',
      'nominalSheetResistance',
      'targetSheetResistance',
    ]);
  }

  if (measurement === 'critical-dimension') {
    const explicitNm = readNumber(values, [
      'expectedCriticalDimensionNm',
      'nominalCriticalDimensionNm',
      'targetCriticalDimensionNm',
    ]);

    if (explicitNm !== null) {
      return explicitNm;
    }

    const value = readNumber(values, [
      'expectedCriticalDimension',
      'nominalCriticalDimension',
      'targetCriticalDimension',
    ]);

    if (value !== null) {
      if (Math.abs(value) < 1e-3) {
        return value * 1e9;
      }

      return value;
    }

    return null;
  }

  return null;
}

/**
 * Determine whether the live value is lower, higher or nominal
 * compared with the expected value.
 *
 * A 5% tolerance is used as the qualitative process window.
 */
function detectMeasurementState(
  measurement: MeasurementType,
  values: Record<string, any>,
): MeasurementState {
  const actual = getLiveMeasurement(
    measurement,
    values,
  );

  const expected = getExpectedMeasurement(
    measurement,
    values,
  );

  /*
   * We cannot determine a process state if the simulator
   * does not expose both values.
   */
  if (
    actual === null ||
    expected === null
  ) {
    /*
     * Respect an explicit state if the main simulator provides one.
     */
    const stateKey =
      measurement === 'film-thickness'
        ? 'filmThicknessState'
        : measurement === 'sheet-resistance'
        ? 'sheetResistanceState'
        : 'criticalDimensionState';

    const explicitState = values?.[stateKey];

    if (
      explicitState === 'nominal' ||
      explicitState === 'lower' ||
      explicitState === 'higher'
    ) {
      return explicitState;
    }

    return 'unavailable';
  }

  /*
   * Five percent qualitative tolerance.
   */
  const tolerance =
    Math.max(
      Math.abs(expected) * 0.05,
      0.001,
    );

  if (actual < expected - tolerance) {
    return 'lower';
  }

  if (actual > expected + tolerance) {
    return 'higher';
  }

  return 'nominal';
}

/**
 * Format a measurement for display.
 */
function formatValue(
  value: number | null,
): string {
  if (value === null) {
    return 'Not available';
  }

  if (Math.abs(value) >= 1000) {
    return value.toFixed(0);
  }

  if (Math.abs(value) >= 100) {
    return value.toFixed(1);
  }

  if (Math.abs(value) >= 10) {
    return value.toFixed(2);
  }

  return value.toFixed(3).replace(/\.?0+$/, '');
}

/**
 * Format deviation with + / - sign.
 */
function formatDeviation(
  value: number | null,
): string {
  if (value === null) {
    return 'Not available';
  }

  const prefix = value > 0 ? '+' : '';

  return `${prefix}${formatValue(value)}`;
}

/**
 * Generate interpretation text from the live measurement.
 */
function getInterpretation(
  measurement: MeasurementType,
  state: MeasurementState,
) {
  if (state === 'unavailable') {
    return {
      observed: 'Measurement unavailable',
      expectedBehaviour:
        'The current simulator does not expose enough information to compare this quantity against a nominal fabrication value.',
      possibleCause:
        'No validated expected value or live measurement is currently available from the main simulation.',
      consequence:
        'No fabrication deviation is reported until the required simulation parameter is exposed.',
    };
  }

  if (measurement === 'film-thickness') {
    if (state === 'lower') {
      return {
        observed: 'Film thinner than expected',
        expectedBehaviour:
          'The simulated oxide or deposited film is below the expected process thickness.',
        possibleCause:
          'The simulated oxidation or deposition condition produces less material than the nominal process condition.',
        consequence:
          'A thinner dielectric or film can change the electrical behaviour of the device.',
      };
    }

    if (state === 'higher') {
      return {
        observed: 'Film thicker than expected',
        expectedBehaviour:
          'The simulated oxide or deposited film is above the expected process thickness.',
        possibleCause:
          'The simulated oxidation or deposition condition produces more material than the nominal process condition.',
        consequence:
          'A thicker dielectric or film can alter capacitance, electric-field behaviour and device characteristics.',
      };
    }

    return {
      observed: 'Film thickness within expected behaviour',
      expectedBehaviour:
        'The simulated oxide or deposited film is close to the expected process thickness.',
      possibleCause:
        'The current simulation parameters are consistent with the nominal fabrication condition.',
      consequence:
        'No thickness-related fabrication deviation is indicated by the current simulation.',
    };
  }

  if (measurement === 'sheet-resistance') {
    if (state === 'lower') {
      return {
        observed: 'Sheet resistance lower than expected',
        expectedBehaviour:
          'The simulated film has lower electrical resistance per square than the nominal condition.',
        possibleCause:
          'The simulated film properties differ from the expected conductivity or thickness condition.',
        consequence:
          'Lower sheet resistance can alter current flow and the electrical behaviour of the fabricated structure.',
      };
    }

    if (state === 'higher') {
      return {
        observed: 'Sheet resistance higher than expected',
        expectedBehaviour:
          'The simulated film has higher electrical resistance per square than the nominal condition.',
        possibleCause:
          'The simulated film may have reduced conductivity or a process-dependent thickness/property variation.',
        consequence:
          'Higher sheet resistance can reduce current flow and affect device electrical performance.',
      };
    }

    return {
      observed: 'Sheet resistance within expected behaviour',
      expectedBehaviour:
        'The simulated film resistance is close to the nominal process condition.',
      possibleCause:
        'The current simulation parameters are consistent with the expected electrical film properties.',
      consequence:
        'No sheet-resistance-related fabrication deviation is indicated.',
    };
  }

  if (measurement === 'critical-dimension') {
    if (state === 'lower') {
      return {
        observed: 'Critical dimension smaller than expected',
        expectedBehaviour:
          'The simulated feature width or spacing is below the intended fabrication dimension.',
        possibleCause:
          'The simulated pattern geometry is smaller than the nominal feature size.',
        consequence:
          'A reduced critical dimension can change device geometry and electrical performance.',
      };
    }

    if (state === 'higher') {
      return {
        observed: 'Critical dimension larger than expected',
        expectedBehaviour:
          'The simulated feature width or spacing is above the intended fabrication dimension.',
        possibleCause:
          'The simulated pattern geometry is larger than the nominal feature size.',
        consequence:
          'An increased critical dimension can alter device geometry and electrical behaviour.',
      };
    }

    return {
      observed: 'Critical dimension within expected behaviour',
      expectedBehaviour:
        'The simulated feature dimension is close to the intended fabrication dimension.',
      possibleCause:
        'The current geometry is consistent with the nominal process condition.',
      consequence:
        'No critical-dimension-related fabrication deviation is indicated.',
    };
  }

  return {
    observed: 'Measurement unavailable',
    expectedBehaviour: '',
    possibleCause: '',
    consequence: '',
  };
}

/* -------------------------------------------------------------------------- */
/*                              MAIN COMPONENT                                */
/* -------------------------------------------------------------------------- */

export function MetrologySection({
  onClose,
  device,
  values,
}: Props) {
  const [measurement, setMeasurement] =
    useState<MeasurementType>(
      'film-thickness',
    );

  /*
   * Read the current value directly from the main simulation.
   */
  const liveValue = useMemo(
    () =>
      getLiveMeasurement(
        measurement,
        values,
      ),
    [measurement, values],
  );

  /*
   * Read the expected / nominal value.
   */
  const expectedValue = useMemo(
    () =>
      getExpectedMeasurement(
        measurement,
        values,
      ),
    [measurement, values],
  );

  /*
   * Automatically determine the current state.
   */
  const state = useMemo(
    () =>
      detectMeasurementState(
        measurement,
        values,
      ),
    [measurement, values],
  );

  /*
   * Calculate deviation.
   */
  const deviation = useMemo(() => {
    if (
      liveValue === null ||
      expectedValue === null
    ) {
      return null;
    }

    return liveValue - expectedValue;
  }, [liveValue, expectedValue]);

  const meta =
    MEASUREMENT_META[measurement];

  const interpretation =
    getInterpretation(
      measurement,
      state,
    );

  /*
   * Escape key closes the dashboard.
   */
  useEffect(() => {
    const onKey = (
      event: KeyboardEvent,
    ) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener(
      'keydown',
      onKey,
    );

    return () => {
      window.removeEventListener(
        'keydown',
        onKey,
      );
    };
  }, [onClose]);

  return (
    <main className="flex h-[100dvh] flex-col gap-3 overflow-hidden p-3 md:p-4">

      {/* ------------------------------------------------------------------ */}
      {/* HEADER                                                             */}
      {/* ------------------------------------------------------------------ */}

      <header className="glass flex items-center justify-between gap-3 rounded-2xl px-4 py-2.5">

        <div className="flex items-center gap-3">

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-black/[0.04] px-3 py-1.5 text-sm font-medium text-ink-muted ring-1 ring-black/10 transition hover:text-ink dark:bg-white/5 dark:ring-white/10"
          >
            ‹ Back
          </button>

          <div className="leading-tight">

            <h1 className="eyebrow text-sm text-ink">
              Metrology Dashboard
            </h1>

            <p className="hidden text-[11px] text-ink-muted sm:block">
              Process → Measurement → Interpretation
            </p>

          </div>

        </div>

        <span className="rounded-full bg-accent/10 px-3 py-1 text-[11px] font-medium text-accent ring-1 ring-accent/20">
          Live Simulation
        </span>

      </header>

      {/* ------------------------------------------------------------------ */}
      {/* MAIN WORKSPACE                                                     */}
      {/* ------------------------------------------------------------------ */}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto lg:grid-cols-[240px_minmax(0,1fr)_320px] lg:overflow-hidden">

        {/* ---------------------------------------------------------------- */}
        {/* LEFT: MEASUREMENT SELECTOR                                      */}
        {/* ---------------------------------------------------------------- */}

        <aside className="glass flex min-h-0 flex-col overflow-hidden rounded-2xl">

          <div className="border-b border-[color:var(--hairline)] px-4 py-3">

            <p className="eyebrow text-[11px] text-accent">
              Measurements
            </p>

            <p className="mt-1 text-xs text-ink-muted">
              Select a fabrication measurement to inspect.
            </p>

          </div>

          <div className="flex flex-col gap-2 overflow-y-auto p-3">

            {MEASUREMENT_TYPES.map(
              (type) => {
                const active =
                  measurement === type;

                const item =
                  MEASUREMENT_META[type];

                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() =>
                      setMeasurement(type)
                    }
                    className={`rounded-xl px-3 py-3 text-left transition ${
                      active
                        ? 'bg-accent text-white shadow-[0_0_18px_var(--accent-glow)]'
                        : 'bg-black/[0.03] text-ink-muted ring-1 ring-black/10 hover:text-ink dark:bg-white/5 dark:ring-white/10'
                    }`}
                  >

                    <p className="text-sm font-semibold">
                      {item.name}
                    </p>

                    <p
                      className={`mt-1 text-[11px] leading-relaxed ${
                        active
                          ? 'text-white/80'
                          : 'text-ink-muted'
                      }`}
                    >
                      {item.description}
                    </p>

                  </button>
                );
              },
            )}

          </div>

        </aside>

        {/* ---------------------------------------------------------------- */}
        {/* CENTER: PHYSICAL STRUCTURE                                      */}
        {/* ---------------------------------------------------------------- */}

        <section className="glass flex min-h-[500px] min-w-0 flex-col overflow-hidden rounded-2xl">

          <div className="border-b border-[color:var(--hairline)] px-4 py-3">

            <div className="flex items-center justify-between gap-3">

              <div>

                <p className="eyebrow text-[11px] text-accent">
                  Physical Structure
                </p>

                <h2 className="mt-1 text-lg font-semibold text-ink">
                  {meta.name}
                </h2>

              </div>

              <span className="rounded-full bg-black/[0.04] px-2.5 py-1 text-[11px] text-ink-muted ring-1 ring-black/10 dark:bg-white/5 dark:ring-white/10">
                Live view
              </span>

            </div>

          </div>

          <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6">

            <div className="w-full max-w-2xl">

              <div className="relative overflow-hidden rounded-2xl bg-[var(--surface-elevated)] p-8 ring-1 ring-black/10 dark:ring-white/10">

                {/* -------------------------------------------------------- */}
                {/* CURRENT VALUE                                             */}
                {/* -------------------------------------------------------- */}

                <div className="mb-6 rounded-xl bg-accent/10 p-4 ring-1 ring-accent/20">

                  <p className="text-[10px] font-semibold uppercase tracking-wide text-accent">
                    Current simulated value
                  </p>

                  {liveValue !== null ? (
                    <div className="mt-2 flex items-end gap-2">

                      <span className="text-4xl font-bold text-ink">
                        {formatValue(
                          liveValue,
                        )}
                      </span>

                      <span className="pb-1 text-sm text-ink-muted">
                        {meta.unit}
                      </span>

                    </div>
                  ) : (
                    <p className="mt-2 text-sm font-medium text-ink">
                      Value not exposed by the current simulator
                    </p>
                  )}

                </div>

                {/* -------------------------------------------------------- */}
                {/* VISUAL CROSS SECTION                                      */}
                {/* -------------------------------------------------------- */}

                <div className="space-y-2">

                  <div
                    className="flex items-center justify-center rounded-lg border border-dashed border-accent/40 bg-accent/10 transition-all"
                    style={{
                      height:
                        liveValue !== null
                          ? Math.max(
                              40,
                              Math.min(
                                140,
                                measurement ===
                                  'film-thickness'
                                  ? 40 +
                                    Math.min(
                                      liveValue *
                                        0.25,
                                      100,
                                    )
                                  : 64,
                              ),
                            )
                          : 64,
                    }}
                  >

                    <span className="text-xs font-medium text-accent">
                      {meta.layerLabel}
                    </span>

                  </div>

                  <div className="h-5 rounded bg-black/10 dark:bg-white/10" />

                  <div className="flex h-28 items-center justify-center rounded-lg bg-black/[0.05] ring-1 ring-black/10 dark:bg-white/[0.04] dark:ring-white/10">

                    <span className="text-xs text-ink-muted">
                      Silicon / underlying structure
                    </span>

                  </div>

                </div>

                {/* -------------------------------------------------------- */}
                {/* DESCRIPTION                                               */}
                {/* -------------------------------------------------------- */}

                <div className="mt-8 rounded-xl bg-black/[0.03] p-4 ring-1 ring-black/10 dark:bg-white/5 dark:ring-white/10">

                  <p className="text-xs font-medium text-ink">
                    What is being measured?
                  </p>

                  <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                    {meta.description}
                  </p>

                </div>

              </div>

            </div>

          </div>

        </section>

        {/* ---------------------------------------------------------------- */}
        {/* RIGHT: INTERPRETATION                                            */}
        {/* ---------------------------------------------------------------- */}

        <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto">

          {/* -------------------------------------------------------------- */}
          {/* CURRENT STATE                                                  */}
          {/* -------------------------------------------------------------- */}

          <div className="glass rounded-2xl p-4">

            <p className="eyebrow text-[11px] text-accent">
              Measurement State
            </p>

            <div
              className={`mt-3 rounded-xl p-4 ${
                state === 'unavailable'
                  ? 'bg-black/[0.04] ring-1 ring-black/10 dark:bg-white/5 dark:ring-white/10'
                  : 'bg-accent text-white shadow-[0_0_18px_var(--accent-glow)]'
              }`}
            >

              <p
                className={`text-[10px] uppercase tracking-wide ${
                  state === 'unavailable'
                    ? 'text-ink-muted'
                    : 'text-white/70'
                }`}
              >
                Current interpretation
              </p>

              <p
                className={`mt-1 text-lg font-semibold ${
                  state === 'unavailable'
                    ? 'text-ink'
                    : 'text-white'
                }`}
              >
                {STATE_LABELS[state]}
              </p>

              <p
                className={`mt-1 text-xs leading-relaxed ${
                  state === 'unavailable'
                    ? 'text-ink-muted'
                    : 'text-white/80'
                }`}
              >
                {state === 'unavailable'
                  ? 'The current simulator does not expose enough information for a numerical comparison.'
                  : 'The state is derived automatically from the current simulation values.'}
              </p>

            </div>

          </div>

          {/* -------------------------------------------------------------- */}
          {/* NUMERICAL COMPARISON                                           */}
          {/* -------------------------------------------------------------- */}

          <div className="glass rounded-2xl p-4">

            <p className="eyebrow text-[11px] text-accent">
              Measurement
            </p>

            <div className="mt-3 space-y-3">

              <div className="flex items-center justify-between gap-3">

                <span className="text-xs text-ink-muted">
                  Current value
                </span>

                <span className="text-right font-mono text-sm font-semibold text-ink">
                  {liveValue !== null
                    ? `${formatValue(liveValue)} ${meta.unit}`
                    : 'Not available'}
                </span>

              </div>

              <div className="flex items-center justify-between gap-3">

                <span className="text-xs text-ink-muted">
                  Expected value
                </span>

                <span className="text-right font-mono text-sm font-semibold text-ink">
                  {expectedValue !== null
                    ? `${formatValue(expectedValue)} ${meta.unit}`
                    : 'Not available'}
                </span>

              </div>

              {deviation !== null && (
                <div className="flex items-center justify-between gap-3 border-t border-[color:var(--hairline)] pt-3">

                  <span className="text-xs text-ink-muted">
                    Deviation
                  </span>

                  <span
                    className={`text-right font-mono text-sm font-semibold ${
                      deviation > 0
                        ? 'text-red-600 dark:text-red-400'
                        : deviation < 0
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-ink'
                    }`}
                  >
                    {formatDeviation(
                      deviation,
                    )}{' '}
                    {meta.unit}
                  </span>

                </div>
              )}

            </div>

          </div>

          {/* -------------------------------------------------------------- */}
          {/* INTERPRETATION                                                 */}
          {/* -------------------------------------------------------------- */}

          <div className="glass rounded-2xl p-4">

            <p className="eyebrow text-[11px] text-accent">
              Interpretation
            </p>

            <div className="mt-3 rounded-xl bg-black/[0.03] p-3 ring-1 ring-black/10 dark:bg-white/5 dark:ring-white/10">

              <p className="text-sm font-semibold text-ink">
                {interpretation.observed}
              </p>

            </div>

            <div className="mt-4 space-y-4">

              <InterpretationItem
                title="Expected Behaviour"
                text={
                  interpretation.expectedBehaviour
                }
              />

              <InterpretationItem
                title="Possible Cause"
                text={
                  interpretation.possibleCause
                }
              />

              <InterpretationItem
                title="Consequence"
                text={
                  interpretation.consequence
                }
              />

            </div>

          </div>

          {/* -------------------------------------------------------------- */}
          {/* DEVICE CONTEXT                                                 */}
          {/* -------------------------------------------------------------- */}

          <div className="glass rounded-2xl p-4">

            <p className="eyebrow text-[11px] text-accent">
              Device Context
            </p>

            <p className="mt-2 text-sm font-semibold text-ink">
              {device?.name ??
                'Current device'}
            </p>

            <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">
              This metrology view uses the same
              simulation state supplied by the
              main device screen.
            </p>

          </div>

          {/* -------------------------------------------------------------- */}
          {/* MODEL ASSUMPTION                                               */}
          {/* -------------------------------------------------------------- */}

          <div className="glass rounded-2xl p-4">

            <p className="eyebrow text-[11px] text-accent">
              Model Assumption
            </p>

            <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">
              Numerical values shown here come
              from the current simulation state
              when those parameters are exposed.
              Process interpretation remains
              qualitative unless validated
              fabrication calibration data is
              available.
            </p>

          </div>

        </aside>

      </div>

    </main>
  );
}

/* -------------------------------------------------------------------------- */
/*                         INTERPRETATION COMPONENT                           */
/* -------------------------------------------------------------------------- */

function InterpretationItem({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <div>

      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink">
        {title}
      </p>

      <p className="mt-1 text-xs leading-relaxed text-ink-muted">
        {text}
      </p>

    </div>
  );
}