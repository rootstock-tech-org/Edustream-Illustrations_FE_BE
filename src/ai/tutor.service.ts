import type { TutorProvider, TutorMessage, ReasoningEffort } from './providers/provider.interface';
import { GroqProvider } from './providers/groq.provider';
import { LocalGroundedProvider } from './providers/local.provider';
import { SYSTEM_PROMPT } from './prompts';
import { buildGroundingMessage, type TutorSnapshot } from './context.builder';

/**
 * Selects the tutor provider from the environment. With a key, the live
 * Groq/gpt-oss-120b model; without one, the deterministic grounded fallback.
 * Either way the rest of the app is identical — that's the provider abstraction.
 */
export function getTutorProvider(): TutorProvider {
  const key = process.env.GROQ_API_KEY;
  return key ? new GroqProvider(key) : new LocalGroundedProvider();
}

/** Assemble the full message list: system + grounding + history + question. */
export function buildConversation(
  snapshot: TutorSnapshot | null,
  history: readonly TutorMessage[],
  question: string,
): TutorMessage[] {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'system', content: buildGroundingMessage(snapshot) },
    ...history,
    { role: 'user', content: question },
  ];
}

/** Pick reasoning effort: short hint vs deeper explanation. */
export function effortFor(question: string): ReasoningEffort {
  return question.trim().length < 40 ? 'low' : 'high';
}
