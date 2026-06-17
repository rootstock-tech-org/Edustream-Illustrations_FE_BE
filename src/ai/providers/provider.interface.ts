export type TutorRole = 'system' | 'user' | 'assistant';

export interface TutorMessage {
  readonly role: TutorRole;
  readonly content: string;
}

export type ReasoningEffort = 'low' | 'high';

/**
 * Provider-agnostic contract for the tutoring LLM. The same Strategy pattern we
 * use for the simulation engine: model choice lives behind this interface, so
 * swapping Groq/gpt-oss-120b for another backend is a one-file change.
 */
export interface TutorProvider {
  readonly id: string;
  /** Stream the assistant reply as text deltas. */
  streamReply(messages: readonly TutorMessage[], effort: ReasoningEffort): AsyncIterable<string>;
}
