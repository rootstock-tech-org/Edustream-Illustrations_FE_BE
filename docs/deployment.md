# VLSICleanroom-POC: Deployment Guide

## Prerequisites

- **Unity 2022 LTS** (or later)
- **Visual Studio 2019/2022** (C# development)
- **WebGL Support** (in Unity Build Support)
- **Git** (version control)

## Local Development Setup

### 1. Open Project in Unity

```bash
# Clone repository
git clone <your-repo-url>
cd VLSICleanroom-POC
```

**In Unity Hub:**
1. Click "Open Project"
2. Select project folder
3. Unity 2022 LTS opens it

### 2. Scene Setup

1. Open `Assets/Scenes/Main.unity`
2. Create empty GameObject: `CleanroomBootstrap`
3. Add `CleanroomBootstrap` C# script
4. Save scene

### 3. Edit & Test

```bash
# In Unity Editor:
1. Open scene
2. Press Play (Ctrl+P)
3. Scene initializes:
   - Fab renders (18×44 cleanroom visible)
   - 10 colored desk kiosks appear
   - Rootie Tutor appears and begins tour
   - Camera responds to mouse
4. Verify:
   - All 10 desks visible and glowing
   - Rootie rolls through aisle
   - Desk clicks open URLs
```

### 4. Iterate & Build

Edit scripts → Save → Unity recompiles → Test → Repeat

## Production Builds

### WebGL Build

**Setup:**
```
File → Build Settings
├─ Platform: WebGL
├─ Architecture: WebGL 2.0
├─ Compression: Brotli
├─ Development Build: OFF
└─ Scenes in Build: Add Main.unity
```

**Build:**
```bash
# Command line
unity -quit -batchmode -buildWebGL

# Or in Editor: File → Build
# Output: Build/WebGL/
```

**Output Structure:**
```
Build/WebGL/
├─ index.html              (Entry)
├─ TemplateData/
│   ├─ favicon.ico
│   ├─ progress-bar-full.png
│   └─ style.css
├─ [ProjectName].loader.js
├─ [ProjectName].wasm      (30 MB uncompressed)
└─ [ProjectName].framework.js.br
```

### Standalone Build

**Setup:**
```
File → Build Settings
├─ Platform: PC, Mac & Linux Standalone
├─ Development Build: OFF
└─ Scenes in Build: Add Main.unity
```

**Build:**
```bash
# Windows
unity -quit -batchmode -buildWindowsPlayer <path>/Cleanroom.exe

# Mac/Linux similarly
```

## Deployment Platforms

### Option 1: Vercel / Netlify (Recommended)

**Vercel:**
```bash
# Push to GitHub
git push origin main

# Go to vercel.com
# Connect repository
# Auto-deploy on every push
```

**Access:** `https://your-project.vercel.app/`

### Option 2: GitHub Pages

```bash
git checkout --orphan gh-pages
# Copy Build/WebGL/* to root
git add .
git commit -m "Deploy Cleanroom"
git push origin gh-pages
```

**Access:** `https://username.github.io/VLSICleanroom-POC/`

### Option 3: AWS S3 + CloudFront

```bash
# Build locally
# Deploy to S3
aws s3 sync Build/WebGL/ s3://cleanroom-web/ --delete

# Invalidate cache
aws cloudfront create-invalidation --distribution-id <ID> --paths "/*"
```

### Option 4: Docker

**Dockerfile:**
```dockerfile
FROM nginx:alpine
COPY Build/WebGL /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

**Run:**
```bash
docker build -t cleanroom:latest .
docker run -p 80:3000 cleanroom:latest
```

### Option 5: Self-Hosted (Nginx)

**nginx.conf:**
```nginx
server {
    listen 80;
    server_name cleanroom.example.com;
    root /var/www/cleanroom;
    
    gzip on;
    gzip_types application/wasm;
    
    location ~* \.wasm$ {
        expires 365d;
        add_header Cache-Control "public, immutable";
    }
    
    location ~* \.html$ {
        expires -1;
        add_header Cache-Control "no-cache";
    }
    
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

**Deploy:**
```bash
scp -r Build/WebGL/* user@example.com:/var/www/cleanroom/
ssh user@example.com "sudo systemctl restart nginx"
```

## Configuration

### Desk URLs

Configure in CleanRoom.cs:
```csharp
const string LAB_URL = "https://edustream-illustrations-fe-be.vercel.app";

// Each desk links to its process illustration:
new Desk("1. Deposition", "...", new Vector3(...), teal)
// Opens: LAB_URL + "?module=deposition"
```

### Camera Settings

In OrbitCamera.cs:
```csharp
public float distance = 20f;      // Initial zoom
public float sensitivity = 3f;    // Mouse sensitivity
public float maxPitch = 80f;      // Vertical angle limit
```

## Performance Optimization

### Build Size

| Component | Size |
|-----------|------|
| WebAssembly (.wasm) | ~30 MB (uncompressed) |
| Brotli Compressed | ~8-10 MB |
| Loader JS | ~0.5 MB |
| Assets | ~1 MB |
| **Total** | **~20 MB download** |

**Reduce Size:**
- Remove unused Unity modules
- Use WebGL 2.0 ES3
- Compress with Brotli
- Disable dev symbols

### Frame Rate

**Target:** 60 FPS  
**Typical WebGL:** 45-60 FPS  
**Mobile:** 30-45 FPS

**Optimize:**
- Reduce light count
- Disable shadows (if needed)
- Batch static geometry
- Use LOD for distant objects

### Loading Time

**Expected:**
- First load: 8-15s (20 MB download)
- Cached: 2-3s
- Scene init: 1-2s
- Total: 10-20s first, 3-5s subsequent

**Optimize:**
- Enable browser caching
- Use CDN (CloudFront, Cloudflare)
- Compress with Brotli
- Preload WebAssembly

## Monitoring & Debugging

### Health Checks

```bash
# WebGL site up
curl -I https://cleanroom.example.com/

# WebAssembly loads
curl -I https://cleanroom.example.com/*.wasm

# Cache headers correct
curl -i https://cleanroom.example.com/ | grep Cache-Control
```

### Logs & Debugging

**WebGL:**
1. Open browser DevTools (F12)
2. Console tab → check for errors
3. Network tab → verify asset loads
4. Performance tab → FPS monitor

**Standalone:**
1. Check `<AppName>_Data/output_log.txt`
2. Use `Window → Analysis → Profiler`
3. Monitor CPU/GPU usage

### Analytics

Add Google Analytics:
```html
<!-- In Build/WebGL/index.html -->
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'GA_ID');
</script>
```

## Troubleshooting

### Blank page on load
- Check browser console (F12) for errors
- Verify WebAssembly file loads
- Test different browser
- Check MIME types (application/wasm)

### Desks not clickable
- Verify DeskStation component added
- Check desk URLs valid
- Ensure collider active on screen
- Test raycasting with Debug.Log

### Rootie not moving
- Check RootieTutor component exists
- Verify desks[] array populated
- Check moveTarget updates
- Monitor movement logic

### Slow performance
- Disable shadows
- Reduce light count
- Use LOD
- Deliver via CDN
- Check GPU usage (Profiler)

### Module URLs don't open
- Verify URL accessible
- Check Application.OpenURL() works
- Test URL in browser manually
- Check for CORS issues (cross-origin)

## Backup & Versioning

```bash
# Tag releases
git tag -a v0.1.0 -m "Initial WebGL"
git push origin v0.1.0

# Create release branch
git checkout -b release/v0.2.0

# Rollback if needed
git checkout v0.1.0
# Rebuild and redeploy
```

## Security Headers

**Nginx:**
```nginx
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
```

**HTTPS:** Use Let's Encrypt (free)

## Deployment Checklist

- [ ] Code committed and tagged
- [ ] All scripts compile without errors
- [ ] Scene loads without warnings
- [ ] Rootie tours all 10 desks
- [ ] All 10 desks clickable
- [ ] URLs valid and accessible
- [ ] WebGL build completes
- [ ] Build size < 30 MB
- [ ] Loads in < 30 seconds
- [ ] 60 FPS on target hardware
- [ ] Works on Chrome, Firefox, Safari
- [ ] HTTPS enabled
- [ ] Security headers set
- [ ] Analytics configured
- [ ] Rollback plan documented

## Support & Resources

- **Unity WebGL Docs:** https://docs.unity3d.com/Manual/webgl-building.html
- **Vercel Docs:** https://vercel.com/docs
- **Netlify Docs:** https://docs.netlify.com/
- **AWS:** https://aws.amazon.com/getting-started/
- **Docker:** https://docs.docker.com/
