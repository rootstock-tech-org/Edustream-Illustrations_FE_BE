// Probe whether a Google News RSS link resolves to the publisher + og:image.
import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
const OG = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i;
const OG2 = /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i;

async function main() {
  const rss = await fetch("https://news.google.com/rss/search?q=cricket&hl=en-US&gl=US&ceid=US:en", {
    headers: { "User-Agent": "NRB/1.0" },
  });
  const data = parser.parse(await rss.text());
  const items = data.rss.channel.item.slice(0, 3);
  for (const it of items) {
    const link = typeof it.link === "string" ? it.link : it.link["#text"];
    try {
      const f = await fetch(link, {
        redirect: "follow",
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
        signal: AbortSignal.timeout(12000),
      });
      const html = await f.text();
      const m = html.match(OG) || html.match(OG2);
      console.log("host:", new URL(f.url).host, "| status:", f.status, "| og:image:", m ? m[1].slice(0, 70) : "NONE", "| html:", html.length);
    } catch (e) {
      console.log("resolve ERR:", e.message);
    }
  }
}
main();
