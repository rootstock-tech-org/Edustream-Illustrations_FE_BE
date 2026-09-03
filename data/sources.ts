// Trusted Human-Robot Collaboration (HRC) / robotics news sources.
// tier 1 = technical / research / source-of-truth (ranked highest)
// tier 2 = solid industry / tech news
// Add a new source = add one line. Turn off = set on:false. Change trust = edit tier.
// on/off below reflects a live reachability probe (2026-09-03): feeds that return
// HTTP 403/404 or a bot-challenge to a direct server fetch are set on:false.

export type Source = {
  name: string;
  feed: string; // RSS/Atom feed URL
  tier: 1 | 2;
  on: boolean;
};

export const SOURCES: Source[] = [
  // ---- Tier 1: technical / research ----
  { name: "The Robot Report", feed: "https://www.therobotreport.com/feed/", tier: 1, on: true },
  { name: "IEEE Spectrum – Robotics", feed: "https://spectrum.ieee.org/feeds/topic/robotics.rss", tier: 1, on: true },
  { name: "IEEE Spectrum – AI", feed: "https://spectrum.ieee.org/feeds/topic/artificial-intelligence.rss", tier: 1, on: true },
  { name: "Robohub", feed: "https://robohub.org/feed/", tier: 1, on: true },
  { name: "TechXplore – Robotics", feed: "https://techxplore.com/rss-feed/robotics-news/", tier: 1, on: true },
  { name: "Science Robotics", feed: "https://www.science.org/action/showFeed?type=etoc&feed=rss&jc=scirobotics", tier: 1, on: true },
  { name: "MIT News – AI & Robotics", feed: "https://news.mit.edu/rss/topic/artificial-intelligence2", tier: 1, on: true },
  { name: "ScienceDaily – Robotics", feed: "https://www.sciencedaily.com/rss/computers_math/robotics.xml", tier: 1, on: true },
  { name: "NVIDIA Blog", feed: "https://blogs.nvidia.com/feed/", tier: 1, on: true },
  { name: "Hackaday", feed: "https://hackaday.com/blog/feed/", tier: 1, on: true },
  { name: "The Engineer", feed: "https://www.theengineer.co.uk/feed/", tier: 1, on: false }, // off: HTTP 403 bot-block (still appears via aggregation)
  { name: "Automation World", feed: "https://www.automationworld.com/rss.xml", tier: 1, on: false }, // off: HTTP 404 (no public feed path found)
  { name: "Assembly Magazine", feed: "https://www.assemblymag.com/rss/articles", tier: 1, on: false }, // off: HTTP 403 bot-block

  // ---- Tier 2: industry / tech news / drones ----
  { name: "TechCrunch – Robotics", feed: "https://techcrunch.com/tag/robotics/feed/", tier: 2, on: true },
  { name: "New Atlas – Robotics", feed: "https://newatlas.com/robotics/index.rss", tier: 2, on: true },
  { name: "The Verge", feed: "https://www.theverge.com/rss/index.xml", tier: 2, on: true },
  { name: "Ars Technica", feed: "https://feeds.arstechnica.com/arstechnica/index", tier: 2, on: true },
  { name: "Interesting Engineering", feed: "https://interestingengineering.com/feed", tier: 2, on: true },
  { name: "EE Times", feed: "https://www.eetimes.com/feed/", tier: 2, on: true },
  { name: "Manufacturing Dive", feed: "https://www.manufacturingdive.com/feeds/news/", tier: 2, on: true },
  { name: "DroneLife", feed: "https://dronelife.com/feed/", tier: 2, on: true },
  { name: "DroneDJ", feed: "https://dronedj.com/feed/", tier: 2, on: true },
  { name: "Commercial UAV News", feed: "https://www.commercialuavnews.com/rss.xml", tier: 2, on: false }, // off: HTTP 404
  { name: "Automation.com", feed: "https://www.automation.com/en-us/rss", tier: 2, on: false }, // off: HTTP 403 bot-block
  { name: "Unmanned Systems Technology", feed: "https://www.unmannedsystemstechnology.com/feed/", tier: 2, on: false }, // off: HTTP 403 bot-block
  { name: "Robotics 24/7", feed: "https://www.robotics247.com/rss", tier: 2, on: false }, // off: empty feed
];

// The "no faaltu" filter: drop anything from these pure-finance domains,
// no matter what it says. Robotics companies attract stock/market coverage too.
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
  // consumer retail / gaming (not robotics engineering)
  "best buy", "on sale", "drops to $", "gaming monitor", "gaming laptop",
  "gaming pc", "mechanical keyboard", "graphics card deal",
  "prebuilt", "gaming desktop", "discount on", "% off", "save $",
  "best deal", "deals of",
  // market-hype phrasing
  "% surge", "market to hit",
  // off-topic: chip / semiconductor manufacturing (this is a robotics engine)
  "semiconductor", "chipmaker", "chip fab",
];

// Words that hint an article is a rumour / opinion (small penalty).
export const RUMOR_WORDS: string[] = [
  "reportedly", "rumor", "rumour", "could", "may invest", "is said to", "allegedly",
];
