# Collab-Robotics-Engine: Project Context

## Project Overview

**Collab-Robotics-Engine** is a full-stack news aggregation and research platform designed specifically for Human-Robot Collaboration (HRC) and advanced robotics intelligence. It continuously collects robotics, automation, AI, and collaboration news from 25+ trusted sources, deduplicates stories, scores relevance for HRC professionals, and presents a curated dashboard with optional AI-powered semantic search.

## Problem Statement

The robotics industry produces massive volumes of news daily across scattered sources (academic journals, industry publications, company announcements, research databases). Robotics engineers, researchers, and professionals need:
- A single source of truth for HRC and robotics developments
- Filtering of market noise (stock prices, general tech hype) from robotics-specific content
- Deduplication of the same story across multiple sources
- Ranking by HRC relevance + freshness, not just recency
- Search capabilities for discovering robotics solutions and research

Collab-Robotics-Engine solves this by providing curated, de-duplicated robotics news with focus on human-robot collaboration, cobot technology, safety standards, and advanced automation.

## Target Users

- Robotics engineers and technical teams
- HRC (Human-Robot Collaboration) specialists
- Industrial automation professionals
- Cobot manufacturers and integrators
- Manufacturing technology planners
- Robotics researchers and academics
- AI/perception specialists in robotics
- Safety standards compliance teams

## Core Capabilities

### 1. **Multi-Source Robotics News Aggregation**
- Ingests from 25+ RSS feeds (Tier 1: research/technical, Tier 2: industry/tech)
- Sources include: The Robot Report, IEEE Spectrum, Robohub, TechXplore, MIT News, NVIDIA Blog, etc.
- Covers: cobots, humanoid robots, AMRs, drones, AI, safety, digital twins
- Automatic feed quality checking and error recovery
- Configurable source tiers for ranking priority

### 2. **HRC-Focused Categorization**
- **Cobots** - Collaborative robot systems (UR, FANUC CRX, Doosan, Techman)
- **HRI & Safety** - Human-Robot Interaction, ISO standards, collision detection
- **Industrial Robotics** - Manufacturing automation, assembly lines
- **Humanoid Robots** - Bipedal robots, dexterous hands, human-like systems
- **Mobile Robots & AMR** - Autonomous mobile robots, drones, logistics
- **AI & Perception** - Vision, manipulation, machine learning in robotics
- **Digital Twins** - Simulation, digital prototyping, virtual commissioning
- **Market & Research** - Industry trends, funding, research announcements

### 3. **Intelligent Filtering & Scoring**
- **Junk Filtering:** Blocks pure-finance domains (Yahoo Finance, Seeking Alpha, etc.)
- **Noise Detection:** Filters stock tips, unrelated market hype
- **HRC Relevance:** Domain-aware scoring for robotics professionals
- **Quality Gating:** Drops low-confidence, off-topic entries
- **Rumor Detection:** Marks speculative content

### 4. **Story Deduplication**
- Identifies duplicate stories across sources
- Merges clusters, tracking all source appearances
- Lexical deduplication (exact/similar titles)
- Semantic deduplication (same story, different wording)
- Shows "reported by 5 sources" attribution

### 5. **Ranking & Freshness**
- Hybrid ranking: relevance score + freshness decay
- Recent stories (6 hrs) get max freshness boost
- Decay over time ensures old important research doesn't disappear
- Ensures important research papers surface

### 6. **Rich Dashboard Interface**
- **Home:** Latest curated robotics news
- **All:** Browse all news with HRC category filters
- **Topic View:** Deep-dive into cobot technology, safety, etc.
- **Papers:** Research papers and academic publications
- **Saved:** User bookmarks and favorites
- **Search:** Full-text + semantic (optional)
- **Explore:** Keyword filtering for targeted discovery

### 7. **Research Integration**
- Academic papers linked to news
- Conference announcements
- Research institution publications
- Patent disclosures

### 8. **Optional AI Features**
- Semantic search with embeddings
- Related research by meaning
- Semantic deduplication
- Trend analysis
- Precision metrics

## Architecture Overview

```
25+ Robotics RSS Feeds (Research, Industry, Tech)
    ↓
Fetch & Parse (XML, error recovery)
    ↓
Extract (Title, Summary, Link, Date, Image)
    ↓
Tag (HRC category: Cobots, Safety, Humanoid, etc.)
    ↓
Filter (Junk domains, noise words, HRC relevance)
    ↓
Score (HRC-specific relevance 0-100)
    ↓
Deduplicate (Lexical + semantic optional)
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

1. **HRC-First Categorization** - 8 specific robotics/HRC categories, not generic tags
2. **Research Integration** - Academic papers linked to news, not separate
3. **Cobot Focus** - Leading edge of collaborative robotics (UR, FANUC, etc.)
4. **Safety Standards** - ISO 10218, ISO/TS 15066 tracking built in
5. **Branched Architecture** - Main for dashboard; tool/ for CLI batch processing
6. **Semantic Ready** - Embeddings optional but integrated for discovering research

## Technology Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 19.2.8, Next.js 16.3.1, TypeScript, Vite, Tailwind CSS |
| **Backend** | TypeScript/Node.js (Next.js API routes), XMLParser |
| **Data Source** | 25+ RSS/Atom feeds (live), data/news.json (cache) |
| **Optional AI** | @xenova/transformers (local embeddings), LLM evaluation |
| **Styling** | Tailwind CSS, Framer Motion animations |
| **Process Management** | PM2 (ecosystem.config.cjs) |

## Repository Structure

```
Collab-Robotics-Engine/
├── src/
│   ├── app/
│   │   ├── page.tsx              # Home dashboard
│   │   ├── all/page.tsx          # All robotics news
│   │   ├── search/page.tsx       # Search + semantic
│   │   ├── topic/[id]/page.tsx   # HRC topic deep-dive
│   │   ├── papers/page.tsx       # Research papers
│   │   ├── saved/page.tsx        # Bookmarks
│   │   ├── explore/page.tsx      # Explore with HRC filters
│   │   ├── api/
│   │   │   ├── export/route.ts   # Export endpoint
│   │   │   ├── related/route.ts  # Semantic related
│   │   │   └── ...
│   │   └── layout.tsx
│   └── components/
│       ├── Header.tsx
│       ├── NewsCard.tsx
│       ├── HRCCategoryTag.tsx    # HRC-specific tags
│       └── ...
├── lib/
│   ├── pipeline.ts               # Core news pipeline
│   ├── tag.ts                    # HRC category tagging
│   ├── score.ts                  # HRC relevance scoring
│   ├── dedup.ts                  # Deduplication
│   ├── embed.ts                  # [optional] Embeddings
│   ├── semanticSearch.ts         # [optional] Semantic search
│   └── ...
├── tool/                         # CLI tools
│   ├── run.ts                    # Run pipeline
│   ├── export.ts                 # Export to CSV
│   ├── comparison.ts             # Topic comparison
│   └── sources.config.ts         # Config
├── data/
│   ├── sources.ts                # 25+ robotics feeds
│   ├── curriculum.ts             # 8 HRC modules
│   ├── news.json                 # News cache
│   ├── papers.json               # Research papers
│   └── lectures.ts               # Learning materials
├── ecosystem.config.cjs          # PM2 config
├── package.json
└── README.md
```

## Development Status

- **Status:** Production Ready
- **Version:** 0.1.0
- **Focus:** Human-Robot Collaboration & Robotics Intelligence
- **Sources:** 25+ robotics/HRC feeds (Tier 1 & 2)
- **Categories:** 8 HRC-specific modules
- **Last Updated:** September 2026

## Key Features by Focus Area

### Cobots & HRC
✅ Collaborative robot news (UR, FANUC CRX, Doosan, Techman)  
✅ Hand-guiding & force-limited robot tracking  
✅ Power & force limiting specifications  
✅ Cobot deployment case studies  

### Safety & Standards
✅ ISO 10218, ISO/TS 15066 tracking  
✅ Speed/separation monitoring news  
✅ Collision detection advancement tracking  
✅ Risk assessment methodology updates  

### Advanced Robotics
✅ Humanoid robot developments  
✅ Mobile robots & AMR news  
✅ Drones & UAV tracking  

### AI & Perception
✅ Computer vision in robotics  
✅ Manipulation planning research  
✅ Machine learning applications  

### Industry Intelligence
✅ Funding announcements  
✅ Market analysis  
✅ Conference/event tracking  

## Deployment Options

- Local development (Next.js dev server on port 4200)
- Production server (port 4000)
- Docker containerization
- PM2 process management (ecosystem.config.cjs)
- Cloud platforms (Vercel, AWS, GCP)

## Success Metrics

- [ ] Ingest 25+ sources daily without failures
- [ ] HRC categorization accuracy > 90%
- [ ] Deduplication accuracy 95%+
- [ ] Relevance score aligned with HRC professional preferences
- [ ] Dashboard load < 2 seconds
- [ ] Image enrichment for 80%+ articles
- [ ] Semantic search precision > 0.85 (when enabled)

## Contact & Support

**Repository:** https://github.com/rootstock-tech-org/Edustream-Illustrations_FE_BE  
**Branch:** collab-robotics-engine  
**Forked From:** vlsi-news-engine (adapted for HRC/robotics)  
**Status:** Active Development
