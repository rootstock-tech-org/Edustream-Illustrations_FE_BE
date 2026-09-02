// GET /api/trends?topic=AI -> rising / falling / new keywords over time.
import { NextResponse } from "next/server";
import { getTrends } from "@/lib/trends";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const topic = (new URL(req.url).searchParams.get("topic") || "").trim();
  if (!topic) return NextResponse.json({ hasHistory: false, rising: [], falling: [], fresh: [], current: [] });
  return NextResponse.json(getTrends(topic));
}
