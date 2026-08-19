// One-off probe: check candidate RSS feeds for reachability + item count.
// Keep only the ones that return a healthy count; set the rest on:false.
const CANDIDATES: Record<string, string> = {
  "EEJournal": "https://www.eejournal.com/feed/",
  "Semiconductor Today": "https://www.semiconductor-today.com/news_rss.xml",
  "Cadence Blogs": "https://community.cadence.com/cadence_blogs_8/b/blogs/rss",
  "Synopsys Chip Design Blog": "https://www.synopsys.com/blogs/chip-design/feed/",
  "Siemens Verification Horizons": "https://blogs.sw.siemens.com/verificationhorizons/feed/",
  "Siemens EDA Blog": "https://blogs.sw.siemens.com/semiconductor-manufacturing/feed/",
  "Fabricated Knowledge": "https://www.fabricatedknowledge.com/feed",
  "ChipStrat": "https://www.chipstrat.com/feed",
  "HPCwire": "https://www.hpcwire.com/feed/",
  "The Register (retry)": "https://www.theregister.com/headlines.atom",
  "Electronics360": "https://electronics360.globalspec.com/rss/all",
  "AnandTech": "https://www.anandtech.com/rss/",
  "TechInsights": "https://www.techinsights.com/rss.xml",
  "IEEE Spectrum Computing": "https://spectrum.ieee.org/feeds/topic/computing.rss",
  "EDN Design": "https://www.edn.com/category/design/feed/",
  "Design And Reuse (retry)": "https://www.design-reuse.com/news/rss/",
};

async function probe(name: string, url: string) {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) VLSINewsBot/1.0", accept: "application/rss+xml,application/xml,text/xml,*/*" },
      signal: AbortSignal.timeout(12000),
    });
    const text = await res.text();
    const items = (text.match(/<item[\s>]/g) || []).length;
    const entries = (text.match(/<entry[\s>]/g) || []).length;
    const looksHtml = /<!doctype html|client challenge/i.test(text.slice(0, 400));
    console.log(`${res.status}  items=${items} entries=${entries}${looksHtml ? " [HTML/challenge]" : ""}  ${name}`);
  } catch (e) {
    console.log(`ERR  ${name}  -> ${(e as Error).message}`);
  }
}

(async () => {
  for (const [name, url] of Object.entries(CANDIDATES)) {
    await probe(name, url);
  }
})();
