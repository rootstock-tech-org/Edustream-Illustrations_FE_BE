# VLSI News Engine: Deployment Guide

## Prerequisites

- Node.js 22+
- npm or yarn
- Git
- 500MB disk space (for dependencies + data cache)

## Local Development Setup

### 1. Clone Repository

```bash
git clone https://github.com/rootstock-tech-org/Edustream-Illustrations_FE_BE.git
cd Edustream-Illustrations_FE_BE
git checkout vlsi-news-engine  # Use main branch with latest features
```

### 2. Install Dependencies

```bash
npm ci
# or
yarn install
```

### 3. Environment Configuration

Create `.env.local` (if needed; most settings work with defaults):

```env
# Optional: API keys if adding new features
# NEXT_PUBLIC_SEARCH_API_KEY=...
```

### 4. Generate Initial News Data

The `data/news.json` is version-controlled, but you can rebuild it:

```bash
# Fetch from all sources and regenerate news.json
npm run build-news
```

If the script doesn't exist, the dev server will auto-generate on first run.

### 5. Start Development Server

```bash
npm run dev
# or: npm run dev -- -p 4000  # Custom port
```

**Output:**
```
▲ Next.js 16.3.1
- Local:        http://localhost:3000 (or 4000)
- Environments: .env.local
```

Open http://localhost:3000 in your browser.

### 6. Verify Installation

- ✅ Dashboard loads (home page with recent news)
- ✅ News appears (check `/all` page)
- ✅ Search works (search bar on top)
- ✅ Papers load (check `/papers`)
- ✅ No console errors

## Production Build

### 1. Build for Production

```bash
npm run build
```

Outputs:
- `.next/` - Compiled Next.js app
- Optimized for performance
- ~2-5 minutes build time

### 2. Check Build

```bash
npm run lint
```

Should complete with no errors.

### 3. Start Production Server

```bash
npm start
# Runs on port 3000 by default
```

**Environment Variables for Production:**

```env
NODE_ENV=production
NEXT_PUBLIC_ANALYTICS_ID=...  # Optional: Vercel Analytics
```

### 4. Refresh News Data

To refresh news before deploying to production:

```bash
# Stop current server
npm run build-news  # If available
npm run build
npm start
```

## Deployment Platforms

### Vercel (Recommended for Next.js)

**Advantages:**
- Native Next.js support
- Automatic deployments from Git
- Edge caching
- Built-in analytics

**Steps:**

1. **Sign up** at vercel.com
2. **Connect GitHub** repository
3. **Import project:** Select repository and branch
4. **Configuration:** Vercel auto-detects Next.js
5. **Deploy:** Click "Deploy"

**Environment Variables:**
- Dashboard → Settings → Environment Variables
- None required (defaults work)

**Custom Domain:**
- Settings → Domains
- Add your domain
- Configure DNS

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

# Run
EXPOSE 3000
CMD ["npm", "start"]
```

**Build & Run:**

```bash
# Build image
docker build -t vlsi-news-engine:latest .

# Run container
docker run -p 3000:3000 vlsi-news-engine:latest
```

**docker-compose.yml:**

```yaml
version: '3.8'

services:
  vlsi-news:
    build: .
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
    restart: always
    volumes:
      - ./data:/app/data  # Persist news.json
```

Run:
```bash
docker-compose up -d
docker-compose logs -f
```

### AWS Elastic Beanstalk

**Setup:**

```bash
# Install EB CLI
pip install awsebcli

# Initialize
eb init -p node.js-22 vlsi-news-engine

# Create environment
eb create vlsi-prod

# Deploy
eb deploy
```

### GCP App Engine

**app.yaml:**

```yaml
runtime: nodejs22

env: standard

env_variables:
  NODE_ENV: "production"

automatic_scaling:
  min_instances: 1
  max_instances: 10
```

**Deploy:**

```bash
gcloud app deploy
gcloud app browse
```

### Self-Hosted (VPS)

**On Ubuntu/Debian:**

```bash
# Install Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone repository
cd /opt
git clone https://github.com/rootstock-tech-org/Edustream-Illustrations_FE_BE.git
cd Edustream-Illustrations_FE_BE
git checkout vlsi-news-engine

# Install dependencies
npm ci --only=production

# Build
npm run build

# Install PM2 for process management
sudo npm install -g pm2

# Start with PM2
pm2 start "npm start" --name vlsi-news-engine
pm2 startup
pm2 save

# Verify
pm2 status
```

**Nginx Reverse Proxy:**

```nginx
server {
    listen 80;
    server_name vlsi-news.example.com;

    location / {
        proxy_pass http://localhost:3000;
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

**Enable HTTPS (certbot):**

```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d vlsi-news.example.com
```

## Updating News Data

### Automatic (Scheduled)

**Option 1: Cron Job** (VPS)

```bash
# Edit crontab
crontab -e

# Add: Run every 2 hours
0 */2 * * * cd /opt/Edustream-Illustrations_FE_BE && npm run build-news >> /var/log/vlsi-news.log 2>&1
```

**Option 2: Vercel Cron Functions**

`.vercel/crons/refresh-news.yaml`:

```yaml
{
  "path": "/api/cron/refresh",
  "schedule": "0 */2 * * *"
}
```

`pages/api/cron/refresh.ts`:
```typescript
export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  // Call buildNews here
  return new Response('News refreshed', { status: 200 });
}
```

### Manual

```bash
# On dev machine
npm run build-news

# Commit & push
git add data/news.json
git commit -m "refresh: update news data"
git push

# On production
git pull
npm start
```

## Configuration

### Changing Active Sources

**File:** `data/sources.ts`

Toggle any source:
```typescript
{ name: "IEEE Spectrum", feed: "...", tier: 1, on: true },  // Active
{ name: "WikiChip Fuse", feed: "...", tier: 1, on: false }, // Disabled
```

Changes apply on next `npm run build-news`.

### Adjusting Filters

**File:** `data/sources.ts`

**Block additional domains:**
```typescript
export const BLOCKED_DOMAINS = [
  // Add more
  "myspamsite.com",
];
```

**Add noise words:**
```typescript
export const NOISE_WORDS = [
  // Add more
  "crypto", "nft", "web3",
];
```

**Add rumor words:**
```typescript
export const RUMOR_WORDS = [
  // Add more
  "allegedly", "unconfirmed",
];
```

Changes apply on rebuild.

### Changing Port

**Development:**
```bash
npm run dev -- -p 4000
```

**Production:**
Create `.env.local`:
```env
PORT=4000
```

```bash
npm start
```

## Optional: Embeddings & Semantic Search

To enable embeddings (embedding-wip branch):

### 1. Checkout Branch

```bash
git checkout embedding-wip
npm ci
npm run build
```

### 2. No Extra Setup Required

- `@xenova/transformers` already in dependencies
- Model (~50MB) downloads on first semantic search
- Subsequent uses: cached locally

### 3. Test Semantic Search

1. Open http://localhost:3000/search
2. Try a query like "processor architecture"
3. Tab to "Related by meaning" if available
4. Should show semantically similar articles

**Performance Note:** First search may take 3-5 seconds (model loading). Subsequent searches: 200-500ms.

## Monitoring & Maintenance

### Health Checks

**URL:** `GET http://localhost:3000/`

Should respond with:
- ✅ Dashboard HTML
- ✅ CSS loads (styled)
- ✅ No console errors
- ✅ News data visible

**Automated Health Check (production):**

```bash
# Add to cron
*/5 * * * * curl -f http://localhost:3000/ || systemctl restart vlsi-news
```

### Logs

**Development:**
```bash
# Visible in terminal
npm run dev
```

**Production (PM2):**
```bash
pm2 logs vlsi-news-engine
pm2 logs vlsi-news-engine --err  # Error logs only
```

**Docker:**
```bash
docker-compose logs -f vlsi-news
docker-compose logs vlsi-news --tail 100
```

**Vercel:**
Dashboard → Deployments → Logs

### Performance Monitoring

**Build Time:**
```bash
time npm run build
```

**Bundle Size:**
```bash
npm install -g @next/bundle-analyzer
# Add to next.config.js, run build
```

**Runtime Profiling:**
Chrome DevTools → Performance tab → Record → Interact → Analyze

### Updating Dependencies

```bash
# Check for updates
npm outdated

# Update all
npm update

# Or specific package
npm update react@latest

# Rebuild and test
npm run build
npm start
```

## Troubleshooting

### Issue: "Port 3000 already in use"

**Solution:**
```bash
# Find process using port 3000
lsof -i :3000
# Or
netstat -tuln | grep 3000

# Kill process
kill -9 <PID>

# Or use different port
npm run dev -- -p 4000
```

### Issue: "Module not found" after git pull

**Solution:**
```bash
# Clean install
rm -rf node_modules package-lock.json
npm ci

# Rebuild
npm run build
```

### Issue: News not updating

**Solution:**
```bash
# Check data/news.json exists
ls -la data/news.json

# Force rebuild
npm run build-news

# Verify timestamp in news.json
head -5 data/news.json
```

### Issue: Image loading fails

**Solution:**
- Verify feed sources are reachable: `curl https://semiengineering.com/feed/`
- Check User-Agent not blocked: add headers in pipeline.ts if needed
- Increase timeout if network is slow

### Issue: Semantic search not working

**Solution:**
- Check branch: `git branch` (should be embedding-wip)
- Verify @xenova/transformers in package.json
- Check browser console for errors
- Clear cache: Ctrl+Shift+Delete, reload

### Issue: Build fails

**Solution:**
```bash
# Check TypeScript
npx tsc --noEmit

# Check ESLint
npm run lint

# Check dependencies
npm audit
```

## Performance Tuning

### Image Optimization

VLSI News Engine automatically:
- Limits concurrent og:image fetches (8 parallel)
- Caches results per session
- Deduplicates images (shows each once)

To further optimize:

**next.config.ts:**
```typescript
export default {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.com' },
    ],
    minimumCacheTTL: 60 * 60 * 24 * 365, // 1 year
  },
}
```

### Caching Strategy

- **Static assets:** 1 year
- **News data:** 2 hours
- **Images:** 1 year (cached)
- **API responses:** 5 minutes (client-side)

### Database (if scaling)

For 1000+ articles, migrate to PostgreSQL:

```sql
CREATE TABLE articles (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  link TEXT UNIQUE,
  image TEXT,
  summary TEXT,
  source VARCHAR(100),
  sources TEXT[], -- Array of sources
  module VARCHAR(50),
  score DECIMAL(4,2),
  rumor BOOLEAN,
  published_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_published ON articles(published_at DESC);
CREATE INDEX idx_module ON articles(module);
```

Update pipeline to insert into database instead of JSON file.

## Backup & Recovery

### Backup News Data

```bash
# Daily backup
cp data/news.json data/news.json.backup.$(date +%Y%m%d)

# Long-term (AWS S3)
aws s3 cp data/news.json s3://vlsi-news-backups/$(date +%Y%m%d).json
```

### Restore

```bash
# From local backup
cp data/news.json.backup.20261001 data/news.json
npm start

# From S3
aws s3 cp s3://vlsi-news-backups/20261001.json data/news.json
npm start
```

## Support & Resources

- **Docs:** https://nextjs.org/docs
- **GitHub Issues:** https://github.com/rootstock-tech-org/Edustream-Illustrations_FE_BE/issues
- **Fast XML Parser:** https://github.com/NaturalIntelligence/fast-xml-parser
- **Transformers.js:** https://github.com/xenova/transformers.js
