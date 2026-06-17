import { describe, it, expect } from 'vitest';
import { LocalGroundedProvider } from './local.provider';
import { SYSTEM_PROMPT } from '../prompts';
import { buildGroundingMessage } from '../context.builder';
import type { TutorMessage } from './provider.interface';

async function collect(it: AsyncIterable<string>): Promise<string> {
  let out = '';
  for await (const chunk of it) out += chunk;
  return out;
}

describe('LocalGroundedProvider', () => {
  it('surfaces the grounding state, not the system prompt (regression)', async () => {
    const messages: TutorMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT }, // also mentions "CURRENT STATE"
      {
        role: 'system',
        content: buildGroundingMessage({
          deviceName: 'CMOS Inverter',
          conceptIds: [],
          params: [],
          outputs: [{ label: 'Output Voltage', value: '1.79 V' }],
          regions: [{ id: 'MN', region: 'cutoff' }],
        }),
      },
      { role: 'user', content: 'Why is the output high?' },
    ];

    const reply = await collect(new LocalGroundedProvider().streamReply(messages, 'low'));
    expect(reply).toContain('Output Voltage: 1.79 V');
    expect(reply).not.toContain('GROUNDING RULES'); // must not leak the system prompt
  });
});
