// End-to-end smoke test of the whole flow across a few topics/regions.
// Run (dev server must be up): node scripts/e2e-test.mjs
const BASE = "http://localhost:4100";
const CASES = [
  { topic: "cricket", region: "IN" },
  { topic: "artificial intelligence", region: "US" },
  { topic: "climate change", region: "WORLD" },
];
let problems = 0;
const flag = (m) => { problems++; console.log("   !! ISSUE:", m); };

async function j(url, opts) {
  const r = await fetch(url, opts);
  return { status: r.status, body: await r.json().catch(() => null) };
}

async function run({ topic, region }) {
  console.log(`\n===== ${topic}  [${region}] =====`);

  // 1. suggest
  const sug = await j(`${BASE}/api/suggest?q=${encodeURIComponent(topic.slice(0, 4))}`);
  console.log(`suggest: ${sug.body?.suggestions?.length || 0} -> ${(sug.body?.suggestions || []).slice(0, 3).join(", ")}`);
  if (!sug.body?.suggestions?.length) flag("no suggestions");

  // 2. sources
  const src = await j(`${BASE}/api/sources?topic=${encodeURIComponent(topic)}&region=${region}`);
  const sources = (src.body?.sources || []).map((s) => s.name);
  console.log(`sources: ${sources.length} -> ${sources.slice(0, 5).join(", ")}`);
  if (sources.length < 3) flag("too few sources");

  // 3. keywords
  const kw = await j(`${BASE}/api/keywords?topic=${encodeURIComponent(topic)}&region=${region}`);
  const keywords = (kw.body?.keywords || []).map((k) => k.word);
  console.log(`keywords: ${keywords.length} -> ${keywords.slice(0, 8).join(", ")}`);
  if (keywords.length < 3) flag("too few keywords");

  // 4. save config
  const cfg = await j(`${BASE}/api/config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic, region, sources, keywords }),
  });
  if (cfg.status !== 200) flag("config save failed " + cfg.status);

  // 5. news
  const news = await j(`${BASE}/api/news`);
  const items = news.body?.items || [];
  console.log(`news: ${items.length} | region=${news.body?.region} | first: [${items[0]?.source}] ${(items[0]?.headline || "").slice(0, 50)}`);
  if (items.length < 5) flag("too few news items");
  if (news.body?.region !== region) flag(`news region mismatch (${news.body?.region} != ${region})`);
  const badDate = items.filter((i) => i.date && new Date(i.date).getTime() > Date.now() + 6 * 3600e3).length;
  if (badDate) flag(`${badDate} future-dated items`);

  // 6. memory: remove a source, re-fetch, confirm it's gone
  if (sources.length > 2) {
    const drop = sources[sources.length - 1];
    const kept = sources.slice(0, -1);
    await j(`${BASE}/api/memory`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, kind: "sources", shown: sources, selected: kept }),
    });
    const again = await j(`${BASE}/api/sources?topic=${encodeURIComponent(topic)}&region=${region}`);
    const names2 = (again.body?.sources || []).map((s) => s.name);
    const gone = !names2.includes(drop);
    console.log(`memory: removed "${drop}" -> gone next time? ${gone ? "YES" : "NO"}`);
    if (!gone) flag("memory did not apply removal");
  }
}

(async () => {
  for (const c of CASES) {
    try { await run(c); } catch (e) { flag(`${c.topic} threw: ${e.message}`); }
  }
  console.log(`\n===== DONE. Problems found: ${problems} =====`);
})();
