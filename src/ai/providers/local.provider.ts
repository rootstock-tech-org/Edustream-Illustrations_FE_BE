import type { TutorProvider, TutorMessage, ReasoningEffort } from './provider.interface';

/**
 * Deterministic fallback used when no GROQ_API_KEY is configured. It does NOT
 * invent physics — it surfaces the grounding context the orchestrator already
 * built from the deterministic engine. This keeps the tutor UI functional
 * offline and demonstrates the provider abstraction degrading gracefully.
 */
export class LocalGroundedProvider implements TutorProvider {
  readonly id = 'local-grounded';

  async *streamReply(messages: readonly TutorMessage[], _effort: ReasoningEffort): AsyncIterable<string> {
    // The grounding message BEGINS with 'CURRENT STATE'; the system prompt only
    // mentions it, so match on the prefix to pick the right one.
    const grounding = messages.find(
      (m) => m.role === 'system' && m.content.trimStart().startsWith('CURRENT STATE'),
    );
    const question = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    const state = grounding?.content.replace(/^CURRENT STATE\s*/, '').trim() ?? 'No active simulation.';

    const reply =
      `(Offline tutor — set GROQ_API_KEY to enable the gpt-oss-120b model.)\n\n` +
      `Here is what the simulator currently shows for your question` +
      (question ? ` "${question.slice(0, 80)}"` : '') +
      `:\n\n${state}`;

    // Stream word-by-word so the UI path is identical to the live provider.
    for (const word of reply.split(' ')) {
      yield word + ' ';
    }
  }
}
