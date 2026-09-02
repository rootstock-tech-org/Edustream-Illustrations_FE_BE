// GET /api/news -> the final dashboard news, built from the saved config.yaml.
import { NextResponse } from "next/server";
import { readConfig } from "@/lib/config";
import { buildDashboardNews } from "@/lib/dashboard";
import { recordSnapshot, countKeywords } from "@/lib/trends";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const when = new URL(req.url).searchParams.get("when") || undefined;
  const cfg = readConfig();
  if (!cfg.topic) return NextResponse.json({ error: "No topic set" }, { status: 400 });
  const items = await buildDashboardNews(cfg, 100, when);
  recordSnapshot(cfg.topic, countKeywords(items.map((i) => i.headline)));
  return NextResponse.json({ topic: cfg.topic, region: cfg.region, sources: cfg.sources, keywords: cfg.keywords, count: items.length, items });
}
