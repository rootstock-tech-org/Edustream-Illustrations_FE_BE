// Public API for the "Do You Know?" lecture ticker. Given a curriculum module id
// (?module=cmos) or an AVSAR global topic number (?topic=33), returns that
// module's latest news as JSON. CORS-open so the AVSAR lecture page can fetch it.
import type { NextRequest } from "next/server";
import { getNews } from "../../../../lib/getNews";
import { moduleForTopic } from "../../../../data/lectures";

export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Small stable id from the link, so the widget can deep-link/highlight later.
function idFor(link: string): string {
  let h = 0;
  for (let i = 0; i < link.length; i++) h = (h * 31 + link.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const moduleParam = searchParams.get("module");
  const topicParam = searchParams.get("topic");
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "6", 10) || 6, 1), 20);

  let moduleId = moduleParam || null;
  if (!moduleId && topicParam) moduleId = moduleForTopic(parseInt(topicParam, 10));

  const store = getNews();
  let items = store.articles;
  if (moduleId) items = items.filter((a) => a.moduleId === moduleId);

  // Latest first, so the ticker leads with the freshest headline.
  items = [...items]
    .sort((a, b) => (Date.parse(b.publishedAt || "") || 0) - (Date.parse(a.publishedAt || "") || 0))
    .slice(0, limit);

  const payload = {
    module: moduleId,
    topic: topicParam ? Number(topicParam) : null,
    generatedAt: store.generatedAt,
    count: items.length,
    items: items.map((a) => ({
      id: idFor(a.link),
      title: a.title,
      link: a.link,
      source: a.source,
      sourceCount: a.sourceCount,
      image: a.image,
      publishedAt: a.publishedAt,
    })),
  };

  return Response.json(payload, { headers: CORS });
}
