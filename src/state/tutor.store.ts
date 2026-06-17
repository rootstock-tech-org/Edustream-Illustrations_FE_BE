import { create } from 'zustand';
import { formatQuantity } from '@/domain/units';
import { getDevice } from '@/domain/devices/registry';
import { getConcept } from '@/domain/education/concepts';
import type { TutorSnapshot } from '@/ai/context.builder';
import { useDeviceStore } from './device.store';
import { useSimulationStore } from './simulation.store';

export interface ChatMessage {
  readonly role: 'user' | 'assistant';
  content: string;
}

interface TutorStore {
  messages: ChatMessage[];
  streaming: boolean;
  ask: (question: string) => Promise<void>;
}

/** Build a compact, grounded snapshot from the current device + result. */
function buildSnapshot(): TutorSnapshot | null {
  const { deviceId, values } = useDeviceStore.getState();
  const result = useSimulationStore.getState().result;
  if (!result) return null;
  const device = getDevice(deviceId);

  const params = device.parameterSchema.groups
    .flatMap((g) => g.parameters)
    .map((p) => ({ label: p.label, value: String(values[p.key] ?? '') }));

  const op = result.operatingPoint;
  const m = result.metrics;
  const outputs = [
    { label: 'Output Voltage', value: formatQuantity(op.outputVoltage.quantity) },
    { label: 'Through Current', value: formatQuantity(op.current.quantity) },
    { label: 'Total Power', value: formatQuantity(m.totalPower.quantity) },
    { label: 'Leakage', value: formatQuantity(m.leakage.quantity) },
    { label: 'Propagation Delay', value: formatQuantity(m.propagationDelay.quantity) },
    { label: 'Switching Threshold', value: formatQuantity(m.switchingThreshold.quantity) },
  ];
  const regions = op.transistors.map((t) => ({ id: t.id, region: t.region }));

  const conceptIds = Array.from(
    new Set(
      [device.conceptId, 'switching-threshold', 'propagation-delay', 'subthreshold-conduction']
        .filter((id) => getConcept(id)),
    ),
  );

  return { deviceName: device.name, conceptIds, params, outputs, regions };
}

export const useTutorStore = create<TutorStore>((set, get) => ({
  messages: [],
  streaming: false,
  ask: async (question) => {
    const history = get().messages.map((m) => ({ role: m.role, content: m.content }));
    set((s) => ({
      messages: [...s.messages, { role: 'user', content: question }, { role: 'assistant', content: '' }],
      streaming: true,
    }));

    try {
      const res = await fetch('/api/tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshot: buildSnapshot(), history, question }),
      });
      if (!res.body) throw new Error('No response stream');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        set((s) => {
          const messages = s.messages.slice();
          const last = messages[messages.length - 1];
          if (last && last.role === 'assistant') last.content += text;
          return { messages };
        });
      }
    } catch (err) {
      set((s) => {
        const messages = s.messages.slice();
        const last = messages[messages.length - 1];
        if (last && last.role === 'assistant') {
          last.content = `Sorry — the tutor is unavailable (${err instanceof Error ? err.message : 'error'}).`;
        }
        return { messages };
      });
    } finally {
      set({ streaming: false });
    }
  },
}));
