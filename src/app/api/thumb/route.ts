import { NextRequest } from "next/server";

// Resolves a REAL article thumbnail for feeds that ship no image: read the
// publisher page's og:image, then a topical Openverse/Microlink photo, and
// finally a generated branded tile so a card is never empty. (Ported from the
// old app; the Google-News URL-decode step is dropped because our feeds link
// straight to the publisher.)
export const dynamic = "force-dynamic";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8";

function xmlEsc(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : c === "'" ? "&apos;" : "&quot;"
  );
}

const KEYWORDS = [
  "GlobalFoundries", "Tata Electronics", "SK Hynix", "Semiconductor", "Lithography",
  "Transistor", "Packaging", "Foundry", "Chiplet", "MOSFET", "FinFET", "Wafer",
  "Qualcomm", "Broadcom", "Synopsys", "Cadence", "Samsung", "NVIDIA", "Micron",
  "Intel", "ASML", "TSMC", "IBM", "AMD", "CMOS", "EUV", "HBM", "DDR5",
  "2nm", "3nm", "5nm", "GPU", "AI chip", "fab",
];

function pickKeyword(title: string, fallback: string): string {
  const t = title.toLowerCase();
  for (const k of KEYWORDS) if (t.includes(k.toLowerCase())) return k;
  return fallback || "Semiconductor";
}

// Generated tile: accent circuit motif + a topic keyword from the title.
function placeholder(accent: string, keyword: string) {
  const kw = xmlEsc(keyword);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="225"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${accent}" stop-opacity="0.85"/><stop offset="0.6" stop-color="${accent}" stop-opacity="0.25"/><stop offset="1" stop-color="#0b0f16" stop-opacity="1"/></linearGradient></defs><rect width="100%" height="100%" fill="#0d1117"/><rect width="100%" height="100%" fill="url(#g)"/><g stroke="#ffffff" stroke-opacity="0.18" stroke-width="1.5" fill="none"><path d="M0 46 H120 M150 46 H400"/><path d="M0 186 H84 M114 186 H400"/><path d="M320 0 V70 M320 96 V225"/><circle cx="135" cy="46" r="5"/><circle cx="99" cy="186" r="5"/><circle cx="320" cy="83" r="5"/><rect x="286" y="150" width="34" height="34" rx="4"/></g><text x="26" y="122" font-family="Segoe UI, Arial, sans-serif" font-size="30" font-weight="700" fill="#ffffff">${kw}</text><text x="26" y="150" font-family="Segoe UI, Arial, sans-serif" font-size="12" font-weight="500" fill="#ffffff" fill-opacity="0.7">AVSAR · VLSI News</text></svg>`;
  return new Response(svg, {
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" },
  });
}

async function readHead(res: Response, max: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return await res.text();
  const dec = new TextDecoder();
  let out = "";
  while (out.length < max) {
    const { done, value } = await reader.read();
    if (done) break;
    out += dec.decode(value, { stream: true });
  }
  try {
    await reader.cancel();
  } catch {}
  return out;
}

async function ogImage(url: string, signal: AbortSignal): Promise<string | null> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: ACCEPT }, redirect: "follow", signal });
  const t = await readHead(res, 250000);
  const m =
    t.match(/property=["']og:image(?::url|:secure_url)?["'][^>]*content=["']([^"']+)["']/i) ||
    t.match(/content=["']([^"']+)["'][^>]*property=["']og:image["']/i) ||
    t.match(/name=["']twitter:image(?::src)?["'][^>]*content=["']([^"']+)["']/i) ||
    t.match(/content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i) ||
    t.match(/itemprop=["']image["'][^>]*content=["']([^"']+)["']/i) ||
    t.match(/rel=["']image_src["'][^>]*href=["']([^"']+)["']/i);
  let img = m?.[1];
  if (!img) return null;
  img = img.replace(/&amp;/g, "&").trim();
  if (img.startsWith("//")) img = "https:" + img;
  else if (img.startsWith("/")) {
    try {
      img = new URL(img, url).href;
    } catch {}
  }
  return /^https?:\/\//.test(img) ? img : null;
}

async function openverseImage(keyword: string, signal: AbortSignal): Promise<string | null> {
  const queries = [`${keyword} semiconductor`, "semiconductor microchip wafer"];
  for (const q of queries) {
    try {
      const api = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=8&aspect_ratio=wide&mature=false`;
      const res = await fetch(api, { headers: { Accept: "application/json", "User-Agent": UA }, signal });
      if (!res.ok) continue;
      const data = (await res.json()) as { results?: { url?: string; thumbnail?: string }[] };
      const list = (data?.results || []).filter((r) => r.thumbnail || r.url);
      if (list.length) return list[0].thumbnail || list[0].url || null;
    } catch {
      // try next query
    }
  }
  return null;
}

type Resolved = { img: string | null; at: number };
const RESOLVE_CACHE = new Map<string, Resolved>();
const RESOLVE_TTL = 6 * 60 * 60 * 1000; // 6h

async function resolveImage(u: string, keyword: string, signal: AbortSignal): Promise<string | null> {
  const hit = RESOLVE_CACHE.get(u);
  if (hit && Date.now() - hit.at < RESOLVE_TTL) return hit.img;

  let img: string | null = null;
  try {
    img = await ogImage(u, signal);
  } catch {
    // no publisher image; try the topical fallback
  }
  if (!img) {
    const oc = new AbortController();
    const ot = setTimeout(() => oc.abort(), 6000);
    try {
      img = await openverseImage(keyword, oc.signal);
    } finally {
      clearTimeout(ot);
    }
  }
  RESOLVE_CACHE.set(u, { img, at: Date.now() });
  return img;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const u = searchParams.get("u") || "";
  const accent = searchParams.get("a") || "#22d3ee";
  const keyword = pickKeyword(searchParams.get("t") || "", searchParams.get("c") || "");
  if (!u || searchParams.get("ph")) return placeholder(accent, keyword);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const img = await resolveImage(u, keyword, ctrl.signal);
    if (img) {
      return new Response(null, {
        status: 302,
        headers: { Location: img, "Cache-Control": "public, max-age=86400" },
      });
    }
  } catch {
    // fall through to tile
  } finally {
    clearTimeout(timer);
  }
  return placeholder(accent, keyword);
}
