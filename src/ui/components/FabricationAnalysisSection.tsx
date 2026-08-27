'use client';

import { useEffect, useMemo } from 'react';

type Props = {
  onClose: () => void;
  device: any;
  values: Record<string, any>;
};

type DefectType =
  | 'nominal'
  | 'under-etched'
  | 'over-etched'
  | 'misaligned';

type Analysis = {
  type: DefectType;
  title: string;
  shortDescription: string;
  analysedRegion: string;
  processInterpretation: string;
  consequence: string;
  badge: string;
};

function readNumber(
  values: Record<string, any>,
  names: string[],
): number | null {
  for (const name of names) {
    const value = values?.[name];

    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function readString(
  values: Record<string, any>,
  names: string[],
): string | null {
  for (const name of names) {
    const value = values?.[name];

    if (typeof value === 'string' && value.trim() !== '') {
      return value;
    }
  }

  return null;
}

/**
 * Detect the fabrication condition from the SAME simulation
 * values used by the main device screen.
 *
 * Priority:
 * 1. Explicit defect supplied by simulator
 * 2. Alignment offset
 * 3. Etch depth vs target
 * 4. Etch amount vs target
 * 5. Otherwise nominal
 */
function detectDefect(values: Record<string, any>): DefectType {
  const explicitDefect = readString(values, [
    'defectType',
    'fabricationDefect',
    'defect',
    'processDefect',
    'analysisDefect',
  ]);

  if (explicitDefect) {
    const normalized = explicitDefect.toLowerCase();

    if (normalized.includes('under')) {
      return 'under-etched';
    }

    if (normalized.includes('over')) {
      return 'over-etched';
    }

    if (
      normalized.includes('misalign') ||
      normalized.includes('alignment')
    ) {
      return 'misaligned';
    }

    if (
      normalized.includes('nominal') ||
      normalized.includes('normal') ||
      normalized.includes('expected')
    ) {
      return 'nominal';
    }
  }

  /*
   * Alignment check.
   */
  const alignment = readNumber(values, [
    'alignmentOffset',
    'alignmentOffsetNm',
    'alignmentError',
    'overlayError',
    'misalignment',
    'misalignmentNm',
  ]);

  if (alignment !== null) {
    const alignmentTolerance = Math.max(
      Math.abs(alignment) * 0.1,
      1,
    );

    if (Math.abs(alignment) > alignmentTolerance) {
      return 'misaligned';
    }
  }

  /*
   * Etch-depth comparison.
   */
  const etchDepth = readNumber(values, [
    'etchDepth',
    'etchDepthNm',
    'actualEtchDepth',
    'actualEtchDepthNm',
  ]);

  const expectedEtchDepth = readNumber(values, [
    'expectedEtchDepth',
    'nominalEtchDepth',
    'targetEtchDepth',
    'expectedEtchDepthNm',
    'nominalEtchDepthNm',
    'targetEtchDepthNm',
  ]);

  if (etchDepth !== null && expectedEtchDepth !== null) {
    const tolerance = Math.max(
      Math.abs(expectedEtchDepth) * 0.05,
      0.1,
    );

    if (etchDepth < expectedEtchDepth - tolerance) {
      return 'under-etched';
    }

    if (etchDepth > expectedEtchDepth + tolerance) {
      return 'over-etched';
    }

    return 'nominal';
  }

  /*
   * Etch amount comparison.
   */
  const etchAmount = readNumber(values, [
    'etchAmount',
    'etchAmountNm',
    'removedThickness',
    'removedThicknessNm',
  ]);

  const expectedEtchAmount = readNumber(values, [
    'expectedEtchAmount',
    'nominalEtchAmount',
    'targetEtchAmount',
  ]);

  if (etchAmount !== null && expectedEtchAmount !== null) {
    const tolerance = Math.max(
      Math.abs(expectedEtchAmount) * 0.05,
      0.1,
    );

    if (etchAmount < expectedEtchAmount - tolerance) {
      return 'under-etched';
    }

    if (etchAmount > expectedEtchAmount + tolerance) {
      return 'over-etched';
    }

    return 'nominal';
  }

  return 'nominal';
}

function getAnalysis(type: DefectType): Analysis {
  switch (type) {
    case 'under-etched':
      return {
        type,
        title: 'Under-etched',
        shortDescription:
          'Material remains where the etching process was expected to remove it.',
        analysedRegion: 'Residual material in the etched region',
        processInterpretation:
          'The current simulated etch is shallower than the intended process condition.',
        consequence:
          'Residual material can reduce the intended feature opening or alter the fabricated geometry.',
        badge: 'Under-etch detected',
      };

    case 'over-etched':
      return {
        type,
        title: 'Over-etched',
        shortDescription:
          'Material has been removed beyond the intended etch boundary.',
        analysedRegion: 'Excessively etched region',
        processInterpretation:
          'The current simulated etch extends beyond the intended process depth.',
        consequence:
          'Excessive material removal can enlarge or distort the fabricated feature.',
        badge: 'Over-etch detected',
      };

    case 'misaligned':
      return {
        type,
        title: 'Misaligned',
        shortDescription:
          'The simulated feature is displaced from its intended position.',
        analysedRegion: 'Feature position relative to expected boundary',
        processInterpretation:
          'The current simulated feature is laterally displaced from its intended alignment.',
        consequence:
          'Misalignment can change spacing, overlap, or the electrical behaviour of the fabricated structure.',
        badge: 'Misalignment detected',
      };

    default:
      return {
        type: 'nominal',
        title: 'Expected profile',
        shortDescription:
          'The current simulated geometry is consistent with the intended fabrication profile.',
        analysedRegion: 'Feature boundary',
        processInterpretation:
          'No qualitative fabrication deviation is currently identified.',
        consequence:
          'The structure is consistent with the intended fabrication profile.',
        badge: 'Within expected profile',
      };
  }
}

function getGeometry(values: Record<string, any>) {
  const etchDepth = readNumber(values, [
    'etchDepth',
    'etchDepthNm',
    'actualEtchDepth',
    'actualEtchDepthNm',
  ]);

  const expectedEtchDepth = readNumber(values, [
    'expectedEtchDepth',
    'nominalEtchDepth',
    'targetEtchDepth',
    'expectedEtchDepthNm',
    'nominalEtchDepthNm',
    'targetEtchDepthNm',
  ]);

  const alignment = readNumber(values, [
    'alignmentOffset',
    'alignmentOffsetNm',
    'alignmentError',
    'overlayError',
    'misalignment',
    'misalignmentNm',
  ]);

  return {
    etchDepth,
    expectedEtchDepth,
    alignment,
  };
}

export function FabricationAnalysisSection({
  onClose,
  device,
  values,
}: Props) {
  const defect = useMemo(
    () => detectDefect(values),
    [values],
  );

  const analysis = useMemo(
    () => getAnalysis(defect),
    [defect],
  );

  const geometry = useMemo(
    () => getGeometry(values),
    [values],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', onKey);

    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const deviceName =
    device?.name ?? 'Current device';

  return (
    <main className="flex h-[100dvh] flex-col gap-3 overflow-hidden p-3 md:p-4">

      {/* HEADER */}
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
              Fabrication Analysis
            </h1>

            <p className="hidden text-[11px] text-ink-muted sm:block">
              Process → Image Analysis → Interpretation
            </p>
          </div>
        </div>

        <span className="rounded-full bg-accent/10 px-3 py-1 text-[11px] font-medium text-accent ring-1 ring-accent/20">
          Live Simulation
        </span>
      </header>

      {/* MAIN WORKSPACE */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto lg:grid-cols-[300px_minmax(0,1fr)_340px] lg:overflow-hidden">

        {/* LEFT — CURRENT SIMULATION */}
        <aside className="glass flex min-h-0 flex-col overflow-hidden rounded-2xl">

          <div className="border-b border-[color:var(--hairline)] px-4 py-3">
            <p className="eyebrow text-[11px] text-accent">
              Current Simulation
            </p>

            <p className="mt-1 text-xs leading-relaxed text-ink-muted">
              This analysis uses the current state of{' '}
              <span className="font-medium text-ink">
                {deviceName}
              </span>
              .
            </p>
          </div>

          <div className="overflow-y-auto p-3">

            {/* CURRENT RESULT */}
            <div className="rounded-xl bg-accent p-4 text-white shadow-[0_0_18px_var(--accent-glow)]">

              <p className="text-[10px] font-semibold uppercase tracking-wide text-white/70">
                Current Result
              </p>

              <p className="mt-1 text-xl font-semibold">
                {analysis.title}
              </p>

              <p className="mt-2 text-xs leading-relaxed text-white/80">
                {analysis.shortDescription}
              </p>

            </div>

            {/* LIVE PARAMETERS */}
            <div className="mt-3 rounded-xl bg-black/[0.03] p-4 ring-1 ring-black/10 dark:bg-white/5 dark:ring-white/10">

              <p className="eyebrow text-[10px] text-accent">
                Simulation Parameters
              </p>

              <div className="mt-3 space-y-3">

                <ParameterRow
                  label="Etch depth"
                  value={
                    geometry.etchDepth !== null
                      ? `${geometry.etchDepth} nm`
                      : 'Not exposed'
                  }
                />

                <ParameterRow
                  label="Expected etch"
                  value={
                    geometry.expectedEtchDepth !== null
                      ? `${geometry.expectedEtchDepth} nm`
                      : 'Not exposed'
                  }
                />

                <ParameterRow
                  label="Alignment"
                  value={
                    geometry.alignment !== null
                      ? `${geometry.alignment} nm`
                      : 'Not exposed'
                  }
                />

              </div>
            </div>

            {/* IMPORTANT EXPLANATION */}
            <div className="mt-3 rounded-xl bg-black/[0.03] p-4 ring-1 ring-black/10 dark:bg-white/5 dark:ring-white/10">

              <p className="text-xs font-semibold text-ink">
                How this analysis works
              </p>

              <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">
                The analysis reads the same simulation parameters
                used by the main device screen. It compares the
                current simulated geometry with the intended
                fabrication condition and identifies the resulting
                process deviation.
              </p>

            </div>

          </div>
        </aside>

        {/* CENTER — ACTUAL FEATURE VISUALIZATION */}
        <section className="glass flex min-h-[520px] min-w-0 flex-col overflow-hidden rounded-2xl">

          <div className="border-b border-[color:var(--hairline)] px-4 py-3">

            <div className="flex items-center justify-between gap-3">

              <div>

                <p className="eyebrow text-[11px] text-accent">
                  Image / Feature Analysis
                </p>

                <h2 className="mt-1 text-lg font-semibold text-ink">
                  {analysis.title}
                </h2>

              </div>

              <span className="rounded-full bg-black/[0.04] px-2.5 py-1 text-[11px] text-ink-muted ring-1 ring-black/10 dark:bg-white/5 dark:ring-white/10">
                {analysis.badge}
              </span>

            </div>

          </div>

          <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6">

            <div className="w-full max-w-3xl">

              <div className="relative overflow-hidden rounded-2xl bg-[var(--surface-elevated)] p-8 ring-1 ring-black/10 dark:ring-white/10">

                {/* EXPECTED BOUNDARY */}
                <div className="relative h-[300px]">

                  <p className="absolute left-1/2 top-0 -translate-x-1/2 text-[11px] text-ink-muted">
                    Expected boundary
                  </p>

                  {/* Expected feature */}
                  <div
                    className="absolute top-8 h-24 w-64 -translate-x-1/2 rounded-t-lg border-2 border-dashed border-accent/60 bg-accent/10"
                    style={{
                      left:
                        defect === 'misaligned'
                          ? '46%'
                          : '50%',
                    }}
                  >
                    
                  </div>

                  {/* CURRENT FEATURE */}
                  <div
                    className={`absolute top-8 h-24 w-64 rounded-t-lg transition-all ${
                      defect === 'under-etched'
                        ? 'border-2 border-blue-500 bg-blue-500/20'
                        : defect === 'over-etched'
                        ? 'border-2 border-red-500 bg-red-500/20'
                        : defect === 'misaligned'
                        ? 'border-2 border-amber-500 bg-amber-500/20'
                        : 'border-2 border-accent bg-accent/20'
                    }`}
                    style={{
                      left:
                        defect === 'misaligned'
                          ? '56%'
                          : '50%',
                      transform: 'translateX(-50%)',
                    }}
                  >
                    <div className="flex h-full items-center justify-center">
                      <span className="text-xs font-semibold text-ink">
                        Current simulated feature
                      </span>
                    </div>
                  </div>

                  {/* SUBSTRATE */}
                  <div className="absolute bottom-0 left-0 right-0 h-32 rounded-lg bg-black/[0.06] ring-1 ring-black/10 dark:bg-white/[0.05] dark:ring-white/10">

                    <div className="flex h-full items-center justify-center">
                      <span className="text-xs text-ink-muted">
                        Silicon / underlying structure
                      </span>
                    </div>

                  </div>

                  {/* DEFECT INDICATOR */}
                  {defect === 'under-etched' && (
                    <div className="absolute bottom-[118px] left-1/2 h-8 w-52 -translate-x-1/2 rounded-full border-2 border-blue-500 bg-blue-500/20">
                      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-[10px] font-semibold text-blue-600 dark:text-blue-300">
                        Residual material
                      </span>
                    </div>
                  )}

                  {defect === 'over-etched' && (
                    <div className="absolute bottom-[118px] left-1/2 h-10 w-72 -translate-x-1/2 rounded-full border-2 border-red-500 border-dashed">
                      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-[10px] font-semibold text-red-600 dark:text-red-300">
                        Excess etched region
                      </span>
                    </div>
                  )}

                  {defect === 'misaligned' && (
                    <div className="absolute left-[50%] top-[122px] h-20 border-l-2 border-dashed border-amber-500" />
                  )}

                </div>

                {/* PIPELINE */}
                <div className="mt-6 grid grid-cols-3 gap-2">

                  <AnalysisStep
                    title="INPUT"
                    value="Current simulation"
                  />

                  <AnalysisStep
                    title="COMPARISON"
                    value="Current vs expected"
                  />

                  <AnalysisStep
                    title="OUTPUT"
                    value={analysis.title}
                  />

                </div>

              </div>

            </div>

          </div>
        </section>

        {/* RIGHT — INTERPRETATION */}
        <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto">

          {/* RESULT */}
          <div className="glass rounded-2xl p-4">

            <p className="eyebrow text-[11px] text-accent">
              Analysis Result
            </p>

            <div className="mt-3 rounded-xl bg-black/[0.03] p-4 ring-1 ring-black/10 dark:bg-white/5 dark:ring-white/10">

              <p className="text-base font-semibold text-ink">
                {analysis.title}
              </p>

              <p className="mt-2 text-xs leading-relaxed text-ink-muted">
                {analysis.shortDescription}
              </p>

            </div>

          </div>

          {/* INTERPRETATION */}
          <div className="glass rounded-2xl p-4">

            <p className="eyebrow text-[11px] text-accent">
              Interpretation
            </p>

            <div className="mt-4 space-y-5">

              <InterpretationItem
                title="Analysed Region"
                text={analysis.analysedRegion}
              />

              <InterpretationItem
                title="Process Interpretation"
                text={analysis.processInterpretation}
              />

              <InterpretationItem
                title="Consequence"
                text={analysis.consequence}
              />

            </div>

          </div>

          {/* METHOD */}
          <div className="glass rounded-2xl p-4">

            <p className="eyebrow text-[11px] text-accent">
              Method
            </p>

            <div className="mt-3 space-y-3">

              <MethodStep
                number="1"
                text="Read the current fabrication state from the main simulation."
              />

              <MethodStep
                number="2"
                text="Compare the simulated parameter with its intended process value."
              />

              <MethodStep
                number="3"
                text="Determine the qualitative fabrication deviation."
              />

              <MethodStep
                number="4"
                text="Visualise the current feature relative to the expected boundary."
              />

            </div>

          </div>

          {/* DEVICE CONTEXT */}
          <div className="glass rounded-2xl p-4">

            <p className="eyebrow text-[11px] text-accent">
              Device Context
            </p>

            <p className="mt-2 text-sm font-semibold text-ink">
              {deviceName}
            </p>

            <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">
              This analysis is connected to the same simulation
              state used by the main device screen.
            </p>

          </div>

          {/* MODEL ASSUMPTION */}
          <div className="glass rounded-2xl p-4">

            <p className="eyebrow text-[11px] text-accent">
              Model Assumption
            </p>

            <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">
              The defect classification is based only on fabrication
              parameters exposed by the current simulator. The
              analysis does not invent measurements that are not
              available in the simulation state.
            </p>

          </div>

        </aside>

      </div>
    </main>
  );
}

function ParameterRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] text-ink-muted">
        {label}
      </span>

      <span className="font-mono text-xs font-semibold text-ink">
        {value}
      </span>
    </div>
  );
}

function AnalysisStep({
  title,
  value,
}: {
  title: string;
  value: string;
}) {
  return (
    <div className="rounded-lg bg-black/[0.03] p-3 text-center ring-1 ring-black/10 dark:bg-white/5 dark:ring-white/10">

      <p className="text-[10px] font-medium text-ink-muted">
        {title}
      </p>

      <p className="mt-1 text-xs font-medium text-ink">
        {value}
      </p>

    </div>
  );
}

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

function MethodStep({
  number,
  text,
}: {
  number: string;
  text: string;
}) {
  return (
    <div className="flex gap-3">

      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[10px] font-semibold text-accent ring-1 ring-accent/20">
        {number}
      </div>

      <p className="text-[11px] leading-relaxed text-ink-muted">
        {text}
      </p>

    </div>
  );
}