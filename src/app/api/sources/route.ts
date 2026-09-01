// GET /api/sources?topic=Sports -> the distinct sources covering that topic,
// with the shared learned edits (removed/added) already applied.
import { NextResponse } from "next/server";
import { discoverSources } from "@/lib/sources";
import { getTopicMemory, applyLearned } from "@/lib/memory";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const topic = (params.get("topic") || "").trim();
  const region = params.get("region") || undefined;
  if (!topic) return NextResponse.json({ error: "Missing topic" }, { status: 400 });

  const discovered = await discoverSources(topic, region);
  const countOf = new Map(discovered.map((s) => [s.name, s.count]));

  const mem = getTopicMemory(topic);
  const shownNames = applyLearned(discovered.map((s) => s.name), mem.removedSources, mem.addedSources);
  const sources = shownNames.map((name) => ({ name, count: countOf.get(name) ?? 0 }));

  return NextResponse.json({ topic, count: sources.length, sources });
}
