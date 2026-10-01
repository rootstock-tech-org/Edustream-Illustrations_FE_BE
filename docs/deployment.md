# Collab-Robotics-Engine: Deployment Guide

## Prerequisites

- Node.js 22+
- npm or yarn
- Git
- 500MB disk space (dependencies + data cache)
- PM2 (for automated refresh, optional)

## Local Development Setup

### 1. Clone Repository

```bash
git clone https://github.com/rootstock-tech-org/Edustream-Illustrations_FE_BE.git
cd Edustream-Illustrations_FE_BE
git checkout collab-robotics-engine
```

### 2. Install Dependencies

```bash
npm ci
# or
yarn install
```

### 3. Environment Configuration

No special env vars needed. Defaults work for local development.

### 4. Start Development Server

Development runs on **port 4200** (different from production's 4000):

```bash
npm run dev
```

Opens: http://localhost:4200

### 5. Verify Installation

- ✅ Dashboard loads with robotics news
- ✅ HRC category tags visible (Cobots, Safety, etc.)
- ✅ News appears on `/all` page
- ✅ Search works
- ✅ Papers load on `/papers`
- ✅ No console errors

## Production Build & Deployment

### 1. Build for Production

```bash
npm run build
```

Output:
- `.next/` - Compiled Next.js app
- Optimized for performance
- ~2-5 minute build time

### 2. Production Server (Port 4000)

```bash
npm start
# Runs on port 4000 by default
```

### 3. Automated News Refresh with PM2

PM2 manages the process and auto-refreshes news:

**Install PM2 globally:**
```bash
npm install -g pm2
```

**Start with PM2:**
```bash
# From project root
pm2 start ecosystem.config.cjs
```

**View status:**
```bash
pm2 status
pm2 logs collab-robotics
```

**Stop/Restart:**
```bash
pm2 stop collab-robotics
pm2 restart collab-robotics
pm2 delete collab-robotics
```

**ecosystem.config.cjs** auto-refreshes news every 2 hours and manages process restarts.

## Deployment Platforms

### Vercel (Recommended for Next.js)

**Advantages:**
- Native Next.js support
- Auto-deployments from Git
- Edge caching
- Environment variables managed

**Steps:**

1. Sign up at vercel.com
2. Connect GitHub repository
3. Import project (auto-detects Next.js)
4. Deploy

**Note:** Vercel can run cron functions to refresh news every 2 hours:

**.vercel/crons/refresh.yaml:**
```yaml
path: /api/cron/refresh-news
schedule: 0 */2 * * *
```

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

EXPOSE 4000
CMD ["npm", "start"]
```

**Build & Run:**

```bash
# Build image
docker build -t collab-robotics:latest .

# Run container (port 4000)
docker run -p 4000:4000 collab-robotics:latest
```

**docker-compose.yml:**

```yaml
version: '3.8'

services:
  collab-robotics:
    build: .
    ports:
      - "4000:4000"
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

```bash
# Install EB CLI
pip install awsebcli

# Initialize
eb init -p node.js-22 collab-robotics

# Create environment
eb create collab-robotics-prod

# Deploy
eb deploy

# View logs
eb logs
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
  max_instances: 5
```

**Deploy:**

```bash
gcloud app deploy
gcloud app browse
```

### Self-Hosted VPS

**Ubuntu/Debian Setup:**

```bash
# Install Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone repository
cd /opt
sudo git clone https://github.com/rootstock-tech-org/Edustream-Illustrations_FE_BE.git
cd Edustream-Illustrations_FE_BE
sudo git checkout collab-robotics-engine

# Install dependencies
sudo npm ci --only=production

# Build
sudo npm run build

# Install PM2
sudo npm install -g pm2

# Start with PM2
sudo pm2 start ecosystem.config.cjs
sudo pm2 startup
sudo pm2 save
```

**Nginx Reverse Proxy:**

```nginx
server {
    listen 80;
    server_name robotics.example.com;

    location / {
        proxy_pass http://localhost:4000;
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

**Enable HTTPS (Let's Encrypt):**

```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d robotics.example.com
```

## Automated News Refresh

### Option 1: PM2 (Recommended for VPS)

**ecosystem.config.cjs:**

```javascript
module.exports = {
  apps: [
    {
      name: 'collab-robotics',
      script: 'npm',
      args: 'start',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
      cron_restart: '0 */2 * * *',  // Restart every 2 hours
      error_file: './logs/err.log',
      out_file: './logs/out.log',
    },
  ],
};
```

**Monitor:**
```bash
pm2 monit
pm2 logs collab-robotics
```

### Option 2: Linux Cron

```bash
# Edit crontab
crontab -e

# Add: Run every 2 hours
0 */2 * * * cd /opt/Edustream-Illustrations_FE_BE && npm run build-news >> /var/log/robotics-news.log 2>&1
```

### Option 3: Vercel Cron Functions

`pages/api/cron/refresh.ts`:

```typescript
export async function GET(req: Request) {
  const secret = req.headers.get('authorization');
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Call buildNews here (trigger pipeline)
  // await buildNews();

  return new Response('News refreshed', { status: 200 });
}
```

`.vercel/crons/refresh.yaml`:

```yaml
path: /api/cron/refresh
schedule: 0 */2 * * *
```

## Configuration

### Change Active Robotics Sources

**File:** `data/sources.ts`

Toggle any source on/off:

```typescript
export const SOURCES: Source[] = [
  { name: "The Robot Report", feed: "...", tier: 1, on: true },   // Active
  { name: "Robohub", feed: "...", tier: 1, on: false },           // Disabled
];
```

Changes apply on next news rebuild.

### Adjusting HRC Filters

**File:** `data/sources.ts`

**Block additional domains:**
```typescript
export const BLOCKED_DOMAINS = [
  "finance.yahoo.com",
  "myspamsite.com",  // Add here
];
```

**Add noise words:**
```typescript
export const NOISE_WORDS = [
  "toy robot", "gaming robot", "consumer drone",  // Add here
];
```

### Change Ports

**Development (port 4200):**
```bash
npm run dev -- -p 5000  # Change to 5000
```

**Production (port 4000):**
Create `.env.local`:
```env
PORT=5000
```

```bash
npm start
```

## Monitoring & Maintenance

### Health Checks

**URL:** `GET http://localhost:4000/`

Should respond with:
- ✅ Dashboard HTML
- ✅ CSS loaded
- ✅ No console errors
- ✅ Robotics news visible

### Logs

**Development:**
```bash
npm run dev
# Logs visible in terminal
```

**Production (PM2):**
```bash
pm2 logs collab-robotics
pm2 logs collab-robotics --err  # Error logs only
pm2 save  # Save logs across restarts
```

**Docker:**
```bash
docker-compose logs -f collab-robotics
docker-compose logs collab-robotics --tail 100
```

### Performance Monitoring

**Build time:**
```bash
time npm run build
```

**Bundle size:**
```bash
npm install -g @next/bundle-analyzer
# Add to next.config.ts and rebuild
```

**Runtime profiling:**
Chrome DevTools → Performance tab → Record → Analyze

### Updating Dependencies

```bash
# Check for updates
npm outdated

# Update all
npm update

# Update specific package
npm update react@latest

# Rebuild and test
npm run build
npm start
```

## Troubleshooting

### Issue: "Port already in use"

**Solution:**
```bash
# Find process on port 4000
lsof -i :4000
# or
netstat -tuln | grep 4000

# Kill process
kill -9 <PID>

# Or use different port
PORT=5000 npm start
```

### Issue: "Module not found" after git pull

**Solution:**
```bash
rm -rf node_modules package-lock.json
npm ci
npm run build
```

### Issue: News not updating

**Solution:**
```bash
# Check data/news.json exists
ls -la data/news.json

# Verify PM2 is running news refresh
pm2 status
pm2 logs

# Check PM2 cron config
cat ecosystem.config.cjs
```

### Issue: HRC categories not showing

**Solution:**
```bash
# Verify curriculum.ts has 8 modules
grep 'id:' data/curriculum.ts

# Check tag.ts loads curriculum correctly
grep 'MODULES' lib/tag.ts

# Rebuild
npm run build
npm start
```

### Issue: Robotics sources not fetching

**Solution:**
```bash
# Test individual feeds
curl -I https://www.therobotreport.com/feed/
curl -I https://spectrum.ieee.org/feeds/topic/robotics.rss

# Check if on:true in data/sources.ts
grep 'on: false' data/sources.ts
```

### Issue: Build fails with TypeScript errors

**Solution:**
```bash
# Check TypeScript
npx tsc --noEmit

# Check ESLint
npm run lint

# Check dependencies
npm audit
```

## Backup & Recovery

### Backup News Data

```bash
# Daily backup
cp data/news.json data/news.json.backup.$(date +%Y%m%d)

# Cloud backup (AWS S3)
aws s3 cp data/news.json s3://robotics-news-backups/$(date +%Y%m%d).json
```

### Restore

```bash
# From local backup
cp data/news.json.backup.20261001 data/news.json
npm start

# From S3
aws s3 cp s3://robotics-news-backups/20261001.json data/news.json
npm start
```

## Performance Optimization

### Image Optimization

Auto-optimized:
- Limits concurrent fetches to 8
- Caches results per session
- Deduplicates images (shows each once)

**Further optimization:**

```typescript
// next.config.ts
export default {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.org' },
      { protocol: 'https', hostname: '**.com' },
    ],
    minimumCacheTTL: 60 * 60 * 24 * 365, // 1 year
  },
}
```

### Database Migration (for 1000+ articles)

Migrate from JSON to PostgreSQL:

```sql
CREATE TABLE articles (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  link TEXT UNIQUE,
  image TEXT,
  summary TEXT,
  source VARCHAR(100),
  sources TEXT[],
  module VARCHAR(50),  -- HRC module (cobots, safety, etc.)
  score DECIMAL(4,2),
  rumor BOOLEAN,
  published_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_module ON articles(module);
CREATE INDEX idx_published ON articles(published_at DESC);
```

Update pipeline.ts to insert into database instead of JSON.

## Support & Resources

- **Docs:** https://nextjs.org/docs
- **GitHub:** https://github.com/rootstock-tech-org/Edustream-Illustrations_FE_BE
- **IEEE Spectrum:** https://spectrum.ieee.org/
- **The Robot Report:** https://www.therobotreport.com/
- **Robohub:** https://robohub.org/
- **Fast XML Parser:** https://github.com/NaturalIntelligence/fast-xml-parser
- **Transformers.js:** https://github.com/xenova/transformers.js
