# Collab-Robotics-Engine: Architecture

## System Architecture

```
┌──────────────────────────────────────────────────────────────┐
│          React 19 / Next.js 16 HRC Dashboard                │
│  (Home, All, Search, Papers, Topics, Explore)               │
└────────────────────┬─────────────────────────────────────────┘
                     │ HTTP/JSON
        ┌────────────▼──────────────┐
        │   Next.js API Routes      │
        │  - search/api/*           │
        │  - export/route.ts        │
        │  - related/route.ts       │
        └────────────┬──────────────┘
                     │
    ┌────────────────▼──────────────────────────┐
    │     Robotics News Pipeline                │
    │  ├─ Fetch (25+ HRC RSS feeds)             │
    │  ├─ Parse (XML, HTML entity decode)       │
    │  ├─ Tag (8 HRC categories)                │
    │  ├─ Filter (junk, noise, HRC relevance)   │
    │  ├─ Score (cobot/safety/industry bias)    │
    │  ├─ Dedup (lexical + semantic)            │
    │  ├─ Rank (hybrid: score + freshness)      │
    │  ├─ Enrich (og:image fetching)            │
    │  └─ Store (data/news.json)                │
    └────────────┬───────────────────────────────┘
                 │
    ┌────────────▼──────────────────────────────┐
    │    HRC Data Storage                       │
    │  ├─ data/news.json (articles cache)       │
    │  ├─ data/papers.json (research)           │
    │  ├─ data/sources.ts (25+ feeds)           │
    │  ├─ data/curriculum.ts (8 HRC modules)    │
    │  └─ localStorage (bookmarks)              │
    └─────────────────────────────────────────┘
                 │
    ┌────────────▼──────────────────────────────┐
    │    Optional: Embeddings & Semantic       │
    │  ├─ @xenova/transformers (local)          │
    │  ├─ Semantic search                       │
    │  ├─ Related robotics research             │
    │  └─ LLM evaluation                        │
    └──────────────────────────────────────────┘
```

## Core Modules

### 1. **HRC Module System (data/curriculum.ts)**

**8 Specialized Categories:**

```typescript
type Module = {
  id: string;
  name: string;
  keywords: string[];
}
```

#### Module 1: Cobots
- **ID:** `cobots`
- **Keywords:** cobot, collaborative robot, UR, FANUC CRX, Doosan, Techman, force-limited, hand-guiding, lightweight arm
- **Tracks:** Cobot announcements, new collaborative arms, cobot integrations, deployment case studies

#### Module 2: HRI & Safety
- **ID:** `hri-safety`
- **Keywords:** ISO 10218, ISO/TS 15066, speed/separation monitoring, collision detection, safety scanner, functional safety
- **Tracks:** Safety standards updates, collision avoidance advances, risk assessment, protective stop

#### Module 3: Industrial Robotics & Automation
- **ID:** `industrial`
- **Keywords:** factory automation, assembly line, manufacturing robot, industrial arm, production efficiency
- **Tracks:** Assembly automation, manufacturing innovations, productivity gains

#### Module 4: Humanoid Robots
- **ID:** `humanoid`
- **Keywords:** humanoid, bipedal, dexterous hand, human-like robot, Honda ASIMO, Boston Dynamics
- **Tracks:** Humanoid developments, bipedal systems, dexterous manipulation

#### Module 5: Mobile Robots & AMR
- **ID:** `mobile-field`
- **Keywords:** AMR, autonomous mobile robot, drone, UAV, logistics robot, mobile manipulation
- **Tracks:** AMR announcements, drone regulations, autonomous delivery, mobile manipulation

#### Module 6: AI & Perception
- **ID:** `ai-perception`
- **Keywords:** computer vision, object detection, manipulation, machine learning robotics, neural network
- **Tracks:** AI advances in robotics, vision systems, learning-based control

#### Module 7: Digital Twins & Simulation
- **ID:** `digital-twin`
- **Keywords:** digital twin, simulation, virtual commissioning, ROS, Gazebo, Unity simulator
- **Tracks:** Simulation platform updates, digital twin benefits, virtual testing

#### Module 8: Market & Research
- **ID:** `industry-research`
- **Keywords:** robotics market, investment, funding round, research announcement, startup
- **Tracks:** Funding announcements, market analysis, research breakthroughs

### 2. **lib/tag.ts - HRC Tagging**

**Process:**
1. Extract title + summary
2. Count keyword hits per module (case-insensitive)
3. Return highest-match module or null if below threshold
4. Result: {moduleId, moduleName}

**Example:**
```
Title: "Universal Robots launches new safety features for cobots"
Keywords hit: "cobots" (Module 1), "safety" (Module 2)
Cobot count: 1, HRI&Safety count: 1
→ Returns Module 1 (cobots) as primary category
```

### 3. **lib/score.ts - HRC Relevance Scoring**

**HRC-Specific Scoring:**

```
Base score = 0-80 (by module + keyword density)
  - Cobots: weighted 1.3x (core HRC focus)
  - Safety: weighted 1.2x (critical)
  - Industrial: weighted 1.0x (general robotics)
  - Others: weighted 0.9x-1.0x

Tier weighting:
  - Tier 1 (research/academic): ×1.2
  - Tier 2 (industry): ×1.0

Penalties:
  - Noise words: −20
  - Rumor markers: −5
  - Domain blocklist: dropped (keep=false)

Final score: 0-100
```

**Noise Words (HRC-specific):**
- Finance: stock, earnings, valuation, investor
- Off-topic: gaming, cryptocurrency, web3
- Consumer: consumer robot, toy robot, pet robot

**Rumor Words:**
- reportedly, allegedly, could, may invest, is said to

### 4. **lib/pipeline.ts - HRC News Pipeline**

**Enhanced for Robotics:**

Same core as VLSI News Engine but with:
- HRC module tagging (8 categories instead of generic)
- Robotics source prioritization (Tier 1: academic/research)
- Safety keyword weighting
- Cobot-focused ranking

**Process:**
```
For each of 25 robotics sources:
  1. Fetch RSS feed (15s timeout)
  2. Parse XML → extract articles
  3. Clean HTML entities, decode text
  4. Extract: title, link, summary (400 chars), image
  5. Tag article to HRC module (8 categories)
  6. Score relevance (0-100, HRC-weighted)
  7. Filter by junk domains + noise words
  8. Keep if score > threshold

Deduplication:
  1. Lexical clustering (80% title similarity)
  2. Semantic dedup (if embeddings enabled)
  3. Merge clusters, track all sources

Ranking:
  1. Hybrid score: relevance + freshness decay
  2. Freshness: 0-6h → +40, 6-24h → +30, decay to 0
  3. Sort descending by final score

Enrichment:
  1. Fetch og:image for articles without images
  2. Cache results (8 parallel, session-scoped)

Output:
  - data/news.json with 101-300 articles
  - GeneratedAt timestamp
  - Each article tagged with HRC module
```

### 5. **lib/dedup.ts - Deduplication**

**Lexical Clustering:**
1. Normalize titles: lowercase, strip punctuation
2. Group by similarity threshold (80%)
3. Identify duplicate/near-duplicate stories

**Example:**
```
Source 1: "UR Robotics launches new safety features"
Source 2: "Universal Robots announces advanced collaborative arm safety"
Source 3: "UR reveals safety-rated stop for cobots"
→ Clustered as 1 story, 3 sources
```

**Semantic Dedup** (optional, with embeddings):
- Embed each cluster representative
- Merge if cosine similarity > 0.85
- Catches: "cobot safety" vs "safe collaboration" vs "human-robot teaming"

### 6. **lib/embed.ts - Optional Embeddings**

**Model:** `sentence-transformers/all-MiniLM-L6-v2` (local, WASM)

**Functions:**
- `embedText(text): number[]` - Embed article
- `cosineDistance(a[], b[]): number` - Similarity

**Use Cases:**
- Semantic search for robotics research
- Related articles by meaning
- Semantic dedup (find rephrased duplicates)

### 7. **lib/semanticSearch.ts**

**Search Flow:**
```
User: "cobot safety standards"
→ Embed query
→ Embed all article titles
→ Cosine similarity ranking
→ Top-k results (filtered to relevant robotics articles)
→ Display with HRC module tags
```

### 8. **Pages & Components**

**Routes:**

| Route | Purpose |
|-------|---------|
| `/` | Home (hero + latest robotics news) |
| `/all` | All news with HRC filters (Cobots, Safety, etc.) |
| `/search` | Full-text + semantic search |
| `/topic/[moduleId]` | Deep-dive: Cobots, Safety, Humanoid, etc. |
| `/papers` | Robotics research papers |
| `/saved` | Bookmarks |
| `/explore` | Keyword-based exploration |

**Key Components:**
- `HRCModuleTag.tsx` - Visual tag for (Cobots, Safety, etc.)
- `NewsCard.tsx` - Article card with module, sources
- `Header.tsx` - Navigation, logo, search
- `SaveButton.tsx` - Bookmark toggle
- `RoboticsTrend.tsx` - Trend chart by HRC module

### 9. **API Routes**

**POST /api/search**
- Input: query, type (lexical/semantic/hybrid), filter (module)
- Output: robotics articles matching query

**GET /api/related?link=...**
- Return semantically related robotics articles

**GET /api/articles?module=cobots**
- Filter by HRC module

**POST /api/export**
- Export to CSV with HRC categorization

### 10. **CLI Tools (tool/)**

**tool/run.ts** - Pipeline runner
```bash
npm run export
```

**tool/export.ts** - Export to CSV
```bash
npm run export -- --module cobots --format csv
```

**tool/comparison.ts** - Compare multiple HRC topics
**tool/papers.ts** - Extract research papers  
**tool/people.ts** - Track robotics researchers

### 11. **Data Storage**

**data/sources.ts** - 25 Robotics Feeds

**Tier 1 (Research/Technical):**
- The Robot Report
- IEEE Spectrum (Robotics + AI)
- Robohub
- TechXplore (Robotics)
- Science Robotics (journal)
- MIT News (AI & Robotics)
- ScienceDaily (Robotics)
- NVIDIA Blog
- Hackaday

**Tier 2 (Industry/Tech News):**
- TechCrunch (Robotics)
- New Atlas (Robotics)
- The Verge
- Ars Technica
- Interesting Engineering
- Manufacturing Dive
- DroneLife, DroneDJ
- Automation news feeds

### 12. **PM2 Configuration (ecosystem.config.cjs)**

Process management for automated news refresh:

```javascript
module.exports = {
  apps: [
    {
      name: 'collab-robotics',
      script: './server.js',
      instances: 1,
      env: { NODE_ENV: 'production' },
      cron_restart: '0 */2 * * *', // Refresh every 2 hours
    }
  ]
};
```

## Data Flow

### Complete HRC News Update Cycle

```
1. Scheduler triggered (2-hour interval)
   ↓
2. For each of 25 robotics sources:
   a. Fetch RSS feed (15s timeout, User-Agent)
   b. Parse XML → extract items
   c. Extract: title, link, summary, image, date
   d. HTML decode, clean text
   ↓
3. For each article:
   a. Tag to HRC module (8 categories)
   b. Score HRC relevance (0-100)
   c. Check junk domains / noise words
   d. Keep if score > threshold
   ↓
4. Deduplication:
   a. Lexical cluster by title similarity
   b. Semantic dedup (if enabled)
   c. Track all sources per story
   ↓
5. Ranking:
   a. Hybrid: relevance + freshness
   b. Freshness: recent → high boost, decay over 30 days
   ↓
6. Image enrichment:
   a. Fetch og:image for 30-50% of articles
   b. Parallel limit: 8 concurrent
   c. Cache for session
   ↓
7. Storage:
   a. Write data/news.json
   b. Include: generatedAt, count, articles[]
   c. Each article: title, link, image, module, score, sources
   ↓
8. Frontend:
   a. Dashboard loads data/news.json
   b. Displays by category, freshness, relevance
   c. Filters available: all, cobots, safety, humanoid, etc.
```

## Filtering Logic (HRC-Optimized)

### Domain Blocklist
Same as VLSI News Engine (finance, trading, market spam)

### HRC-Specific Noise Words
- "toy robot" (consumer, not industrial)
- "gaming robot" (off-topic)
- "consumer drone" (not professional robotics)
- "stock", "earnings", "investment" (market noise)

### Rumor Detection
Articles with "reportedly", "allegedly", "could", "may invest" marked as rumor (user sees indicator)

## Performance Characteristics

| Operation | Time |
|-----------|------|
| Fetch 25 sources | 30-45s (network) |
| Parse + tag | 3-5s |
| Score + filter | 1-2s |
| Dedup | 2-3s |
| og:image enrich | 30-60s (parallel, cached) |
| **Total pipeline** | **60-120s per run** |
| Search latency (lexical) | 50-200ms |
| Search latency (semantic) | 200-500ms |
| Dashboard load | < 2s |

## Scalability Path

**Current:**
- Single-process news generation
- In-memory caching
- File-based storage (data/news.json)
- ~200-400 articles

**For 1000+ articles:**
- Migrate to PostgreSQL + pgvector
- Redis cache for trending modules
- Distributed deduplication
- Background job queue (Bull, Celery)

## Security Model

- No credentials in code
- Bookmarks: browser localStorage (client-only)
- Feed URLs: public (no secrets)
- XML parsing: safe (fast-xml-parser with limits)
- Image fetching: timeout + size limits

## Testing Architecture

**Unit Tests:**
- HRC module tagging accuracy
- Score calculation (cobot bias, etc.)
- Dedup clustering
- Semantic search (if enabled)

**Integration Tests:**
- Full pipeline with sample robotics RSS
- Image enrichment
- Ranking consistency

**Validation:**
- Compare tagged articles vs manual classification
- Relevance ranking feedback
- Dedup precision/recall
