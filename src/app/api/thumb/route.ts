// GET /api/thumb?q=<term> -> redirects to a topical photo from Pexels (reliable,
// free tier). Needs PEXELS_API_KEY in .env. Results are cached in memory by
// term. If there is no key or nothing is found, returns 404 so the card falls
// back to its gradient tile.
const cache = new Map<string, { url: string | null; at: number }>();
const TTL = 24 * 60 * 60 * 1000;

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") || "").trim();
  if (!q) return new Response(null, { status: 400 });

  const key = process.env.PEXELS_API_KEY;
  if (!key) return new Response(null, { status: 404 }); // no key -> tile fallback

  const cacheKey = q.toLowerCase();
  const hit = cache.get(cacheKey);
  let url: string | null;

  if (hit && Date.now() - hit.at < TTL) {
    url = hit.url;
  } else {
    url = null;
    try {
      const r = await fetch(
        `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=1&orientation=landscape`,
        { headers: { Authorization: key }, signal: AbortSignal.timeout(8000) }
      );
      if (r.ok) {
        const j = await r.json();
        const photo = j.photos?.[0];
        url = photo?.src?.landscape || photo?.src?.medium || photo?.src?.large || null;
      }
    } catch {
      url = null;
    }
    cache.set(cacheKey, { url, at: Date.now() });
  }

  if (!url) return new Response(null, { status: 404 });
  return new Response(null, {
    status: 302,
    headers: { Location: url, "Cache-Control": "public, max-age=86400" },
  });
}
