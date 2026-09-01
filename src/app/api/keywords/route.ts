// GET /api/keywords?topic=Sports -> suggested keywords from the topic's news,
// with the shared learned edits (removed/added) already applied.
import { NextResponse } from "next/server";
import { suggestKeywords } from "@/lib/keywords";
import { getTopicMemory, applyLearned } from "@/lib/memory";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const topic = (params.get("topic") || "").trim();
  const region = params.get("region") || undefined;
  if (!topic) return NextResponse.json({ error: "Missing topic" }, { status: 400 });

  const suggested = await suggestKeywords(topic, region);
  const countOf = new Map(suggested.map((k) => [k.word, k.count]));

  const mem = getTopicMemory(topic);
  const shownWords = applyLearned(suggested.map((k) => k.word), mem.removedKeywords, mem.addedKeywords);
  const keywords = shownWords.map((word) => ({ word, count: countOf.get(word) ?? 0 }));

  return NextResponse.json({ topic, count: keywords.length, keywords });
}
