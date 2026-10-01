# Pick & Place Robot: Deployment Guide

## Local Development

### Prerequisites

- Node.js 18+ (with npm or pnpm)
- Git
- Modern browser (Chrome, Firefox, Safari, Edge)

### 5-Minute Setup

```bash
# 1. Clone the Smart Factory Tools repo
git clone https://github.com/rootstock-tech-org/Edustream-Illustrations_FE_BE.git
cd Edustream-Illustrations_FE_BE
git checkout smart-factory-tools

# 2. Install dependencies
npm ci
# or: pnpm install

# 3. Start dev server (Vite)
npm run dev
# Server runs on http://localhost:5173 with hot reload

# 4. Open in browser
# http://localhost:5173
# Navigate to Robotics module
```

**You're done!** The robotics simulator should load.

### Development Commands

```bash
# Start dev server (hot reload enabled)
npm run dev

# Build for production
npm run build

# Preview production build locally
npm run preview

# Run tests (if available)
npm test

# Lint code
npm run lint
```

## Production Deployment

### Static Hosting (Vercel, Netlify, GitHub Pages)

Since this is a Vite React app, it builds to static files.

**Build for Production:**
```bash
npm run build
# Output goes to dist/ folder
```

**Directory structure after build:**
```
dist/
├── index.html
├── assets/
│   ├── main-HASH.js       (bundled app code)
│   ├── main-HASH.css      (bundled styles)
│   └── ...
└── ...
```

### Vercel Deployment

**Option 1: Git-based deployment (recommended)**

1. Push code to GitHub
2. Go to vercel.com
3. Click "New Project"
4. Select your repository
5. Framework: Auto-detect (Vite)
6. Click "Deploy"
7. Done! Auto-deploys on every push

**Option 2: CLI deployment**

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy to production
vercel --prod

# Follow prompts for configuration
```

**Vercel Configuration (vercel.json):**
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "devCommand": "npm run dev",
  "framework": "vite"
}
```

### Netlify Deployment

**Option 1: Git-based deployment**

1. Push code to GitHub
2. Go to netlify.com
3. Click "New site from Git"
4. Select your repository
5. Build command: `npm run build`
6. Publish directory: `dist`
7. Click "Deploy site"
8. Done!

**Option 2: Drag & drop**

```bash
npm run build
# Drag dist/ folder to Netlify web interface
```

**netlify.toml Configuration:**
```toml
[build]
  command = "npm run build"
  publish = "dist"

[dev]
  command = "npm run dev"
  targetPort = 5173
```

### GitHub Pages Deployment

**Using GitHub Actions:**

Create `.github/workflows/deploy.yml`:
```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: 18
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build
        run: npm run build
      
      - name: Deploy
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
```

Access at: `https://username.github.io/repo-name/`

### Traditional Web Server (Nginx)

**Nginx Configuration:**

```nginx
server {
    listen 80;
    server_name robot-simulator.example.com;
    root /var/www/pick-place-robot/dist;
    
    # Gzip compression
    gzip on;
    gzip_types text/html application/javascript text/css;
    
    # Cache assets (long-term)
    location ~* \.(js|css|png|jpg|webp)$ {
        expires 365d;
        add_header Cache-Control "public, immutable";
    }
    
    # Don't cache HTML (updates needed quickly)
    location ~* \.html?$ {
        expires -1;
        add_header Cache-Control "no-cache, must-revalidate";
    }
    
    # SPA fallback (route all 404s to index.html)
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

**Deploy:**
```bash
# Build locally
npm run build

# Copy to server
scp -r dist/* user@example.com:/var/www/pick-place-robot/dist/

# Restart Nginx
ssh user@example.com "sudo systemctl restart nginx"
```

### Docker Deployment

**Dockerfile:**

```dockerfile
# Build stage
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM node:18-alpine
WORKDIR /app
RUN npm install -g serve
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["serve", "-s", "dist", "-l", "3000"]
```

**Build & Run:**
```bash
# Build image
docker build -t pick-place-robot:latest .

# Run container
docker run -p 3000:3000 pick-place-robot:latest

# Access at http://localhost:3000
```

**Docker Compose:**

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    restart: unless-stopped
```

Run with:
```bash
docker-compose up -d
```

### AWS Deployment

**Option 1: AWS Amplify (easiest)**

```bash
# Install Amplify CLI
npm install -g @aws-amplify/cli

# Initialize
amplify init

# Add hosting
amplify add hosting
# Select "Hosting with Amplify Console"
# Manual deployment

# Build and deploy
npm run build
amplify publish
```

**Option 2: AWS S3 + CloudFront**

```bash
# Build
npm run build

# Sync to S3
aws s3 sync dist/ s3://your-bucket-name/

# Invalidate CloudFront cache (if using CDN)
aws cloudfront create-invalidation --distribution-id DIST_ID --paths "/*"
```

**S3 Bucket Configuration:**
- Enable "Static website hosting"
- Set index document: `index.html`
- Set error document: `index.html` (for SPA routing)
- Enable "Block public access" = OFF (if public)
- Or use CloudFront distribution for HTTPS/CDN

### Google Cloud Deployment

**Cloud Run (serverless):**

```bash
# Build
npm run build

# Create Dockerfile (see Docker section above)

# Deploy
gcloud run deploy pick-place-robot \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```

**Firebase Hosting:**

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Initialize
firebase init hosting

# Build
npm run build

# Deploy
firebase deploy
```

### Azure Deployment

**Azure App Service:**

```bash
# Install Azure CLI
# https://docs.microsoft.com/en-us/cli/azure/install-azure-cli

# Build locally
npm run build

# Deploy
az webapp up --name pick-place-robot --runtime "node|18-lts"
```

## Configuration

### Environment Variables

Create `.env.local` for local development:

```env
VITE_APP_NAME=Pick & Place Robot
VITE_API_URL=http://localhost:5173
NODE_ENV=development
```

Create `.env.production` for production:

```env
VITE_APP_NAME=Pick & Place Robot
VITE_API_URL=https://robot-simulator.example.com
NODE_ENV=production
```

Access in code:
```javascript
console.log(import.meta.env.VITE_APP_NAME);
```

### Vite Configuration

File: `vite.config.js`

```javascript
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  base: '/',  // or '/subdirectory/' if not at root
  build: {
    outDir: 'dist',
    sourcemap: false,  // disable for production
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three', '@react-three/fiber', '@react-three/drei'],
        },
      },
    },
  },
  server: {
    port: 5173,
    open: true,
  },
});
```

## Performance Optimization

### Build-Time Optimization

```bash
# Analyze bundle size
npm install -D rollup-plugin-visualizer
# Then configure in vite.config.js
```

### Runtime Optimization

- **Lazy load non-critical components** (educational content tabs)
- **Use React.memo() for static panels**
- **Defer non-essential 3D objects** (fence, grid helpers)
- **Compress assets** (gzip, brotli at web server level)
- **Use CDN** (Vercel/Netlify auto-CDN, or CloudFront for AWS)

### Recommended Vite Settings

```javascript
export default defineConfig({
  build: {
    target: 'esnext',           // Modern browsers only
    minify: 'terser',           // Fast minification
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three', '@react-three/fiber', '@react-three/drei'],
        },
      },
    },
  },
  // ...
});
```

## Monitoring & Maintenance

### Health Checks

**Vercel/Netlify:** Auto-monitoring built-in

**Self-hosted (Nginx):**

```bash
# Check site is up
curl -I https://robot-simulator.example.com

# Check logs
tail -f /var/log/nginx/error.log
tail -f /var/log/nginx/access.log
```

### Performance Monitoring

Use **Web Vitals** in browser:
```javascript
import { getCLS, getFID, getFCP, getLCP, getTTFB } from 'web-vitals';

getCLS(console.log);
getFID(console.log);
getFCP(console.log);
getLCP(console.log);
getTTFB(console.log);
```

### Analytics

Add Google Analytics or Plausible to track usage:

```html
<!-- In index.html -->
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'GA_ID');
</script>
```

## Troubleshooting

### Issue: Blank page on production

**Solution:**
1. Check browser console for errors
2. Verify `base` setting in vite.config.js matches deployment URL
3. Check HTML file is served correctly
4. Verify assets are loading (check Network tab)

### Issue: 3D scene not rendering

**Solution:**
1. Check WebGL support: `https://www.khronos.org/webgl/wiki/Getting_Started`
2. Try incognito mode (hardware acceleration sometimes disabled)
3. Update graphics drivers
4. Test on different browser

### Issue: Slow performance

**Solution:**
1. Reduce WebGL quality (disable shadows, lower resolution)
2. Reduce animation frame rate (25 FPS instead of 60)
3. Enable production build optimization
4. Use CDN for static assets
5. Consider Web Workers for simulation

### Issue: CORS errors

**Solution:**
1. Ensure app doesn't make external API calls
2. If needed, use a CORS proxy or configure server headers
3. For self-hosted, configure Nginx/Apache CORS headers

## Backup & Updates

### Backup Procedure

```bash
# Backup current build
cp -r dist/ dist.backup.$(date +%Y%m%d_%H%M%S)

# Backup source code
git tag v1.0.0
git push origin v1.0.0
```

### Update Procedure

```bash
# Pull latest code
git pull origin main

# Update dependencies
npm ci

# Test locally
npm run dev

# Build
npm run build

# Deploy
# (use your deployment method above)

# Tag release
git tag v1.1.0
git push origin v1.1.0
```

## Security Considerations

- **HTTPS everywhere** — Use Let's Encrypt (free)
- **Content Security Policy (CSP)** — Restrict resource loading
- **X-Frame-Options** — Prevent clickjacking
- **X-Content-Type-Options: nosniff** — Prevent MIME sniffing
- **Dependencies** — Run `npm audit` regularly
- **Secrets** — Never commit API keys to git (use .env files)

**Nginx Security Headers:**

```nginx
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
```

## Support & Resources

- **Next.js Docs:** https://nextjs.org/docs
- **Vite Docs:** https://vitejs.dev/guide/
- **React Three Fiber:** https://docs.pmnd.rs/react-three-fiber/
- **Three.js Docs:** https://threejs.org/docs/
- **Vercel Docs:** https://vercel.com/docs
- **Netlify Docs:** https://docs.netlify.com/

## Deployment Checklist

- [ ] Code committed to git
- [ ] All tests passing
- [ ] Build completes without errors
- [ ] No console errors in production build
- [ ] Performance acceptable (Core Web Vitals green)
- [ ] 3D scene renders correctly
- [ ] Responsive design tested (mobile/tablet/desktop)
- [ ] Accessibility check (keyboard navigation, contrast)
- [ ] HTTPS enabled
- [ ] Security headers configured
- [ ] Analytics configured
- [ ] Monitoring set up
- [ ] Documentation updated
- [ ] Team notified of deployment
- [ ] Rollback plan in place

---

**Ready to deploy?** Start with Vercel or Netlify for easiest setup!
