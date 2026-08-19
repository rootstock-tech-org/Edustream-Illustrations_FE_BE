// Trusted VLSI / semiconductor news sources.
// tier 1 = technical / educational / source-of-truth (ranked highest)
// tier 2 = solid industry news
// Add a new source = add one line. Turn off = set on:false. Change trust = edit tier.

export type Source = {
  name: string;
  feed: string; // RSS/Atom feed URL
  tier: 1 | 2;
  on: boolean;
};

export const SOURCES: Source[] = [
  // ---- Tier 1: technical / educational ----
  { name: "Semiconductor Engineering", feed: "https://semiengineering.com/feed/", tier: 1, on: true },
  { name: "IEEE Spectrum – Semiconductors", feed: "https://spectrum.ieee.org/feeds/topic/semiconductors.rss", tier: 1, on: true },
  { name: "SemiWiki", feed: "https://www.semiwiki.com/feed/", tier: 1, on: true },
  { name: "WikiChip Fuse", feed: "https://fuse.wikichip.org/feed/", tier: 1, on: false }, // off: whole domain unreachable from here (connection refused)
  { name: "All About Circuits – News", feed: "https://www.allaboutcircuits.com/rss/news/", tier: 1, on: false }, // off: HTTP 403 bot-block
  { name: "Nature Electronics", feed: "https://www.nature.com/natelectron.rss", tier: 1, on: false }, // off: bot-challenge (returns "Client Challenge" HTML, not RSS)
  { name: "ScienceDaily – Semiconductors", feed: "https://www.sciencedaily.com/rss/matter_energy/semiconductors.xml", tier: 1, on: false }, // off: HTTP 404
  { name: "Phys.org – Semiconductors", feed: "https://phys.org/rss-feed/technology-news/semiconductors/", tier: 1, on: true },
  { name: "TechXplore – Semiconductors", feed: "https://techxplore.com/rss-feed/semiconductors-news/", tier: 1, on: true },
  { name: "Design & Reuse", feed: "https://www.design-reuse.com/rss/news.xml", tier: 1, on: false }, // off: HTTP 404
  { name: "Nature Nanotechnology", feed: "https://www.nature.com/nnano.rss", tier: 1, on: false }, // off: bot-challenge (returns "Client Challenge" HTML, not RSS)
  { name: "3DInCites (packaging)", feed: "https://www.3dincites.com/feed/", tier: 1, on: true },
  { name: "Semiconductor Digest", feed: "https://www.semiconductor-digest.com/feed/", tier: 1, on: true },
  { name: "MIT News – Nanotech", feed: "https://news.mit.edu/rss/topic/nanotech", tier: 1, on: true },
  { name: "SemiAnalysis", feed: "https://www.semianalysis.com/feed", tier: 1, on: true },
  { name: "The Chip Letter", feed: "https://thechipletter.substack.com/feed", tier: 1, on: true },
  { name: "Electronic Design", feed: "https://www.electronicdesign.com/rss.xml", tier: 1, on: true },
  { name: "Fabricated Knowledge", feed: "https://www.fabricatedknowledge.com/feed", tier: 1, on: true },
  { name: "TechInsights", feed: "https://www.techinsights.com/rss.xml", tier: 1, on: true },
  { name: "Siemens Verification Horizons", feed: "https://blogs.sw.siemens.com/verificationhorizons/feed/", tier: 1, on: true },
  { name: "IEEE Spectrum – Computing", feed: "https://spectrum.ieee.org/feeds/topic/computing.rss", tier: 1, on: true },

  // ---- Tier 2: industry news ----
  { name: "EE Times", feed: "https://www.eetimes.com/feed/", tier: 2, on: true },
  { name: "EE News Europe", feed: "https://www.eenewseurope.com/en/feed/", tier: 2, on: true },
  { name: "ELE Times", feed: "https://www.eletimes.com/feed", tier: 2, on: true },
  { name: "Tom's Hardware", feed: "https://www.tomshardware.com/feeds/all", tier: 2, on: true },
  { name: "The Register – Hardware", feed: "https://www.theregister.com/hardware/headlines.atom", tier: 2, on: false }, // off: HTTP 404
  { name: "DIGITIMES", feed: "https://www.digitimes.com/rss/daily.xml", tier: 2, on: true },
  { name: "Electronics Weekly", feed: "https://www.electronicsweekly.com/feed/", tier: 2, on: true },
  { name: "Embedded.com", feed: "https://www.embedded.com/feed/", tier: 2, on: true },
  { name: "EDN", feed: "https://www.edn.com/feed/", tier: 2, on: true },
  { name: "The Next Platform", feed: "https://www.nextplatform.com/feed/", tier: 2, on: true },
  { name: "TechPowerUp", feed: "https://www.techpowerup.com/rss/news", tier: 2, on: true },
  { name: "Power Electronics News", feed: "https://www.powerelectronicsnews.com/feed/", tier: 2, on: true },
  { name: "Electropages", feed: "https://www.electropages.com/rss", tier: 2, on: false }, // off: reachable but distributor/product-PR content, ~0 VLSI-relevant
  { name: "EEJournal", feed: "https://www.eejournal.com/feed/", tier: 2, on: false }, // off: reachable but content skews to distributor PR / analog, ~0 VLSI-relevant
  { name: "ChipStrat", feed: "https://www.chipstrat.com/feed", tier: 2, on: true },
  { name: "EDN – Design", feed: "https://www.edn.com/category/design/feed/", tier: 2, on: false }, // off: reachable but mostly analog/instrumentation, ~0 VLSI-relevant
  { name: "The Register", feed: "https://www.theregister.com/headlines.atom", tier: 2, on: true },
];

// The "no faaltu" filter: drop anything from these pure-finance domains,
// no matter what it says. These flooded the old feed with stock noise.
export const BLOCKED_DOMAINS: string[] = [
  // pure stock / trading / finance
  "tradingview.com",
  "simplywall.st",
  "moomoo.com",
  "finance.yahoo.com",
  "fool.com",
  "marketscreener.com",
  "scanx.trade",
  "pluang.com",
  "benzinga.com",
  "zacks.com",
  "investing.com",
  "seekingalpha.com",
  "tipranks.com",
  "barrons.com",
  "businessinsider.com",
  "markets.businessinsider.com",
  "nasdaq.com",
  "marketbeat.com",
  "stocktwits.com",
  "247wallst.com",
  "gurufocus.com",
  "finbold.com",
  "stocktitan.net",
  "streetinsider.com",
  "insidermonkey.com",
  "kalkinemedia.com",
  "moneycontrol.com",
  "tradingkey.com",
  // market-research report spam ("market to reach $X by 2035")
  "indexbox.io",
  "marketsandmarkets.com",
  "futuremarketinsights.com",
  "snsinsider.com",
  "grandviewresearch.com",
  "fortunebusinessinsights.com",
  "researchandmarkets.com",
  "precedenceresearch.com",
  "alliedmarketresearch.com",
];

// Words that mark an article as stock/market noise (pushes score down / drops it).
export const NOISE_WORDS: string[] = [
  "stock", "shares", "share price", "price target", "earnings", "valuation",
  "market cap", "buy rating", "sell rating", "downgrade", "upgrade to buy",
  "dividend", "hedge fund", "s&p 500", "nasdaq", "quarterly results",
  "analyst", "stock forecast", "portfolio", "investor", "bond sale",
  "wall street", "mutual fund", "IPO valuation", "trades up", "trades down",
  // market-research report spam
  "market size", "market to reach", "CAGR", "market forecast", "market outlook",
  "market research", "revenue forecast", "growth analysis report", "market report",
  // price / commodity market moves (not engineering)
  "prices climb", "price surge", "price hike", "prices soar", "price war",
  "prices rise", "prices jump", "price gouging",
  // consumer retail / gaming (not VLSI engineering)
  "best buy", "on sale", "drops to $", "gaming monitor", "gaming laptop",
  "gaming pc", "mechanical keyboard", "motherboard",
  "pc building", "prebuilt", "gaming desktop", "discount on", "% off", "save $",
  "best deal", "deals of", "graphics card deal",
  // medical / life-science (off-topic false positives, e.g. "carbon nanotube" biosensors)
  "cancer", "tumor", "tumour",
  // pure-math / non-hardware (e.g. "formal verification" of a math theorem)
  "mathematics proof", "math proof", "theorem",
  // market-hype phrasing
  "% surge", "market to hit",
];

// Words that hint an article is a rumour / opinion (small penalty).
export const RUMOR_WORDS: string[] = [
  "reportedly", "rumor", "rumour", "could", "may invest", "is said to", "allegedly",
];
