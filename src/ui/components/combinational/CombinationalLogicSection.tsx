'use client';
import { useCombinationalStore } from '@/state/combinational.store';
import { ChipCard } from './ChipCard';
import { MuxDiagram } from './MuxDiagram';
import { DemuxDiagram } from './DemuxDiagram';
import { TruthTable, ToggleButton } from '../sequential/FlipFlopShell';

const COLORS = {
  mux: { accent: '#3b82f6', dark: '#1d4ed8', out: '#ef4444' },
  demux: { accent: '#22c55e', dark: '#15803d', in: '#ef4444' },
  encoder: { accent: '#8b5cf6', dark: '#6d28d9', out: '#6366f1' },
  decoder: { accent: '#f97316', dark: '#c2410c', out: '#f59e0b' },
  data: '#22c55e',
};

/**
 * Combinational Logic — a top-level section (alongside Sequential Logic and
 * Fabrication) covering the MUX and DEMUX building blocks. Each card is backed
 * by REAL NAND-gate physics (src/domain/combinational): every input toggle
 * re-solves an actual feed-forward NAND network (the same Gauss–Seidel engine
 * the flip-flops use), not a stored boolean lookup. There's no clock here —
 * combinational outputs react instantly, exactly like the real circuit would.
 */
export function CombinationalLogicSection({ onClose }: { onClose: () => void }) {
  return (
    <main className="flex h-[100dvh] flex-col gap-3 overflow-hidden p-3 md:p-4">
      <header className="glass flex items-center justify-between gap-3 rounded-2xl px-4 py-2.5">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="rounded-lg bg-black/[0.04] px-3 py-1.5 text-sm font-medium text-ink-muted ring-1 ring-black/10 transition hover:text-ink dark:bg-white/5 dark:ring-white/10"
          >
            ‹ Back
          </button>
          <div className="leading-tight">
            <h1 className="eyebrow text-sm text-ink">Combinational Logic</h1>
            <p className="hidden text-[11px] text-ink-muted sm:block">Real NAND-network physics — MUX · DEMUX</p>
          </div>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto lg:grid-cols-2">
        <MuxCard />
        <DemuxCard />
      </div>
    </main>
  );
}

function MuxCard() {
  const { vdd, muxInputs, muxY, setMuxInput } = useCombinationalStore();
  const hi = (v: number) => v > vdd / 2;
  const dataKeys = ['i0', 'i1', 'i2', 'i3'] as const;

  return (
    <ChipCard
      eyebrow="Multiplexer (4:1 MUX)"
      eyebrowColor={COLORS.mux.accent}
      description="Selects one of four data inputs onto Y using select lines S₁S₀ (enable E)."
      badge="Many Inputs → 1 Output"
      diagram={
        <MuxDiagram
          d={[muxInputs.i0, muxInputs.i1, muxInputs.i2, muxInputs.i3]}
          s1={muxInputs.s1}
          s0={muxInputs.s0}
          y={hi(muxY)}
        />
      }
      controls={
        <>
          {dataKeys.map((k, i) => (
            <ToggleButton key={k} label={`D${i}`} on={muxInputs[k]} onClick={() => setMuxInput(k, !muxInputs[k])} />
          ))}
          <ToggleButton label="S1" on={muxInputs.s1} onClick={() => setMuxInput('s1', !muxInputs.s1)} />
          <ToggleButton label="S0" on={muxInputs.s0} onClick={() => setMuxInput('s0', !muxInputs.s0)} />
        </>
      }
      truthTable={
        <TruthTable
          headers={['E', 'S1', 'S0', 'Y']}
          rows={[
            ['1', '0', '0', 'D0'],
            ['1', '0', '1', 'D1'],
            ['1', '1', '0', 'D2'],
            ['1', '1', '1', 'D3'],
            ['0', 'X', 'X', '0'],
          ]}
        />
      }
    />
  );
}

function DemuxCard() {
  const { demuxInputs, setDemuxInput } = useCombinationalStore();

  return (
    <ChipCard
      eyebrow="Demultiplexer (1:4 DEMUX)"
      eyebrowColor={COLORS.demux.accent}
      description="Routes the single input D to one of Y0..Y3 selected by S₁S₀ (reference equations)."
      badge="1 Input → Many Outputs"
      diagram={<DemuxDiagram d={demuxInputs.d} s1={demuxInputs.s1} s0={demuxInputs.s0} />}
      controls={
        <>
          <ToggleButton label="D" on={demuxInputs.d} onClick={() => setDemuxInput('d', !demuxInputs.d)} />
          <ToggleButton label="S1" on={demuxInputs.s1} onClick={() => setDemuxInput('s1', !demuxInputs.s1)} />
          <ToggleButton label="S0" on={demuxInputs.s0} onClick={() => setDemuxInput('s0', !demuxInputs.s0)} />
        </>
      }
      truthTable={
        <TruthTable
          headers={['S1', 'S0', 'Active Y']}
          rows={[
            ['0', '0', 'Y0'],
            ['1', '0', 'Y1'],
            ['0', '1', 'Y2'],
            ['1', '1', 'Y3'],
          ]}
        />
      }
    />
  );
}

