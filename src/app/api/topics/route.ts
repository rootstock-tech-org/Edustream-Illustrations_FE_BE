// Saved topic searches.
//   GET    /api/topics            -> list saved topics
//   POST   /api/topics { ... }    -> save (or update) a topic, return list
//   DELETE /api/topics?id=<id>    -> remove a topic, return list
import { NextResponse } from "next/server";
import { listTopics, saveTopic, deleteTopic } from "@/lib/savedTopics";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ topics: listTopics() });
}

export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as
    | { topic?: string; region?: string; sources?: string[]; keywords?: string[] }
    | null;
  const topic = b?.topic?.trim();
  if (!topic) return NextResponse.json({ error: "topic required" }, { status: 400 });
  const topics = saveTopic({
    topic,
    region: typeof b?.region === "string" ? b.region : "IN",
    sources: Array.isArray(b?.sources) ? b.sources : [],
    keywords: Array.isArray(b?.keywords) ? b.keywords : [],
  });
  return NextResponse.json({ topics });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id") || "";
  return NextResponse.json({ topics: deleteTopic(id) });
}
