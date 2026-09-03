# AVSAR VLSI News — Build & Verify Checklist

How we work: ONE step at a time. I build → we BOTH verify using every method below → you tick →
only then next step. If any check fails, we fix it there, we do NOT move ahead.

Legend: [ ] = pending, [x] = done. "V" = a verification method (tick each).

---

## STEP 1 — Scaffold the Next.js project
- [ ] Build: create project `C:\Users\anjan\vlsi-news-v2` (Next.js, webpack mode)
- V1 [ ] Terminal shows "Ready" and a localhost URL (no red errors)
- V2 [ ] Open the URL in browser → default page renders
- V3 [ ] Browser console has 0 errors
- V4 [ ] `get_errors` on the project = 0 problems
- V5 [ ] Folder has the expected structure (app/, package.json, node_modules)

## STEP 2 — Finalize sources.ts + curriculum.ts
- [ ] Build: enrich Industry keywords + add Research theme (no jobs/region silo)
- V1 [ ] You read every keyword list → confirm all relevant, zero junk
- V2 [ ] Count check: ~16 sources, ~15 modules/themes, ~250+ keywords
- V3 [ ] No duplicate keywords inside a module
- V4 [ ] `get_errors` on both files = 0

## STEP 3 — Fetcher for ONE source (SemiEngineering)
- [ ] Build: read 1 RSS feed, parse, print each article
- V1 [ ] Terminal prints real titles (match what's live on the site today)
- V2 [ ] Each printed item has: title + link + date + image (if feed gives one)
- V3 [ ] Open one printed link in browser → it is a real, correct article
- V4 [ ] Count printed = count in the raw feed (nothing silently dropped)

## STEP 4 — Fetcher for ALL 16 sources
- [ ] Build: loop all sources, fetch each
- V1 [ ] Table: each source → how many articles fetched
- V2 [ ] Any source returning 0 / error is clearly flagged (we fix or remove it)
- V3 [ ] Total article count looks reasonable (e.g. 100+)
- V4 [ ] A broken feed does NOT crash the run (it skips + logs)

## STEP 5 — Tag each article to a module
- [ ] Build: match title+summary against module keywords → assign best module
- V1 [ ] Eyeball 20 articles → the module tag is correct for each
- V2 [ ] An off-topic article (no keyword match) is marked "untagged/dropped"
- V3 [ ] Each module shows at least a few articles (no module is wrongly empty)
- V4 [ ] Spot a wrong tag → we add/fix the keyword, re-run, confirm fixed

## STEP 6 — Score + junk filter
- [ ] Build: score /100 (relevance+trust+educational+freshness); drop below cutoff
- V1 [ ] A known STOCK article (e.g. "AMD stock up") → DROPPED
- V2 [ ] A blocked-domain article → DROPPED regardless of text
- V3 [ ] A strong technical article (e.g. EUV/FinFET) → high score, near top
- V4 [ ] Print top 10 + their scores → order makes sense to both of us
- V5 [ ] Print dropped list → confirm all of them are genuinely junk

## STEP 7 — Deduplicate
- [ ] Build: merge same story from different sources
- V1 [ ] A story on 3 sites shows ONCE with "3 sources"
- V2 [ ] Two genuinely different stories are NOT wrongly merged
- V3 [ ] Total count drops by the number of duplicates (math checks out)

## STEP 8 — Store to news.json
- [ ] Build: write cleaned/tagged/ranked news to a file
- V1 [ ] Open news.json → data is clean (title, link, source, date, image, module, score, sources)
- V2 [ ] Article count in file == count after dedup
- V3 [ ] Re-run fetch → file updates, no duplicates re-added
- V4 [ ] `get_errors` = 0

## STEP 9 — Background refresh (timer)
- [ ] Build: refresh every ~10 min
- V1 [ ] File's "last updated" timestamp changes after a cycle
- V2 [ ] New articles appear over time; old (30+ days) get cleaned
- V3 [ ] App keeps working during a refresh (no crash)

## STEP 10 — Website list page (reads from store)
- [ ] Build: homepage shows the stored news
- V1 [ ] Browser shows real news cards (title, source, time, image)
- V2 [ ] Page loads fast (reads file, not live-fetching)
- V3 [ ] Browser console = 0 errors; `get_errors` = 0
- V4 [ ] Screenshot matches expectation; newest-first order correct

## STEP 11 — Browse by module + search
- [ ] Build: filter by module + a search box
- V1 [ ] Click "Lithography" → only lithography news
- V2 [ ] Click "Fabrication" → only fabrication news
- V3 [ ] Search "FinFET" → only matching articles
- V4 [ ] Empty/no-result search shows a clean message (no crash)

## STEP 12 — Thumbnails from the feed
- [ ] Build: use each feed's own image
- V1 [ ] Most cards show a real image straight from the feed
- V2 [ ] No image → a clean branded tile (never a broken box)
- V3 [ ] No slow "resolve/proxy" tricks (loads instantly)

## STEP 13 — UI polish + final QA
- [ ] Build: Fuzz-like clean UI, dark/light
- V1 [ ] Full click-through of every section by both of us
- V2 [ ] Dark + light both look right
- V3 [ ] Responsive (phone width) has no overflow
- V4 [ ] Browser console = 0 errors; `npm run build` = clean
- V5 [ ] No AI-tells (no stray emojis/em-dashes/marketing copy)

---

### Working rules
- One step at a time. No skipping.
- Every "V" line must pass before ticking the step.
- Any fail → fix in place, re-verify, then continue.
