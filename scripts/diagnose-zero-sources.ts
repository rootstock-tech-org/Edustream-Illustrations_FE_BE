// Why did these ON sources contribute 0 kept articles? Fetch each, count raw
// items, and see how many even TAG to a module (untagged => dropped as off-topic).
import { tagArticle } from "../lib/tag";

const FEEDS: Record<string, string> = {
  "TechXplore": "https://techxplore.com/rss-feed/semiconductors-news/",
  "Electropages": "https://www.electropages.com/rss",
  "EEJournal": "https://www.eejournal.com/feed/",
  "EDN – Design": "https://www.edn.com/category/design/feed/",
};

function strip(s: string) {
  return s.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

(async () => {
  for (const [name, url] of Object.entries(FEEDS)) {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": "Mozilla/5.0 VLSINewsBot/1.0", accept: "application/rss+xml,application/xml,*/*" },
        signal: AbortSignal.timeout(15000),
      });
      const xml = await res.text();
      const blocks = xml.split(/<item[\s>]/).slice(1);
      let tagged = 0;
      const sample: string[] = [];
      for (const b of blocks) {
        const t = strip((b.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "");
        const d = strip((b.match(/<description>([\s\S]*?)<\/description>/) || [])[1] || "");
        const tag = tagArticle(t, d);
        if (tag) tagged++;
        else if (sample.length < 4) sample.push(t.slice(0, 70));
      }
      console.log(`\n${name}  [HTTP ${res.status}]  raw items=${blocks.length}  tagged=${tagged}`);
      if (sample.length) console.log("  untagged samples: " + sample.map((s) => `"${s}"`).join(" | "));
    } catch (e) {
      console.log(`\n${name}  FETCH ERROR: ${(e as Error).message}`);
    }
  }
})();
