// Simulate several users to verify the shared per-topic memory learns edits.
// Needs the dev server running on http://localhost:4100.
const BASE = "http://localhost:4100";
const TOPIC = "Hollywood";
const P = (a) => a.join(", ");

async function getSources() {
  const r = await fetch(`${BASE}/api/sources?topic=${encodeURIComponent(TOPIC)}`);
  const j = await r.json();
  return (j.sources || []).map((s) => s.name);
}
async function saveMemory(shown, selected) {
  await fetch(`${BASE}/api/memory`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic: TOPIC, kind: "sources", shown, selected }),
  });
}

async function main() {
  console.log("=== USER 1 opens Hollywood ===");
  const shown1 = await getSources();
  console.log("shown:", P(shown1));
  const remove = shown1.slice(-2); // remove last two
  const selected1 = shown1.filter((s) => !remove.includes(s)).concat(["Screen Rant"]); // add a custom
  console.log(`user1 removes: ${P(remove)} | adds: Screen Rant`);
  await saveMemory(shown1, selected1);

  console.log("\n=== USER 2 opens Hollywood (should reflect user1) ===");
  const shown2 = await getSources();
  console.log("shown:", P(shown2));
  console.log("  removed gone? ", remove.every((r) => !shown2.includes(r)) ? "YES" : "NO");
  console.log("  'Screen Rant' present? ", shown2.includes("Screen Rant") ? "YES" : "NO");

  console.log("\n=== USER 2 re-adds back one removed source (latest-wins) ===");
  const bringBack = remove[0];
  const selected2 = shown2.concat([bringBack]);
  console.log("user2 re-adds:", bringBack);
  await saveMemory(shown2, selected2);

  console.log("\n=== USER 3 opens Hollywood (should show it back) ===");
  const shown3 = await getSources();
  console.log("shown:", P(shown3));
  console.log(`  '${bringBack}' back? `, shown3.includes(bringBack) ? "YES" : "NO");
}

main().catch((e) => console.error("FAILED:", e.message));
