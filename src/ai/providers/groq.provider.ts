import OpenAI from 'openai';
import type { TutorProvider, TutorMessage, ReasoningEffort } from './provider.interface';

/**
 * Groq-hosted gpt-oss-120b via the OpenAI-compatible API. Reasoning effort is
 * mapped to gpt-oss's effort control: 'low' for fast inline hints, 'high' for
 * Socratic dialogue. Groq's throughput keeps both responsive.
 */
export class GroqProvider implements TutorProvider {
  readonly id = 'groq-gpt-oss-120b';
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(apiKey: string, model = 'openai/gpt-oss-120b') {
    this.client = new OpenAI({ apiKey, baseURL: 'https://api.groq.com/openai/v1' });
    this.model = model;
  }

  async *streamReply(messages: readonly TutorMessage[], effort: ReasoningEffort): AsyncIterable<string> {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: messages as { role: TutorMessage['role']; content: string }[],
      stream: true,
      temperature: effort === 'high' ? 0.4 : 0.2,
      // gpt-oss exposes reasoning effort; passed through the compatible field.
      reasoning_effort: effort === 'high' ? 'high' : 'low',
    } as Parameters<typeof this.client.chat.completions.create>[0]);

    for await (const chunk of stream as AsyncIterable<{ choices: { delta?: { content?: string } }[] }>) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
  }
}
