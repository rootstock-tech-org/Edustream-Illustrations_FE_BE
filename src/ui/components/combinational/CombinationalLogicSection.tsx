'use client';
import { useState } from 'react';
import { useCombinationalStore } from '@/state/combinational.store';
import { ChipCard } from './ChipCard';
import { ChipDiagram, type ChipPin } from './ChipDiagram';
import { TruthTable } from '../sequential/FlipFlopShell';

const COLORS = {
  mux: { accent: '#3b82f6', dark: '#1d4ed8', out: '#ef4444' },
  demux: { accent: '#22c55e', dark: '#15803d', in: '#ef4444' },
  encoder: { accent: '#8b5cf6', dark: '#6d28d9', out: '#6366f1' },
  decoder: { accent: '#f97316', dark: '#c2410c', out: '#f59e0b' },
  data: '#22c55e',
};

/**
 * Combinational Logic — a brand-new top-level section (alongside Sequential
 * Logic and Fabrication) covering the four classic MUX/DEMUX/Encoder/Decoder
 * building blocks. Each card is backed by REAL NAND-gate physics
 * (src/domain/combinational): every input toggle re-solves an actual
 * feed-forward NAND network (the same Gauss–Seidel engine the flip-flops
 * use), not a stored boolean lookup. There's no clock here — combinational
 * outputs react instantly, exactly like the real circuit would.
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
            <p className="hidden text-[11px] text-ink-muted sm:block">Real NAND-network physics — MUX · DEMUX · Encoder · Decoder</p>
          </div>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto lg:grid-cols-2">
        <MuxCard />
        <DemuxCard />
        <EncoderCard />
        <DecoderCard />
      </div>
    </main>
  );
}

function MuxCard() {
  const { vdd, muxInputs, muxY, setMuxInput } = useCombinationalStore();
  const [pulseTick, setPulseTick] = useState(0);
  const hi = (v: number) => v > vdd / 2;
  const bump = () => setPulseTick((t) => t + 1);

  const leftPins: ChipPin[] = [
    { label: 'I0', on: muxInputs.i0, color: COLORS.data },
    { label: 'I1', on: muxInputs.i1, color: COLORS.data },
    { label: 'I2', on: muxInputs.i2, color: COLORS.data },
    { label: 'I3', on: muxInputs.i3, color: COLORS.data },
  ];
  const rightPins: ChipPin[] = [{ label: 'Y', on: hi(muxY), color: COLORS.mux.out }];
  const bottomPins: ChipPin[] = [
    { label: 'S1', on: muxInputs.s1, color: COLORS.mux.accent },
    { label: 'S0', on: muxInputs.s0, color: COLORS.mux.accent },
  ];
  const keys = ['i0', 'i1', 'i2', 'i3'] as const;
  const selKeys = ['s1', 's0'] as const;

  return (
    <ChipCard
      eyebrow="Multiplexer (MUX)"
      eyebrowColor={COLORS.mux.accent}
      description="Selects one input from many based on select lines."
      badge="Many Inputs → 1 Output"
      diagram={
        <ChipDiagram
          title={'4:1\nMUX'}
          subtitle="GATE LEVEL"
          accent={COLORS.mux.accent}
          accentDark={COLORS.mux.dark}
          leftPins={leftPins}
          rightPins={rightPins}
          bottomPins={bottomPins}
          onLeftClick={(i) => {
            setMuxInput(keys[i]!, !muxInputs[keys[i]!]);
            bump();
          }}
          onBottomClick={(i) => {
            setMuxInput(selKeys[i]!, !muxInputs[selKeys[i]!]);
            bump();
          }}
          pulseTick={pulseTick}
        />
      }
      truthTable={
        <TruthTable
          headers={['S1', 'S0', 'Y']}
          rows={[
            ['0', '0', 'I0'],
            ['0', '1', 'I1'],
            ['1', '0', 'I2'],
            ['1', '1', 'I3'],
          ]}
        />
      }
    />
  );
}

function DemuxCard() {
  const { vdd, demuxInputs, demuxY, setDemuxInput } = useCombinationalStore();
  const [pulseTick, setPulseTick] = useState(0);
  const hi = (v: number) => v > vdd / 2;
  const bump = () => setPulseTick((t) => t + 1);

  const leftPins: ChipPin[] = [{ label: 'D', on: demuxInputs.d, color: COLORS.demux.in }];
  const rightPins: ChipPin[] = [
    { label: 'Y0', on: hi(demuxY[0]), color: COLORS.data },
    { label: 'Y1', on: hi(demuxY[1]), color: COLORS.data },
    { label: 'Y2', on: hi(demuxY[2]), color: COLORS.data },
    { label: 'Y3', on: hi(demuxY[3]), color: COLORS.data },
  ];
  const bottomPins: ChipPin[] = [
    { label: 'S1', on: demuxInputs.s1, color: COLORS.demux.accent },
    { label: 'S0', on: demuxInputs.s0, color: COLORS.demux.accent },
  ];
  const selKeys = ['s1', 's0'] as const;

  return (
    <ChipCard
      eyebrow="Demultiplexer (DEMUX)"
      eyebrowColor={COLORS.demux.accent}
      description="Sends one input to one of the many outputs based on select lines."
      badge="1 Input → Many Outputs"
      diagram={
        <ChipDiagram
          title={'1:4\nDEMUX'}
          subtitle="GATE LEVEL"
          accent={COLORS.demux.accent}
          accentDark={COLORS.demux.dark}
          leftPins={leftPins}
          rightPins={rightPins}
          bottomPins={bottomPins}
          onLeftClick={() => {
            setDemuxInput('d', !demuxInputs.d);
            bump();
          }}
          onBottomClick={(i) => {
            setDemuxInput(selKeys[i]!, !demuxInputs[selKeys[i]!]);
            bump();
          }}
          pulseTick={pulseTick}
        />
      }
      truthTable={
        <TruthTable
          headers={['S1', 'S0', 'Active Y']}
          rows={[
            ['0', '0', 'Y0'],
            ['0', '1', 'Y1'],
            ['1', '0', 'Y2'],
            ['1', '1', 'Y3'],
          ]}
        />
      }
    />
  );
}

function EncoderCard() {
  const { vdd, encoderInputs, encoderY, setEncoderActive } = useCombinationalStore();
  const [pulseTick, setPulseTick] = useState(0);
  const hi = (v: number) => v > vdd / 2;
  const keys = ['i0', 'i1', 'i2', 'i3', 'i4', 'i5', 'i6', 'i7'] as const;

  const leftPins: ChipPin[] = keys.map((k, i) => ({ label: `I${i}`, on: encoderInputs[k], color: COLORS.data }));
  const rightPins: ChipPin[] = [
    { label: 'Y2', on: hi(encoderY[0]), color: COLORS.encoder.out },
    { label: 'Y1', on: hi(encoderY[1]), color: COLORS.encoder.out },
    { label: 'Y0', on: hi(encoderY[2]), color: COLORS.encoder.out },
  ];

  return (
    <ChipCard
      eyebrow="Encoder"
      eyebrowColor={COLORS.encoder.accent}
      description="Converts one active input line into a binary code."
      badge="2ⁿ Inputs → n Outputs"
      diagram={
        <ChipDiagram
          title={'8:3\nENCODER'}
          subtitle="GATE LEVEL"
          accent={COLORS.encoder.accent}
          accentDark={COLORS.encoder.dark}
          leftPins={leftPins}
          rightPins={rightPins}
          onLeftClick={(i) => {
            setEncoderActive(keys[i]!);
            setPulseTick((t) => t + 1);
          }}
          pulseTick={pulseTick}
        />
      }
      truthTable={
        <TruthTable
          headers={['Active input', 'Y2 Y1 Y0']}
          rows={[
            ['I0', '0 0 0'],
            ['I1', '0 0 1'],
            ['I2', '0 1 0'],
            ['I3', '0 1 1'],
            ['I4', '1 0 0'],
            ['I5', '1 0 1'],
            ['I6', '1 1 0'],
            ['I7', '1 1 1'],
          ]}
        />
      }
    />
  );
}

function DecoderCard() {
  const { vdd, decoderInputs, decoderY, setDecoderInput } = useCombinationalStore();
  const [pulseTick, setPulseTick] = useState(0);
  const hi = (v: number) => v > vdd / 2;
  const bump = () => setPulseTick((t) => t + 1);
  const keys = ['a2', 'a1', 'a0'] as const;

  const leftPins: ChipPin[] = [
    { label: 'A2', on: decoderInputs.a2, color: COLORS.data },
    { label: 'A1', on: decoderInputs.a1, color: COLORS.data },
    { label: 'A0', on: decoderInputs.a0, color: COLORS.data },
  ];
  const rightPins: ChipPin[] = decoderY.map((v, i) => ({ label: `Y${i}`, on: hi(v), color: COLORS.decoder.out }));

  return (
    <ChipCard
      eyebrow="Decoder"
      eyebrowColor={COLORS.decoder.accent}
      description="Converts a binary code into one active output line."
      badge="n Inputs → 2ⁿ Outputs"
      diagram={
        <ChipDiagram
          title={'3:8\nDECODER'}
          subtitle="GATE LEVEL"
          accent={COLORS.decoder.accent}
          accentDark={COLORS.decoder.dark}
          leftPins={leftPins}
          rightPins={rightPins}
          onLeftClick={(i) => {
            setDecoderInput(keys[i]!, !decoderInputs[keys[i]!]);
            bump();
          }}
          pulseTick={pulseTick}
        />
      }
      truthTable={
        <TruthTable
          headers={['A2', 'A1', 'A0', 'Active Y']}
          rows={[
            ['0', '0', '0', 'Y0'],
            ['0', '0', '1', 'Y1'],
            ['0', '1', '0', 'Y2'],
            ['0', '1', '1', 'Y3'],
            ['1', '0', '0', 'Y4'],
            ['1', '0', '1', 'Y5'],
            ['1', '1', '0', 'Y6'],
            ['1', '1', '1', 'Y7'],
          ]}
        />
      }
    />
  );
}
