'use client';
import { useState } from 'react';
import { useSequentialStore } from '@/state/sequential.store';
import { FlipFlopShell, ToggleButton, TruthTable } from './FlipFlopShell';
import { SrLatchDiagram } from './SrLatchDiagram';
import { DFlipFlopDiagram } from './DFlipFlopDiagram';
import { JkFlipFlopDiagram } from './JkFlipFlopDiagram';
import { TFlipFlopDiagram } from './TFlipFlopDiagram';

/**
 * Sequential Logic — a brand-new top-level section (separate from the
 * combinational Device tabs), covering the four canonical flip-flops. Each
 * card is backed by REAL cross-coupled NAND physics (src/domain/sequential):
 * "Clock ↑ Pulse" runs an actual transparent-phase + rising-edge solve, and
 * "hold" is genuine feedback memory, not a stored boolean. Esc returns to
 * the Probe Station.
 */
export function SequentialLogicSection({ onClose }: { onClose: () => void }) {
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
            <h1 className="eyebrow text-sm text-ink">Sequential Logic</h1>
            <p className="hidden text-[11px] text-ink-muted sm:block">Real cross-coupled NAND physics — SR · D · JK · T flip-flops</p>
          </div>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto lg:grid-cols-2">
        <SrLatchCard />
        <DFlipFlopCard />
        <JkFlipFlopCard />
        <TFlipFlopCard />
      </div>
    </main>
  );
}

function SrLatchCard() {
  const { vdd, sr, srInputs, setSrInput, pulseSr, resetSr } = useSequentialStore();
  const [pulseTick, setPulseTick] = useState(0);
  const handlePulse = () => {
    setPulseTick((t) => t + 1);
    pulseSr();
  };
  return (
    <FlipFlopShell
      title="SR Latch"
      subtitle="Gated Set-Reset — 4 cross-coupled NAND gates"
      q={sr.q}
      vdd={vdd}
      onPulse={handlePulse}
      onReset={resetSr}
      inputs={
        <>
          <ToggleButton label="S" on={srInputs.s} onClick={() => setSrInput('s', !srInputs.s)} />
          <ToggleButton label="R" on={srInputs.r} onClick={() => setSrInput('r', !srInputs.r)} />
        </>
      }
      diagram={<SrLatchDiagram vdd={vdd} g1={sr.voltages.G1 ?? 0} g2={sr.voltages.G2 ?? 0} q={sr.q} qBar={sr.qBar} pulseTick={pulseTick} />}
      truthTable={
        <TruthTable
          headers={['S', 'R', 'Q(next)']}
          rows={[
            ['0', '0', 'hold'],
            ['0', '1', '0'],
            ['1', '0', '1'],
            ['1', '1', 'invalid'],
          ]}
        />
      }
    />
  );
}

function DFlipFlopCard() {
  const { vdd, d, dInput, setDInput, pulseD, resetD } = useSequentialStore();
  const [pulseTick, setPulseTick] = useState(0);
  const handlePulse = () => {
    setPulseTick((t) => t + 1);
    pulseD();
  };
  return (
    <FlipFlopShell
      title="D Flip-Flop"
      subtitle="Positive-edge-triggered — master-slave NAND latches"
      q={d.q}
      vdd={vdd}
      onPulse={handlePulse}
      onReset={resetD}
      inputs={<ToggleButton label="D" on={dInput} onClick={() => setDInput(!dInput)} />}
      diagram={<DFlipFlopDiagram vdd={vdd} voltages={d.voltages} pulseTick={pulseTick} />}
      truthTable={
        <TruthTable
          headers={['D', 'Q(next)']}
          rows={[
            ['0', '0'],
            ['1', '1'],
          ]}
        />
      }
    />
  );
}

function JkFlipFlopCard() {
  const { vdd, jk, jkInputs, setJkInput, pulseJk, resetJk } = useSequentialStore();
  const [pulseTick, setPulseTick] = useState(0);
  const handlePulse = () => {
    setPulseTick((t) => t + 1);
    pulseJk();
  };
  return (
    <FlipFlopShell
      title="JK Flip-Flop"
      subtitle="Positive-edge-triggered — master-slave with Q/Q̄ feedback"
      q={jk.q}
      vdd={vdd}
      onPulse={handlePulse}
      onReset={resetJk}
      inputs={
        <>
          <ToggleButton label="J" on={jkInputs.j} onClick={() => setJkInput('j', !jkInputs.j)} />
          <ToggleButton label="K" on={jkInputs.k} onClick={() => setJkInput('k', !jkInputs.k)} />
        </>
      }
      diagram={<JkFlipFlopDiagram vdd={vdd} voltages={jk.voltages} pulseTick={pulseTick} />}
      truthTable={
        <TruthTable
          headers={['J', 'K', 'Q(next)']}
          rows={[
            ['0', '0', 'hold'],
            ['0', '1', '0'],
            ['1', '0', '1'],
            ['1', '1', 'toggle'],
          ]}
        />
      }
    />
  );
}

function TFlipFlopCard() {
  const { vdd, t, tInput, setTInput, pulseT, resetT } = useSequentialStore();
  const [pulseTick, setPulseTick] = useState(0);
  const handlePulse = () => {
    setPulseTick((tick) => tick + 1);
    pulseT();
  };
  return (
    <FlipFlopShell
      title="T Flip-Flop"
      subtitle="Toggle — JK flip-flop with J = K = T"
      q={t.q}
      vdd={vdd}
      onPulse={handlePulse}
      onReset={resetT}
      inputs={<ToggleButton label="T" on={tInput} onClick={() => setTInput(!tInput)} />}
      diagram={<TFlipFlopDiagram vdd={vdd} voltages={t.voltages} pulseTick={pulseTick} />}
      truthTable={
        <TruthTable
          headers={['T', 'Q(next)']}
          rows={[
            ['0', 'hold'],
            ['1', 'toggle'],
          ]}
        />
      }
    />
  );
}
