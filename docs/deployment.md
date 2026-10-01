# News-Report-Builder: Deployment Guide

## Prerequisites

- Node.js 22+
- npm or yarn
- Git
- 500MB disk space

## Local Development Setup

### 1. Clone Repository

```bash
git clone https://github.com/rootstock-tech-org/Edustream-Illustrations_FE_BE.git
cd Edustream-Illustrations_FE_BE
git checkout news-report-builder
```

### 2. Install Dependencies

```bash
npm ci
```

### 3. Environment Configuration

```bash
cp .env.example .env.local
```

**.env.local:**
```env
# Optional: Pexels API for topic images
PEXELS_API_KEY=

# Server port (default 4100)
PORT=4100
```

Get free Pexels API key at https://www.pexels.com/api/

### 4. Start Development Server

Dev runs on port **4100**:

```bash
npm run dev
```

Opens: http://localhost:4100

### 5. Verify Installation

- ✅ Home page loads with topic input
- ✅ Enter topic (e.g., "Sports")
- ✅ Select region and sources
- ✅ Dashboard displays news
- ✅ Export buttons work (PDF, CSV, Markdown)
- ✅ Save topic functionality works

## Production Build

### 1. Build

```bash
npm run build
```

Optimized for production:
- Minified JavaScript
- Code splitting
- Asset optimization
- ~2-5 minute build time

### 2. Production Server (Port 4100)

```bash
npm start
```

## Deployment Platforms

### Vercel (Recommended)

**Advantages:**
- Native Next.js support
- Auto-deployments
- Serverless (no ops)
- Free tier available

**Steps:**

1. Push to GitHub (news-report-builder branch)
2. Go to vercel.com
3. Connect repository
4. Select news-report-builder branch
5. Add .env vars (PEXELS_API_KEY)
6. Deploy

**Auto-refresh:** Every push deploys automatically

### Docker

**Dockerfile:**

```dockerfile
FROM node:22-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY . .

# Build
RUN npm run build

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001
USER nextjs

EXPOSE 4100

CMD ["npm", "start"]
```

**Build & Run:**

```bash
docker build -t news-report-builder .
docker run -p 4100:4100 news-report-builder
```

**docker-compose.yml:**

```yaml
version: '3.8'

services:
  news-report:
    build: .
    ports:
      - "4100:4100"
    environment:
      NODE_ENV: production
      PEXELS_API_KEY: ${PEXELS_API_KEY}
    restart: always
```

Run:
```bash
docker-compose up -d
```

### AWS Elastic Beanstalk

```bash
pip install awsebcli
eb init -p node.js-22 news-report-builder
eb create news-report-prod
eb setenv PEXELS_API_KEY=...
eb deploy
```

### GCP App Engine

**app.yaml:**

```yaml
runtime: nodejs22

env: standard

env_variables:
  NODE_ENV: "production"
  PEXELS_API_KEY: ${PEXELS_API_KEY}
```

**Deploy:**

```bash
gcloud app deploy
```

### Self-Hosted VPS

**Ubuntu/Debian:**

```bash
# Install Node 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone & build
cd /var/www
sudo git clone https://github.com/rootstock-tech-org/Edustream-Illustrations_FE_BE.git
cd Edustream-Illustrations_FE_BE
sudo git checkout news-report-builder
sudo npm ci --only=production
sudo npm run build

# Run with PM2
sudo npm install -g pm2
sudo pm2 start "npm start" --name news-report
sudo pm2 startup
sudo pm2 save
```

**Nginx Reverse Proxy:**

```nginx
server {
    listen 80;
    server_name news-report.example.com;

    location / {
        proxy_pass http://localhost:4100;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /_next/static {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

**Enable HTTPS:**

```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d news-report.example.com
```

## Configuration

### Environment Variables

**.env.local:**
```env
PEXELS_API_KEY=your_key_here
PORT=4100
NODE_ENV=development
```

### Topic Defaults (config.yaml)

```yaml
topic: ''
region: 'IN'  # India
sources: []
keywords: []
```

### Add Custom News Source

Edit `src/lib/sources.ts`:

```javascript
const SOURCES = [
  {
    id: "my-blog",
    name: "My Tech Blog",
    feed: "https://myblog.com/feed.xml",
    tier: 1,
    region: "global"
  },
  // ... more sources
];
```

Restart server to apply.

### Add Region

Edit `src/lib/regions.ts`:

```javascript
export const REGIONS = [
  { code: "IN", label: "India" },
  { code: "US", label: "United States" },
  { code: "GB", label: "United Kingdom" },
  // ... more regions
];
```

## Monitoring

### Health Check

```bash
curl http://localhost:4100/
# Should return 200 OK with homepage HTML
```

### Logs

**Development:**
```bash
npm run dev
# Logs visible in terminal
```

**Production (PM2):**
```bash
pm2 logs news-report
pm2 logs news-report --err  # Error logs only
```

**Docker:**
```bash
docker-compose logs -f news-report
```

### Performance Monitoring

Monitor API response times:

```bash
# Check dashboard load time
curl -w "Total: %{time_total}s\n" http://localhost:4100/dashboard
```

## Troubleshooting

### Issue: "Cannot find module 'compromise'"

**Solution:**
```bash
npm ci
npm run build
```

### Issue: Topic doesn't load news

**Solution:**
```bash
# Check sources are reachable
curl -I https://www.toi.com/feed.xml

# Verify RSS parsing
npm run dev  # Check console for errors
```

### Issue: PDF export fails

**Solution:**
```bash
# Verify jsPDF is installed
npm list jspdf

# Reinstall if needed
npm install jspdf
```

### Issue: Pexels images not showing

**Solution:**
```bash
# Images optional; app works without API key
# Remove PEXELS_API_KEY from .env if not set
# Dashboard shows gradient tiles instead
```

### Issue: Port 4100 already in use

**Solution:**
```bash
# Kill process using port
lsof -i :4100
kill -9 <PID>

# Or use different port
PORT=4200 npm start
```

## Performance Optimization

### Caching

**Static assets (Next.js default):**
- `_next/static/*` → 1 year cache
- `index.html` → no cache

**News API:**
- Implement Redis cache (future)
- Cache trending keywords
- Cache per-topic results

### Database Migration

For 10,000+ saved topics, migrate to database:

**PostgreSQL:**
```sql
CREATE TABLE topics (
  id UUID PRIMARY KEY,
  topic TEXT NOT NULL,
  region VARCHAR(10),
  sources TEXT[],
  keywords TEXT[],
  saved_at TIMESTAMP,
  user_id VARCHAR(255)
);

CREATE TABLE news (
  id UUID PRIMARY KEY,
  topic_id UUID,
  title TEXT,
  source VARCHAR(100),
  sentiment DECIMAL(2,1),
  keywords TEXT[],
  published_at TIMESTAMP,
  created_at TIMESTAMP
);

CREATE INDEX idx_topic ON news(topic_id);
CREATE INDEX idx_published ON news(published_at DESC);
```

Update API routes to use database instead of file/memory storage.

## Backup & Recovery

### Backup config.yaml

```bash
# Daily backup
cp config.yaml config.yaml.backup.$(date +%Y%m%d)

# Cloud backup
aws s3 cp config.yaml s3://my-backup-bucket/$(date +%Y%m%d).yaml
```

### Restore

```bash
cp config.yaml.backup.20261001 config.yaml
npm start
```

## Continuous Deployment

### GitHub Actions

**.github/workflows/deploy.yml:**

```yaml
name: Deploy to Vercel

on:
  push:
    branches: [news-report-builder]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '22'
      - run: npm ci
      - run: npm run build
      - uses: vercel/action@v5
```

## Maintenance Schedule

**Daily:**
- Monitor error logs
- Check news feed freshness

**Weekly:**
- Review trending keywords
- Update source feeds (add/remove)

**Monthly:**
- Dependency updates
- Security audit (`npm audit`)
- Database optimization

## Support & Resources

- **Docs:** https://nextjs.org/docs
- **GitHub Issues:** Report bugs
- **Compromise.js:** https://github.com/spencermountain/compromise
- **jsPDF:** https://github.com/parallax/jsPDF
- **Pexels API:** https://www.pexels.com/api/
