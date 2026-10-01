# Smart-Factory-Tools: Deployment Guide

## Prerequisites

- Node.js 22+
- npm or yarn
- Git
- 500MB disk space (dev + build artifacts)

## Local Development Setup

### 1. Clone Repository

```bash
git clone https://github.com/rootstock-tech-org/Edustream-Illustrations_FE_BE.git
cd Edustream-Illustrations_FE_BE
git checkout smart-factory-tools
```

### 2. Install Dependencies

```bash
npm ci
```

### 3. Start Development Server

```bash
npm run dev
```

Opens on http://localhost:5173 (Vite default port).

**Features:**
- Hot Module Replacement (HMR) - Changes reflect instantly
- WebGL debugging - Browser DevTools support

### 4. Verify Installation

- ✅ Homepage loads with 10 module buttons
- ✅ Click "Foundations" → loads 3D IoT stack
- ✅ Sliders work, 3D updates in real-time
- ✅ Dark/light theme toggle works
- ✅ Quiz button appears and loads questions
- ✅ No console errors

## Production Build

### 1. Build for Production

```bash
npm run build
```

Outputs to `dist/` directory:
- Optimized JavaScript (minified, tree-shaken)
- Compressed assets
- Source maps for debugging

**Build time:** 30-60 seconds

### 2. Preview Production Build Locally

```bash
npm run preview
```

Opens http://localhost:4173 - serves `dist/` with production settings.

### 3. Optimize WebGL Assets

Reduce bundle size for faster loading:

```bash
# Remove unused Three.js modules
# (handled automatically by Vite tree-shaking)

# Check bundle size
npm install -g webpack-bundle-analyzer
# (optional, for detailed analysis)
```

## Deployment Platforms

### Vercel (Recommended for SPAs)

**Advantages:**
- Native Vite support
- Auto-deployments from Git
- Edge caching
- Environment management

**Steps:**

1. Sign up at vercel.com
2. Connect GitHub repository
3. Select `smart-factory-tools` branch
4. Vercel auto-detects Vite configuration
5. Click Deploy

**Auto-refresh:** On git push to branch

### Netlify

**Steps:**

1. Sign up at netlify.com
2. Connect GitHub repository
3. Build command: `npm run build`
4. Publish directory: `dist`
5. Deploy

### Static Web Server (nginx)

**Dockerfile:**

```dockerfile
FROM node:22-alpine as builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Serve with nginx
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

**nginx.conf:**

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # SPA routing: all routes go to index.html
    location / {
        try_files $uri /index.html;
    }

    # Cache assets forever (Vite adds hash)
    location /_assets {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

**Build & Run:**

```bash
docker build -t smart-factory-tools:latest .
docker run -p 80:80 smart-factory-tools:latest
```

### AWS S3 + CloudFront

**Setup:**

1. Create S3 bucket for `dist/` contents
2. Configure S3 for static website hosting
3. Create CloudFront distribution pointing to S3
4. Set cache behaviors:
   - `/index.html` → Cache-Control: no-cache
   - `/_assets/*` → Cache-Control: max-age=31536000 (1 year)

**Deploy script:**

```bash
#!/bin/bash
npm run build
aws s3 sync dist/ s3://my-smart-factory-bucket/ --delete
aws cloudfront create-invalidation --distribution-id E123... --paths "/*"
```

### GCP Cloud Storage + CDN

**Setup:**

1. Create Cloud Storage bucket
2. Upload `dist/` contents
3. Configure Cloud CDN
4. Set appropriate cache headers

**Deploy:**

```bash
npm run build
gsutil -m rsync -r -d dist/ gs://my-smart-factory-bucket/
```

### Self-Hosted VPS

**Ubuntu/Debian:**

```bash
# Install Node for build
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone & build
cd /var/www
sudo git clone https://github.com/rootstock-tech-org/Edustream-Illustrations_FE_BE.git
cd Edustream-Illustrations_FE_BE
sudo git checkout smart-factory-tools
sudo npm ci
sudo npm run build

# Install nginx
sudo apt-get install -y nginx

# Copy dist to web root
sudo cp -r dist/* /var/www/html/

# Start nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

**Enable HTTPS (Let's Encrypt):**

```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d smart-factory.example.com
```

## Configuration

### Environment Variables

Vite exposes `VITE_*` prefixed vars at build time:

```bash
# .env.production
VITE_API_URL=https://api.example.com
VITE_FEATURE_CHALLENGES=true
```

Access in code:
```javascript
const apiUrl = import.meta.env.VITE_API_URL;
```

### Theme Configuration

**src/theme.jsx** - Dark/light theme colors

Customize accent colors in `src/data/modules.js` (each module has `accent` color).

### Accessibility Settings

Built into Tailwind CSS:
- High contrast mode (dark theme)
- Large text support (browser zoom)
- Keyboard navigation (arrow keys in 3D)

## Performance Optimization

### WebGL Optimization

**Reduce draw calls:**
- Batch similar geometries
- Use instancing for repeated objects
- LOD (Level of Detail) for distant objects

**Reduce memory:**
- Compress textures (WebP)
- Reuse materials and geometries
- Dispose unused resources

### Code Splitting

Vite automatically code-splits modules:

```bash
# Check bundle
npm run build
# Look at dist/ - each module is in separate .js file
```

### Caching Strategy

- **index.html** - No cache (serves latest)
- **_assets/** - Cache forever (Vite adds content hash)
- **Module chunks** - Cache forever (versioned)

## Monitoring

### Health Check

```bash
# Simple HTTP check
curl -I https://smart-factory.example.com/

# Should return 200 OK and serve index.html
```

### Performance Monitoring

**Client-side (add to App.jsx):**

```javascript
useEffect(() => {
  const perfObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      console.log(`${entry.name}: ${entry.duration}ms`);
    }
  });
  perfObserver.observe({ entryTypes: ['navigation', 'paint'] });
}, []);
```

**Analytics (optional):**

```javascript
// Add Google Analytics, Sentry, or custom telemetry
```

### Error Tracking

**Sentry integration (optional):**

```bash
npm install @sentry/react
```

```javascript
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: "https://YOUR_KEY@sentry.io/YOUR_PROJECT_ID",
  environment: import.meta.env.MODE,
});
```

## Troubleshooting

### Issue: "VITE_* not defined"

**Solution:**
```bash
# Restart dev server after adding .env
npm run dev
```

### Issue: WebGL context lost

**Solution:**
- Check browser DevTools → Console
- Verify GPU drivers are updated
- Test on different browser/machine

### Issue: Slow 3D rendering

**Solution:**
```javascript
// In Scene.jsx, reduce shadow quality
<directionalLight castShadow shadowMapSize={512} />  // Default 1024
```

### Issue: Module doesn't load

**Solution:**
```bash
# Verify all 10 module folders exist
ls src/tools/

# Check module imports in App.jsx
grep -r "import.*Tool" src/App.jsx
```

### Issue: Build size too large

**Solution:**
```bash
# Analyze what's large
npm run build -- --debug-build

# Check dependencies
npm ls three  # Three.js version
npm ls @react-three/fiber  # R3F version

# Remove unused deps
npm prune
```

## Continuous Deployment

### GitHub Actions

**.github/workflows/deploy.yml:**

```yaml
name: Deploy to Vercel

on:
  push:
    branches: [smart-factory-tools]

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
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
```

### GitLab CI

**.gitlab-ci.yml:**

```yaml
build:
  image: node:22
  script:
    - npm ci
    - npm run build
  artifacts:
    paths:
      - dist/

deploy:
  stage: deploy
  script:
    - npm ci
    - npm run build
    - # Deploy dist/ to server
```

## Rollback

If deployment fails:

```bash
# Check last working version
git log --oneline smart-factory-tools | head -5

# Rollback to previous commit
git revert <commit-hash>
git push

# Redeploy
# (CI/CD will auto-trigger)
```

## Maintenance Schedule

**Daily:**
- Monitor error logs
- Check WebGL compatibility reports

**Weekly:**
- Review performance metrics
- Update dependencies (minor versions)

**Monthly:**
- Major dependency updates
- Browser compatibility testing
- Security audit (npm audit)

## Support & Resources

- **Vite Docs:** https://vitejs.dev/
- **React Three Fiber:** https://docs.pmnd.rs/react-three-fiber/
- **Three.js:** https://threejs.org/docs/
- **Tailwind CSS:** https://tailwindcss.com/docs
- **GitHub Issues:** Report bugs and feature requests
