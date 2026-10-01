# News-Report-Builder: Architecture

## System Architecture

```
┌─────────────────────────────────────────────────────┐
│      React Next.js Frontend                         │
│  ├─ Home (topic entry)                              │
│  ├─ Sources (source selection)                      │
│  ├─ Keywords (keyword definition)                   │
│  └─ Dashboard (news display, filtering)             │
└────────────────┬────────────────────────────────────┘
                 │ HTTP
    ┌────────────▼──────────────────┐
    │    Next.js API Routes          │
    │  ├─ config/route.ts            │
    │  ├─ news/route.ts              │
    │  ├─ sources/route.ts           │
    │  ├─ keywords/route.ts          │
    │  ├─ topics/route.ts (memory)   │
    │  ├─ trends/route.ts            │
    │  ├─ suggest/route.ts           │
    │  ├─ memory/route.ts            │
    │  └─ thumb/route.ts             │
    └────────────┬─────────────────────┘
                 │
    ┌────────────▼──────────────────────────────┐
    │   Processing Pipeline                     │
    │  ├─ Fetch news from sources               │
    │  ├─ Parse HTML/RSS                        │
    │  ├─ Normalize (title, summary, date)      │
    │  ├─ Tag with keywords                     │
    │  ├─ Sentiment analysis (NLP)              │
    │  ├─ Entity extraction                     │
    │  └─ Store in memory/cache                 │
    └────────────┬──────────────────────────────┘
                 │
    ┌────────────▼──────────────────────────────┐
    │   Data Storage                            │
    │  ├─ config.yaml (current topic)           │
    │  ├─ Memory (saved topics)                 │
    │  └─ News cache (results)                  │
    └───────────────────────────────────────────┘
                 │
    ┌────────────▼──────────────────────────────┐
    │   Export & Report Generation              │
    │  ├─ PDF (jsPDF)                           │
    │  ├─ Markdown                              │
    │  └─ CSV                                   │
    └───────────────────────────────────────────┘
```

## Core Modules

### 1. **config.yaml** - Topic Configuration

```yaml
topic: "AI chips"           # Topic name
region: "IN"                # Region code
sources:                    # Selected news sources
  - "Times of India"
  - "TechCrunch"
  - "Business Standard"
keywords:                   # Filtering keywords
  - "TSMC"
  - "Samsung"
  - "process node"
  - "6G"
```

**Usage:**
- Set via `/api/config` POST
- Used by news fetching pipeline
- Persisted in-memory or file-based

### 2. **src/app/api/config/route.ts** - Config Management

**Endpoints:**
- `GET /api/config` - Fetch current config
- `POST /api/config` - Set topic config
- Response: `{topic, region, sources, keywords}`

**Logic:**
- Validates inputs
- Updates config.yaml
- Triggers news refresh
- Returns updated state

### 3. **src/app/api/news/route.ts** - News Fetching

**Endpoints:**
- `GET /api/news?topic=...&region=...&limit=50` - Fetch news

**Process:**
```
1. Fetch from all configured sources (parallel)
2. Parse RSS/HTML
3. Filter by keywords
4. Tag with sentiment
5. Sort by relevance
6. Return paginated results
```

**Output:**
```json
{
  "articles": [
    {
      "title": "TSMC announces 3nm",
      "link": "...",
      "source": "TechCrunch",
      "publishedAt": "2026-10-01T12:00:00Z",
      "summary": "...",
      "keywords": ["TSMC", "process node"],
      "sentiment": "positive",
      "entities": {"COMPANY": ["TSMC"], "LOCATION": ["Taiwan"]}
    }
  ],
  "total": 250,
  "page": 1,
  "perPage": 50
}
```

### 4. **src/app/api/sources/route.ts** - Source Management

**Endpoints:**
- `GET /api/sources` - List all sources
- `POST /api/sources` - Add custom source

**Sources Config:**
```javascript
const SOURCES = [
  { id: "toi", name: "Times of India", feed: "https://...", tier: 1, region: "IN" },
  { id: "techcrunch", name: "TechCrunch", feed: "https://...", tier: 1, region: "global" },
  // ... 50+ predefined sources
];
```

### 5. **src/app/api/keywords/route.ts** - Keyword Management

**Endpoints:**
- `GET /api/keywords` - Get topic keywords
- `POST /api/keywords` - Add keyword
- `DELETE /api/keywords?keyword=...` - Remove keyword

**Usage:**
- Filter news articles
- Score relevance
- Trending keyword tracking

### 6. **src/app/api/topics/route.ts** - Topic Memory

**Endpoints:**
- `GET /api/topics` - List saved topics
- `POST /api/topics` - Save current topic
- `DELETE /api/topics?id=...` - Delete saved topic

**Saved Topic Format:**
```javascript
{
  id: "uuid",
  topic: "Elections 2026",
  region: "IN",
  sources: ["Times of India", "..."],
  keywords: ["vote", "candidate", "..."],
  savedAt: 1726237200000,
  metadata: {...}
}
```

### 7. **src/app/api/trends/route.ts** - Trending Analysis

**Endpoints:**
- `GET /api/trends?days=7` - Get trending keywords

**Logic:**
- Count keyword frequency per day
- Calculate trend score
- Return top 10 trending

**Output:**
```json
{
  "trends": [
    {"keyword": "AI", "count": 45, "trend": "up"},
    {"keyword": "chips", "count": 38, "trend": "stable"}
  ]
}
```

### 8. **src/app/api/memory/route.ts** - Persistent Memory

**Endpoints:**
- `GET /api/memory?topic=...` - Get topic notes
- `POST /api/memory` - Save topic notes

**Stores:**
- Topic history
- User notes per topic
- Analysis results

### 9. **src/app/api/suggest/route.ts** - AI Suggestions

**Future AI Integration:**
- Suggest related keywords
- Recommend sources
- Highlight key entities
- Generate summaries

### 10. **NLP Pipeline (lib/nlp.ts)**

**Sentiment Analysis:**
```javascript
import nlp from "compromise";

function analyzeSentiment(text) {
  const doc = nlp(text);
  // Detect positive, negative, neutral words
  // Return score: -1 to +1
}
```

**Entity Extraction:**
```javascript
function extractEntities(text) {
  const doc = nlp(text);
  return {
    PERSON: doc.people().out("array"),
    COMPANY: doc.organizations().out("array"),
    LOCATION: doc.places().out("array")
  };
}
```

### 11. **Pages**

**Home Page (src/app/page.tsx)**
- Topic input field
- Region selector
- Example topics (cycling)
- Saved topics list
- Load/delete saved topics

**Sources Page (src/app/sources/page.tsx)**
- List 50+ predefined sources
- Region-aware filtering
- Checkboxes to select sources
- Add custom source form
- Next button → keywords

**Keywords Page (src/app/keywords/page.tsx)**
- Input field for keywords
- Suggested keywords (trending)
- Keyword list with delete
- AI-suggested related keywords (future)
- Next button → dashboard

**Dashboard Page (src/app/dashboard/page.tsx)**
- News grid/list
- Filter by: keyword, sentiment, date range
- Search within results
- Trending keywords sidebar
- Export buttons (PDF, Markdown, CSV)
- Dark/light theme toggle

### 12. **Export Handlers**

**PDF Export (jsPDF):**
```javascript
const doc = new jsPDF();
doc.text(`Report: ${topic}`, 10, 10);
articles.forEach((article, i) => {
  doc.text(article.title, 10, 20 + i * 30);
  doc.text(article.summary, 10, 25 + i * 30, { maxWidth: 190 });
});
doc.save("report.pdf");
```

**Markdown Export:**
```markdown
# Report: AI Chips

## Trending Keywords
- TSMC (45 mentions)
- Samsung (38 mentions)

## Articles
### TSMC announces 3nm
- Source: TechCrunch
- Sentiment: Positive
- Entities: [TSMC, Taiwan]
- Content...
```

**CSV Export:**
```csv
title,source,date,sentiment,keywords,url
"TSMC announces 3nm","TechCrunch","2026-10-01","positive","TSMC,chip","..."
```

## Data Flow

### Topic Search Flow

```
User enters topic + region
    ↓
POST /api/config with topic, region
    ↓
Frontend redirects to /sources
    ↓
User selects sources
    ↓
POST /api/config with sources
    ↓
Frontend redirects to /keywords
    ↓
User enters keywords (or auto-suggest)
    ↓
POST /api/config with keywords
    ↓
Frontend redirects to /dashboard
    ↓
GET /api/news (with config)
    ↓
Backend fetches from all sources
    ↓
Parse, tag, sentiment, filter by keywords
    ↓
Return paginated results
    ↓
Display in dashboard
```

### News Update Cycle

```
Scheduled (every 2 hours) or manual trigger
    ↓
For each configured source:
  - Fetch RSS/HTML
  - Extract: title, link, summary, date, image
  - Parse HTML entities
  ↓
For each article:
  - Extract entities (NLP)
  - Calculate sentiment
  - Match keywords
  - Score relevance
  ↓
Filter by keywords
    ↓
Sort by recency + relevance + sentiment
    ↓
Cache in memory
    ↓
Update dashboard (real-time or on-demand)
```

## Performance Characteristics

| Operation | Time |
|-----------|------|
| Topic search | < 5s (fetch from 50 sources) |
| Dashboard load | < 2s |
| Export PDF | < 3s |
| Sentiment analysis | 10-50ms per article |
| Search within results | < 100ms |
| Trending calculation | < 500ms (7-day window) |

## API Response Examples

**GET /api/config:**
```json
{
  "topic": "AI chips",
  "region": "IN",
  "sources": ["Times of India", "TechCrunch"],
  "keywords": ["TSMC", "Samsung", "6G"]
}
```

**GET /api/news:**
```json
{
  "articles": [
    {
      "id": "article-123",
      "title": "TSMC expands in Arizona",
      "link": "https://...",
      "source": "TechCrunch",
      "image": "https://...",
      "summary": "TSMC announces 5 billion investment...",
      "publishedAt": "2026-10-01T12:30:00Z",
      "keywords": ["TSMC", "investment"],
      "sentiment": 0.75,
      "entities": {"COMPANY": ["TSMC"], "LOCATION": ["Arizona", "USA"]}
    }
  ],
  "meta": {"total": 250, "page": 1, "perPage": 50}
}
```

## Extensibility

### Add New Source

1. Add to `SOURCES` array in `lib/sources.ts`
2. Include: name, feed URL, tier, region
3. Restart or hot-reload

### Add New Region

1. Add to `REGIONS` in `lib/regions.ts`
2. Configure source availability per region
3. Update region filtering in API

### Custom NLP

Replace Compromise.js with:
- SpaCy (Python bridge)
- Hugging Face (API)
- Custom trained models

### Database Integration

Replace in-memory/file storage with:
- PostgreSQL
- MongoDB
- DynamoDB

## Security

- No credentials in code
- API keys in .env (Pexels optional)
- User data in browser localStorage (topics)
- No external API calls for news (RSS/scraping only)

## Testing

- Unit tests for NLP (sentiment, entities)
- Integration tests for API routes
- Manual testing of dashboard
- Export format validation (PDF, CSV, Markdown)
