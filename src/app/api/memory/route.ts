// POST /api/memory { topic, kind: "sources"|"keywords", shown: [], selected: [] }
// Records what the user was shown vs what they kept, so the shared per-topic
// memory learns the removed/added edits (latest-wins).
import { NextResponse } from "next/server";
import { updateMemory } from "@/lib/memory";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { topic?: string; kind?: "sources" | "keywords"; shown?: string[]; selected?: string[] }
    | null;

  const topic = body?.topic?.trim();
  const kind = body?.kind;
  if (!topic || (kind !== "sources" && kind !== "keywords")) {
    return NextResponse.json({ error: "topic and kind required" }, { status: 400 });
  }

  const shown = Array.isArray(body?.shown) ? body!.shown : [];
  const selected = Array.isArray(body?.selected) ? body!.selected : [];
  updateMemory(topic, kind, shown, selected);
  return NextResponse.json({ ok: true });
}
