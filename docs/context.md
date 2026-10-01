# News-Report-Builder: Project Context

## Project Overview

**News-Report-Builder** is a flexible, topic-based news aggregation and report generation platform. Unlike fixed-domain systems (VLSI, Robotics), this system works for ANY topic: enter a topic (e.g., "Elections 2026", "AI chips", "Bollywood"), select sources, define keywords, and the system generates a curated dashboard with news, trends, and exportable reports (PDF, Markdown, CSV).

## Problem Statement

Researchers, analysts, journalists, and professionals need to:
- Quickly aggregate news on arbitrary topics (not pre-defined domains)
- Filter stories by keywords and sentiment
- Search multiple sources simultaneously
- Export findings as professional reports (PDF with branding)
- Track topics over time (memory of previous searches)
- Understand trends within a topic (trending keywords, sentiment shifts)
- Work across regions (India, global, etc.)

Traditional approach: manual browser tabs, copy-paste, fragmented sources. News-Report-Builder automates this: configure once, get dashboard + reports automatically.

## Target Users

- **Researchers & Analysts** — competitive intelligence, trend analysis
- **Journalists** — story research, fact-checking, trend discovery
- **Marketing Teams** — brand monitoring, competitor tracking, campaign research
- **Investors** — sector news aggregation, company monitoring
- **Policy Analysts** — regulatory tracking, political intelligence
- **Students** — research papers, topic-based news collection
- **Corporate Strategy** — industry monitoring, emerging trends

## Core Capabilities

### 1. **Topic-Based News Aggregation**
- Enter any topic (free-form text)
- Specify region (India, global, etc.)
- Select multiple news sources
- Define keywords for filtering
- Auto-fetch news matching criteria
- Configurable update frequency

### 2. **Source Management**
- Add custom news sources (RSS, web)
- Built-in popular sources (Times of India, BBC, TechCrunch, etc.)
- Per-topic source selection
- Source reliability/tier tracking
- Fallback source chains

### 3. **Keyword & Entity Tagging**
- Define keywords per topic
- Auto-tag stories with keywords
- Sentiment analysis (positive/negative/neutral)
- Entity extraction (people, places, organizations)
- Trending keywords per period

### 4. **Dashboard Interface**
- Real-time news display
- Filter by keywords, sentiment, date
- Search within topic results
- Trending keywords sidebar
- Image-free layout (or Pexels photos optional)
- Dark/light theme (no-flash toggle)

### 5. **Report Generation**
- PDF export with branding
- Markdown export (for content sharing)
- CSV export (for data analysis)
- Customizable report layout
- Date ranges, summaries, citations

### 6. **Topic Memory**
- Save topics with config (sources, keywords)
- Load saved topics instantly
- Track topic history
- Per-topic metadata and notes

### 7. **Trends & Insights**
- Trending keywords over time
- Sentiment trend tracking
- Source contribution analysis
- Story frequency metrics
- Viral detection

## Architecture Overview

```
User Input (Topic + Region)
    ↓
Source Selection & Keywords
    ↓
News Fetching (RSS, scraping)
    ↓
Parsing & Normalization
    ↓
Entity & Sentiment Tagging
    ↓
Database Storage
    ↓
Dashboard Display & Export
    ├─ View: Real-time news
    ├─ Filter: Keywords, sentiment, date
    ├─ Export: PDF, Markdown, CSV
    └─ Memory: Save topic config
```

## Key Design Decisions

1. **Any-Topic** - Not domain-specific; configurable for any topic
2. **Source-Agnostic** - Works with RSS, HTML scraping, APIs
3. **Config-Driven** - YAML/JSON config for topic definitions
4. **Stateful** - Memory of previous topics and configurations
5. **Report-First** - Export to PDF/Markdown/CSV from start
6. **NLP Integration** - Sentiment & entity tagging via NLP
7. **Regional** - Multi-region support (India, global, etc.)

## Technology Stack

| Layer | Technology |
|-------|------------|
| **Framework** | Next.js 16.3.3, React 19.2.8, TypeScript |
| **Styling** | Tailwind CSS 4 |
| **Data Source** | Multiple RSS feeds, web scrapers |
| **NLP** | Compromise.js (sentiment, entities) |
| **PDF Export** | jsPDF 4.2.1 |
| **Config** | YAML (js-yaml) |
| **Graphics** | OGL (lightweight 3D for visualizations) |
| **Storage** | File-based (YAML) + in-memory config |

## Repository Structure

```
News-Report-Builder/
├── src/
│   ├── app/
│   │   ├── page.tsx              # Home (topic entry, saved topics)
│   │   ├── sources/page.tsx      # Select sources per topic
│   │   ├── keywords/page.tsx     # Define keywords & filters
│   │   ├── dashboard/page.tsx    # Main news display
│   │   ├── api/
│   │   │   ├── config/route.ts   # Get/set topic config
│   │   │   ├── news/route.ts     # Fetch news for topic
│   │   │   ├── sources/route.ts  # Manage sources
│   │   │   ├── keywords/route.ts # Manage keywords
│   │   │   ├── topics/route.ts   # Save/load topics
│   │   │   ├── trends/route.ts   # Trending keywords
│   │   │   ├── suggest/route.ts  # AI suggestions
│   │   │   ├── memory/route.ts   # Topic memory
│   │   │   └── thumb/route.ts    # Thumbnails
│   │   └── layout.tsx
│   ├── components/
│   │   ├── SearchBox.tsx
│   │   ├── CountUp.tsx
│   │   ├── GradientWaves.tsx
│   │   └── ... more components
│   └── lib/
│       ├── regions.ts            # Region definitions
│       ├── nlp.ts                # Sentiment, entity extraction
│       ├── sources.ts            # Source definitions
│       └── ... utilities
├── config.yaml                   # Topic configuration
├── .env.example                  # Pexels API key (optional)
└── package.json
```

## Development Status

- **Status:** Production Ready
- **Version:** 0.1.0
- **Features:** Complete core (topic aggregation, dashboard, exports)
- **Planned:** AI suggestions, advanced filtering, collaboration

## Key Features by Phase

### Phase 1 (Current)
✅ Any-topic news aggregation  
✅ Multi-source support  
✅ Keyword filtering  
✅ Dashboard visualization  
✅ Markdown/CSV export  
✅ Dark/light theme  
✅ Sentiment tagging  
✅ Trending keywords  
✅ Topic memory/persistence  

### Phase 2 (Planned)
⏳ PDF report generation  
⏳ Advanced entity tagging  
⏳ Collaborative teams  
⏳ Email digests  
⏳ API for third-party integration  

## Deployment Options

- Local development (Next.js dev server)
- Production server (Next.js with Node.js)
- Vercel (serverless, recommended)
- Docker containerization
- Self-hosted cloud (AWS, GCP, Azure)

## Success Metrics

- [ ] Topic aggregation < 5 seconds
- [ ] Dashboard loads < 2 seconds
- [ ] Export PDF < 3 seconds
- [ ] Support 100+ sources simultaneously
- [ ] Sentiment accuracy > 80%
- [ ] Support 20+ languages (future)

## Contact & Support

**Repository:** https://github.com/rootstock-tech-org/Edustream-Illustrations_FE_BE  
**Branch:** news-report-builder  
**Status:** Active Development
