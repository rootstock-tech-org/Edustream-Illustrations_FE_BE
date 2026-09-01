// GET /api/suggest?q=stock -> Google's search autocomplete suggestions.
// Proxied server-side so the browser does not hit CORS.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") || "").trim();
  if (!q) return NextResponse.json({ suggestions: [] });
  try {
    const r = await fetch(
      `https://suggestqueries.google.com/complete/search?client=firefox&hl=en&q=${encodeURIComponent(q)}`,
      { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(6000) }
    );
    const text = await r.text();
    const parsed = JSON.parse(text); // ["q", ["suggestion", ...]]
    const suggestions: string[] = Array.isArray(parsed?.[1]) ? parsed[1].slice(0, 7) : [];
    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json({ suggestions: [] });
  }
}
