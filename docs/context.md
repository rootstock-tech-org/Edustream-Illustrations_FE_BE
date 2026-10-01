# VLSI News Engine: Project Context

## Project Overview

**VLSI News Engine** is a full-stack news aggregation and synthesis platform designed specifically for VLSI (Very Large Scale Integration) and semiconductor industry intelligence. It continuously collects semiconductor news from 30+ trusted sources, deduplicates stories, scores relevance, and presents a curated dashboard with optional AI-powered semantic search capabilities.

## Problem Statement

The semiconductor industry produces massive volumes of news daily across scattered sources (industry publications, academic sites, company announcements, research databases). Engineers and researchers need:
- A single source of truth for VLSI/semiconductor developments
- Filtering of market noise (stock prices, finance chatter) from technical content
- Deduplication of the same story across multiple sources
- Ranking by relevance + freshness, not just recency
- Search capabilities beyond keyword matching

VLSI News Engine solves this by providing curated, de-duplicated semiconductor news with optional semantic intelligence.

## Target Users

- Semiconductor engineers and technical teams
- Chip design researchers and academics
- Hardware startups and R&D teams
- Technology journalists and industry analysts
- Engineering educational institutions

## Core Capabilities

### 1. **Multi-Source News Aggregation**
- Ingests from 30+ RSS feeds (Tier 1: technical/educational, Tier 2: industry news)
- Sources include: Semiconductor Engineering, IEEE Spectrum, TechXplore, SemiAnalysis, EE Times, etc.
- Automatic feed quality checking and error recovery
- Configurable source tiers for ranking priority

### 2. **Intelligent Filtering & Scoring**
- **Junk Filtering:** Blocks pure-finance domains (Yahoo Finance, Trading platforms, etc.)
- **Noise Detection:** Filters stock tips, market forecasts, consumer retail noise
- **Rumor Detection:** Marks speculative content (allegedly, reportedly, could)
- **Relevance Scoring:** Customized for semiconductor/VLSI domain
- **Quality Gating:** Drops low-confidence entries

### 3. **Story Deduplication**
- Identifies duplicate stories across sources
- Merges clusters, tracking all source appearances
- Lexical deduplication (exact/similar titles)
- Semantic deduplication (same story, different wording)
- Shows "reported by 5 sources" attribution

### 4. **Ranking & Freshness**
- Hybrid ranking: relevance score + freshness decay
- Recent stories (6 hrs) get max freshness boost
- Decay over time (24 hrs, 72 hrs, 30 days)
- Ensures important old stories don't disappear, new noise doesn't dominate

### 5. **Rich Dashboard Interface**
- **Home:** Latest curated news (all topics)
- **All:** News with filtering/pagination
- **Topic View:** Deep-dive into specific VLSI topics/modules
- **Papers:** Research papers and academic content
- **Saved:** User bookmark/favorite stories
- **Search:** Full-text + semantic (optional)
- **Demo/Lecture:** Educational content and training materials

### 6. **Optional AI Features** (embedding-wip & vlsi-news-engine branches)
- Semantic search with embeddings (@xenova/transformers)
- Related articles by meaning (not just keywords)
- Semantic deduplication (catch rephrased duplicates)
- Quality evaluation with LLM-as-judge
- Precision@K metric calculation

### 7. **Data Export & Analysis** (news-tools branch)
- CLI tools for batch processing
- CSV export with categorization
- Google News, Papers, People extractors
- Comparison tools for multi-topic analysis
- Historical data archival

## Architecture Overview

```
30+ RSS Feeds (Tier 1 & 2)
    ↓
Fetch & Parse (XMLParser, error recovery)
    ↓
Extract (Title, Summary, Link, Date, Image)
    ↓
Filter (Junk domains, noise words, rumor detection)
    ↓
Score (Relevance by category, domain tier)
    ↓
Deduplicate (Lexical clusters, optional semantic)
    ↓
Rank (Hybrid: score + freshness decay)
    ↓
Enrich Images (og:image meta-tag fetching)
    ↓
Store (data/news.json, in-memory cache)
    ↓
React Dashboard + Search API
```

## Key Design Decisions

1. **RSS-First** - Direct feed parsing avoids licensing/API limits
2. **Deterministic Filtering** - No AI required for core filtering; embeddings are optional enhancement
3. **Tiered Sources** - Trust levels (Tier 1: technical, Tier 2: industry) for ranking
4. **Junk-First Blocklist** - Explicit finance domain blocking, not keyword-only filtering
5. **Deduplication Clusters** - Preserve evidence: all sources reporting a story
6. **Freshness Decay** - Ranked relevance that doesn't age out important stories
7. **Branched Approach** - Main (vlsi-news-engine) for dashboard; news-tools for batch processing

## Technology Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 19.2.8, Next.js 16.3.1, TypeScript, Vite, Tailwind CSS |
| **Backend** | TypeScript/Node.js (Next.js API routes), XMLParser |
| **Data Source** | 30+ RSS/Atom feeds (live), data/news.json (cache) |
| **Optional AI** | @xenova/transformers (local embeddings), LLM evaluation |
| **Styling** | Tailwind CSS, Framer Motion animations |
| **Testing** | Vitest (embed evaluation, semantic search) |

## Repository Structure

```
VLSI-News-Engine/
├── src/
│   ├── app/
│   │   ├── page.tsx              # Home dashboard
│   │   ├── all/page.tsx          # All news with filters
│   │   ├── search/page.tsx       # Search + semantic
│   │   ├── topic/[id]/page.tsx   # Topic deep-dive
│   │   ├── papers/page.tsx       # Research papers
│   │   ├── saved/page.tsx        # Bookmarks
│   │   ├── demo/lecture/page.tsx # Educational
│   │   ├── explore/page.tsx      # [news-tools] Explore with filters
│   │   ├── api/
│   │   │   ├── export/route.ts   # [news-tools] Export endpoint
│   │   │   ├── related/route.ts  # Semantic related articles
│   │   │   └── thumb/route.ts    # Image thumbnail
│   │   └── layout.tsx            # Root layout
│   └── components/
│       ├── Header.tsx
│       ├── NewsCard.tsx
│       ├── SearchInput.tsx
│       ├── FloatingLearnButton.tsx
│       ├── SaveButton.tsx
│       └── ...
├── lib/
│   ├── pipeline.ts               # Core news pipeline
│   ├── getNews.ts                # Load news.json
│   ├── getPapers.ts              # Load papers.json
│   ├── dedup.ts                  # Deduplication logic
│   ├── score.ts                  # Relevance scoring
│   ├── tag.ts                    # Module tagging
│   ├── embed.ts                  # [embedding] Embeddings
│   ├── semanticSearch.ts         # [embedding] Semantic search
│   ├── semanticDedup.ts          # [embedding] Semantic dedup
│   ├── moduleVectors.ts          # [embedding] Module embeddings
│   ├── display.ts                # UI formatting
│   ├── store.ts                  # Browser storage
│   └── categories.ts             # Topic categories
├── tool/                         # [news-tools] CLI tools
│   ├── run.ts                    # Run pipeline
│   ├── googleNews.ts             # Google News extractor
│   ├── papers.ts                 # Papers extractor
│   ├── people.ts                 # People extractor
│   ├── comparison.ts             # Comparison tool
│   ├── csv.ts, export.ts         # Export utilities
│   └── sources.config.ts         # Tool configuration
├── data/
│   ├── sources.ts                # 30+ RSS feeds configuration
│   ├── news.json                 # Generated news cache
│   ├── papers.json               # Papers database
│   ├── curriculum.ts             # Educational content
│   └── lectures.ts               # Lecture data
├── scripts/
│   ├── embed-check.ts            # [embedding] Embedding verification
│   ├── eval.ts                   # [embedding] Quality evaluation
│   ├── eval-quality.ts           # [embedding] Precision@K metric
│   └── ...
├── package.json
└── README.md
```

## Development Status

- **Status:** Production Ready
- **Version:** 0.1.0
- **Main Branch:** vlsi-news-engine (latest features, embedding support)
- **Alternative:** news-tools (lightweight, CLI-optimized, no embeddings)
- **Last Evaluated:** Multiple sources verified (Sept 2026)

## Key Features by Branch

### vlsi-news-engine (Main) + embedding-wip
✅ Full dashboard with all pages  
✅ Semantic search (embeddings)  
✅ Semantic deduplication  
✅ Related articles by meaning  
✅ Quality evaluation with LLM  
✅ Precision@K metric  
✅ Full-featured React dashboard  

### news-tools (Batch Processing)
✅ CLI tools for batch ingestion  
✅ CSV export per topic  
✅ Google News/Papers/People extractors  
✅ Comparison workflows  
✅ Lighter dependencies  
✅ Explore page with filters  
❌ No semantic search  
❌ No embeddings  

## Deployment Options

- Local development (Next.js dev server)
- Docker containerization
- Vercel (Next.js optimized)
- Self-hosted Node.js server

## Success Metrics

- [ ] Ingest 30+ sources daily without failures
- [ ] Deduplicate stories with 95%+ accuracy
- [ ] Relevance score aligned with engineer preferences
- [ ] Search latency < 500ms
- [ ] Dashboard load time < 2 seconds
- [ ] Image enrichment for 80%+ articles
- [ ] Semantic search precision > 0.85 (for embedding branch)

## Contact & Support

**Repository:** https://github.com/rootstock-tech-org/Edustream-Illustrations_FE_BE  
**Branches:** vlsi-news-engine (main), embedding-wip, news-tools  
**Status:** Active Development
