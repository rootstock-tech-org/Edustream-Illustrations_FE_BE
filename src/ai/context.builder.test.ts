import { describe, it, expect } from 'vitest';
import { buildGroundingMessage, type TutorSnapshot } from './context.builder';

const snapshot: TutorSnapshot = {
  deviceName: 'CMOS Inverter',
  conceptIds: ['threshold-voltage', 'switching-threshold'],
  params: [{ label: 'Supply Voltage (VDD)', value: '1.8' }],
  outputs: [{ label: 'Output Voltage', value: '1.79 V' }],
  regions: [{ id: 'MN', region: 'cutoff' }],
};

describe('tutor grounding context', () => {
  it('embeds the authoritative state and resolved concept notes', () => {
    const msg = buildGroundingMessage(snapshot);
    expect(msg).toContain('CURRENT STATE');
    expect(msg).toContain('CMOS Inverter');
    expect(msg).toContain('Output Voltage: 1.79 V');
    expect(msg).toContain('MN: cutoff');
    // Concept ids are expanded to their glossary prose (grounding, not guessing).
    expect(msg).toContain('Threshold Voltage');
    expect(msg).toContain('Switching Threshold');
  });

  it('handles a missing simulation safely', () => {
    expect(buildGroundingMessage(null)).toContain('No active simulation');
  });
});
