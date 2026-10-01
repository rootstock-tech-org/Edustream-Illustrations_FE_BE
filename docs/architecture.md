# VLSI News Engine: Architecture

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│            React 19 / Next.js 16 Dashboard                  │
│  (Home, All, Search, Papers, Saved, Topics, Demo/Lecture)   │
└────────────────────┬────────────────────────────────────────┘
                     │ HTTP/JSON
        ┌────────────▼──────────────┐
        │   Next.js API Routes      │
        │  - search/api/*           │
        │  - export/route.ts        │
        │  - related/route.ts       │
        └────────────┬──────────────┘
                     │
    ┌────────────────▼──────────────────────────┐
    │     Core Processing Pipeline              │
    │  ├─ Fetch (30+ RSS feeds)                 │
    │  ├─ Parse (XMLParser, HTML decode)        │
    │  ├─ Filter (junk, noise, domain blocks)   │
    │  ├─ Score (relevance + tier weighting)    │
    │  ├─ Dedup (lexical + semantic clusters)   │
    │  ├─ Rank (hybrid: score + freshness)      │
    │  ├─ Enrich (og:image fetching)            │
    │  └─ Store (data/news.json)                │
    └────────────┬───────────────────────────────┘
                 │
    ┌────────────▼──────────────────────────────┐
    │    Data Storage & Search                  │
    │  ├─ data/news.json (articles cache)       │
    │  ├─ data/papers.json (research)           │
    │  ├─ data/sources.ts (30+ feeds)           │
    │  └─ Browser localStorage (saved, filters) │
    └─────────────────────────────────────────┘
                 │
    ┌────────────▼──────────────────────────────┐
    │    Optional: Embeddings & Search          │
    │  ├─ @xenova/transformers (local)          │
    │  ├─ Semantic search                       │
    │  ├─ Related articles by meaning           │
    │  └─ LLM quality evaluation                │
    └──────────────────────────────────────────┘
```

## Core Modules

### 1. **lib/pipeline.ts** - The News Pipeline

**Main Export:** `buildNews(): Promise<Article[]>`

**Article Type:**
```typescript
type Article = {
  title: string;
  link: string;
  image: string | null;        // og:image or RSS enclosure
  summary: string;             // 400-char excerpt
  source: string;              // Primary source (best of cluster)
  sources: string[];           // All sources reporting it
  sourceCount: number;         // How many sources
  moduleId: string;            // Category ID
  module: string;              // Category name (VLSI Design, etc.)
  score: number;               // Relevance score (0-100)
  rumor: boolean;              // Contains speculation markers
  publishedAt: string | null;  // ISO timestamp
}
```

**Pipeline Steps:**

1. **fetchSource(src: Source)** - Fetch & parse RSS feed
   - Handles RSS 2.0, RDF, Atom formats
   - Timeout: 15 seconds per source
   - User-Agent: "AvsarNewsBot/1.0"
   - Returns empty array on failure (graceful degradation)

2. **titleOf(it) / summaryOf(it)** - Extract and clean text
   - Strips HTML tags
   - Decodes entities (&#8217; → ', &amp; → &, etc.)
   - Title: raw, Summary: 400-char max

3. **imageOf(it)** - Extract article image
   - Priority: enclosure (RSS) → media:content → media:thumbnail → og:image fetch
   - Image type validation

4. **tagArticle(title, summary)** - Module classification
   - Classifies into VLSI categories (Design, Fabrication, etc.)
   - Returns {moduleId, moduleName} or null if unmapped
   - Tags in lib/tag.ts

5. **scoreArticle(...)** - Relevance scoring
   - Input: title, summary, link, publishedAt, tier (1 or 2), tag
   - Scoring logic in lib/score.ts
   - Returns: {keep: boolean, score: number, rumor: boolean}
   - Filters by: domain blocklist, noise words, rumor words

6. **dedupeArticles(kept[])** - Cluster duplicate stories
   - Groups by similar title (Levenshtein, normalized)
   - Semantic deduplication if embeddings enabled
   - Returns clusters with representative article + all sources

7. **enrichImages(articles[])** - Fetch og:image for missing images
   - Concurrency limited to 8 parallel fetches
   - Caches results per session (ogCache, ogTried)
   - Parses meta tags from article HTML

8. **freshnessBoost(publishedAt)** - Time-decay weighting
   - 0-6 hrs: +40 points
   - 6-24 hrs: +30 points
   - 24-72 hrs: +18 points
   - 72-168 hrs: +8 points
   - 168-720 hrs: +2 points
   - 720+ hrs: +0 points

**Final Ranking:**
```
sort by: (score + freshnessBoost) desc, then publishedAt desc
```

### 2. **lib/score.ts** - Relevance Scoring

**Input:** Article candidate with category tag  
**Output:** {keep: boolean, score: number, rumor: boolean}

**Logic:**
- Base score from category relevance (0-80)
- Tier weighting: Tier 1 → ×1.2, Tier 2 → ×1.0
- Noise word detection: −20 if matches
- Rumor marker detection: marks rumor flag, −5 penalty
- Domain blocklist: dropped (keep=false)
- Final score: 0-100 scale

### 3. **lib/dedup.ts** - Deduplication

**Process:**
1. **Lexical Clustering** - Group by normalized title similarity
   - Normalize: lowercase, strip punctuation, trim whitespace
   - Similarity: Levenshtein distance / length ratio
   - Threshold: 0.80 (80% match required)

2. **Cluster Representation**
   - Choose representative article (highest score)
   - Track all sources that reported it
   - Count appearances

3. **Semantic Dedup** (optional, embedding-wip branch)
   - Second pass: embed cluster titles
   - Merge if cosine similarity > 0.85
   - Catches rephrased duplicates

**DedupItem Structure:**
```typescript
type DedupItem = {
  sources: string[];     // All source names
  count: number;         // sourceCount
  rep: Article;          // Representative article
}
```

### 4. **lib/tag.ts** - Module Tagging

Maps article to VLSI categories: Design, Fabrication, Verification, Packaging, etc.

**Input:** title, summary  
**Output:** {moduleId, moduleName} or null

**Algorithm:** Keyword matching by category

### 5. **lib/embed.ts** - Optional Embeddings

**Uses:** @xenova/transformers (`sentence-transformers/all-MiniLM-L6-v2`)

**Functions:**
- `embedText(text: string): number[]` - Embed article title/summary
- `cosineDistance(a[], b[]): number` - Similarity metric
- Runs in browser (WASM + local model)
- No API calls, fully local

### 6. **lib/semanticSearch.ts** - Semantic Search (optional)

**Input:** Query string  
**Process:**
1. Embed user query
2. Embed all article titles/summaries
3. Score by cosine similarity
4. Rerank, return top results

**Result:** More flexible than keyword search; catches paraphrased content

### 7. **lib/semanticDedup.ts** - Semantic Dedup (optional)

Second pass after lexical dedup:
- Embed each cluster representative
- Merge clusters if similarity > 0.85
- Catches: "TSMC in trouble" vs "TSMC stock declines" vs "TSMC faces challenges"

### 8. **lib/getNews.ts** - Load Cached Data

```typescript
export function getNews(): NewsStore {
  // Reads data/news.json synchronously on server
  // Client-side caching via browser storage
}
```

**Returns:**
```typescript
type NewsStore = {
  generatedAt: string | null;  // ISO timestamp of last rebuild
  count: number;               // Total articles
  articles: Article[];         // Full article list
}
```

### 9. **data/sources.ts** - Feed Configuration

**30+ Configured Sources:**

**Tier 1 (Technical/Educational):**
- Semiconductor Engineering
- IEEE Spectrum (Semiconductors, Computing)
- SemiWiki
- Phys.org, TechXplore (Semiconductors)
- MIT News (Nanotech)
- SemiAnalysis, The Chip Letter
- Electronic Design
- Fabricated Knowledge
- TechInsights
- Siemens Verification Horizons
- Others (20+ more)

**Tier 2 (Industry News):**
- EE Times, EE News Europe
- Tom's Hardware
- DIGITIMES
- Electronics Weekly, Embedded.com
- EDN, TechPowerUp
- The Register, The Next Platform
- Others (10+ more)

**Each Source:**
```typescript
type Source = {
  name: string;        // Display name
  feed: string;        // RSS/Atom URL
  tier: 1 | 2;         // Trust level
  on: boolean;         // Active flag
}
```

### 10. **Frontend Routes & Components**

**Pages:**

| Route | Component | Purpose |
|-------|-----------|---------|
| `/` | page.tsx | Home dashboard (hero + recent news) |
| `/all` | all/page.tsx | All news with filters/pagination |
| `/search` | search/page.tsx | Search + related (semantic optional) |
| `/topic/[id]` | topic/[id]/page.tsx | Deep-dive into category |
| `/papers` | papers/page.tsx | Research papers collection |
| `/saved` | saved/page.tsx | User bookmarks |
| `/demo/lecture` | demo/lecture/page.tsx | Educational content |
| `/explore` | explore/page.tsx | [news-tools] Filters & exploration |

**Key Components:**

- `NewsCard.tsx` - Article card (title, image, summary, sources, module tag)
- `Header.tsx` - Navigation, logo, search bar
- `SearchInput.tsx` - Query input with suggestions
- `SaveButton.tsx` - Bookmark toggle
- `FloatingLearnButton.tsx` - Learn modal
- `FocusScroller.tsx` - Smooth scroll behavior
- `PaperCard.tsx` - Research paper display

### 11. **API Routes**

**POST /api/search**
- Input: query, type ("lexical" or "semantic" or "hybrid")
- Output: results[] with scores

**GET /api/related?link=...**
- Return semantically related articles (embedding-wip only)

**GET /api/articles?module=...**
- Filter articles by category

**POST /api/export** (news-tools)
- Export to CSV with filters

### 12. **CLI Tools** (news-tools branch)

**tool/run.ts** - Main pipeline runner
```bash
npx tsx tool/run.ts
```

**tool/googleNews.ts** - Extract from Google News
**tool/papers.ts** - Extract research papers  
**tool/people.ts** - Extract researcher profiles  
**tool/comparison.ts** - Compare multiple topics  
**tool/csv.ts** - CSV export utilities

## Data Flow

### Complete News Update Cycle

```
1. Scheduler triggered (manual or automatic)
   ↓
2. For each enabled source in data/sources.ts:
   a. Fetch RSS/Atom feed (timeout 15s)
   b. Parse XML items
   c. Extract: title, link, summary, image, date
   d. HTML entity decode
   ↓
3. For each article:
   a. Tag by category (module ID)
   b. Score relevance (0-100)
   c. Check blocklist/noise/rumor
   d. Keep if score > threshold
   ↓
4. Deduplication:
   a. Group by lexical similarity
   b. Merge with semantic dedup (if enabled)
   c. Track all sources per story
   ↓
5. Enrichment:
   a. Fetch og:image for missing images
   b. Parallel limit: 8 concurrent
   c. Cache results
   ↓
6. Final ranking:
   a. Hybrid score: relevance + freshness decay
   b. Sort by score descending
   c. Dedup images (show each once)
   ↓
7. Store:
   a. Write to data/news.json
   b. Include: generatedAt timestamp, article count
   c. Client-side cache invalidation
```

### Search Flow

**Lexical Search:**
```
User query → Lowercase + tokenize → Full-text match → BM25 rank → Results
```

**Semantic Search** (embedding-wip):
```
User query → Embed (sentence-transformers) → 
Embed all article titles → Cosine similarity → Top-k → Results
```

**Hybrid:**
```
Lexical results + Semantic results → Deduplicate → Rerank → Merge
```

## Filtering Logic

### Blocklist-Based Junk Removal

**BLOCKED_DOMAINS** (data/sources.ts):
- Finance/Trading: tradingview.com, Yahoo Finance, Seeking Alpha, etc.
- Market Research Spam: Markets & Markets, Grand View Research, etc.

**Result:** Any article from these domains → dropped

### Noise Word Filtering

**NOISE_WORDS** (data/sources.ts):
- Stock/finance: stock, shares, earnings, valuation, hedge fund
- Consumer: gaming monitor, graphics card deal, save $
- Market hype: % surge, market to reach
- Off-topic: cancer, tumor, mathematics proof

**Result:** Article mentioning these → score −20, may be dropped

### Rumor Detection

**RUMOR_WORDS:**
- reportedly, rumor, could, may invest, is said to, allegedly

**Result:** Articles mentioning these → rumor flag = true (user sees indicator)

## Performance Characteristics

| Operation | Time |
|-----------|------|
| Fetch 30 sources | 20-40s (network-dependent) |
| Parse + extract | 2-5s |
| Score + filter | 1s |
| Deduplication | 2-3s |
| og:image enrichment | 30-60s (parallel, cached) |
| Total pipeline | 60-120s per run |
| Search latency (lexical) | 50-200ms |
| Search latency (semantic) | 200-500ms |
| Dashboard load | < 2s |

## Optional: Embeddings & Semantic Search

**Enable on:** embedding-wip or vlsi-news-engine branch

**Model:** `sentence-transformers/all-MiniLM-L6-v2`
- 384 dimensions
- 22M parameters
- Runs entirely in browser (WASM)
- No external API calls

**Performance:**
- Embedding one article: 10-50ms
- Semantic search query: 200-500ms
- Semantic dedup: 1-3s extra

**Trade-offs:**
- ✅ Local (no privacy concerns)
- ✅ No API keys needed
- ❌ Large model download (~50MB gzipped)
- ❌ Slower on first use (model loads)

## Scalability Notes

**Current Design:**
- Single-process news generation
- In-memory caching (ogCache, ogTried)
- File-based storage (data/news.json)
- Supports ~100-500 articles

**For 1000+ articles:**
- Move to database (PostgreSQL + pgvector for semantic search)
- Redis cache for frequently accessed data
- CDN for image serving
- Distributed deduplication

## Security Considerations

- No credentials in code (API keys would go in .env)
- User bookmarks: browser localStorage (client-side only)
- Feed URLs: public (no sensitive data)
- Image caching: temporary during session (cleared on reload)
- XML parsing: using safe parser (fast-xml-parser with sanitization)

## Testing Architecture

**Unit Tests:**
- Deduplication logic accuracy
- Score calculation
- Entity decode/parse
- Semantic similarity (if embeddings)

**Integration Tests:**
- Full pipeline with sample RSS
- Image enrichment
- Ranking consistency

**Scripts:**
- embed-check.ts - Verify embeddings work
- eval.ts - Quality metrics
- eval-quality.ts - Precision@K calculation
