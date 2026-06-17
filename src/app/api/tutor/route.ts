import type { NextRequest } from 'next/server';
import { getTutorProvider, buildConversation, effortFor } from '@/ai/tutor.service';
import type { TutorMessage } from '@/ai/providers/provider.interface';
import type { TutorSnapshot } from '@/ai/context.builder';

// Node runtime: the provider SDK and API key must never run on the client.
export const runtime = 'nodejs';

interface TutorRequestBody {
  snapshot: TutorSnapshot | null;
  history: TutorMessage[];
  question: string;
}

export async function POST(req: NextRequest): Promise<Response> {
  const { snapshot, history, question } = (await req.json()) as TutorRequestBody;
  const provider = getTutorProvider();
  const messages = buildConversation(snapshot, history ?? [], question ?? '');
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const delta of provider.streamReply(messages, effortFor(question ?? ''))) {
          controller.enqueue(encoder.encode(delta));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown error';
        controller.enqueue(encoder.encode(`\n\n[tutor error: ${message}]`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' },
  });
}
