# SmartFactory-Unity-POC: Deployment Guide

## Prerequisites

- **Unity 2022 LTS** (or later)
- **Visual Studio 2019/2022** (for C# development)
- **WebGL Support** (in Unity Build Support)
- **Git** (for version control)

## Local Development Setup

### 1. Open Project in Unity

```bash
# Clone or open existing project
git clone <your-repo-url>
cd SmartFactory-Unity-POC
```

**In Unity Hub:**
1. Click "Open Project"
2. Select project folder
3. Unity 2022 LTS opens the project

### 2. Scene Setup

1. Open `Assets/Scenes/Main.unity` (or create new scene)
2. Create empty GameObject: `RobotArmController`
3. Add `RobotArmController` C# script component
4. Save scene

**In Scene Hierarchy:**
```
Scene
├─ RobotArmController (Script)
├─ Main Camera (will be auto-setup)
└─ [GameObjects created at runtime]
    ├─ FactoryWorld
    ├─ Rootie
    └─ [Station markers]
```

### 3. Edit & Test

```bash
# In Unity Editor:
1. Open scene
2. Press Play (Ctrl+P)
3. Scene initializes automatically
4. Verify:
   - Factory renders (30×30 floor visible)
   - Rootie appears and moves
   - Camera responds to mouse
   - Stations glow with cylinders

# Drag mouse to rotate view
# Scroll wheel to zoom
# Click on glowing station markers
```

### 4. Iterate & Build

Edit scripts → Save → Unity recompiles → Play/test → Repeat

## Production Builds

### WebGL Build (Browser)

**Setup:**
```
File → Build Settings
├─ Platform: WebGL
├─ Architecture: WebGL 2.0
├─ Compression: Brotli (for size)
├─ Development Build: OFF (for production)
└─ Scenes in Build: Add Main.unity
```

**Build:**
```bash
# Command line build
unity -quit -batchmode -buildWebGL

# Or File → Build in editor
# Output: <project>/Build/WebGL/
```

**WebGL Output Structure:**
```
Build/WebGL/
├─ index.html               (Entry point)
├─ TemplateData/
│   ├─ favicon.ico
│   ├─ progress-bar-full.png
│   └─ style.css
├─ [ProjectName].loader.js  (Bootstrap)
├─ [ProjectName].wasm       (Game code compiled to WebAssembly)
└─ [ProjectName].framework.js.br (Compressed framework)
```

**Host on Web Server:**
```bash
# Copy Build/WebGL/* to web server document root
# Access: https://your-domain.com/
```

### Standalone Build (Windows/Mac/Linux)

**Setup:**
```
File → Build Settings
├─ Platform: PC, Mac & Linux Standalone
├─ Target Platform: Windows (x86_64) / Mac / Linux
├─ Development Build: OFF
└─ Scenes in Build: Add Main.unity
```

**Build:**
```bash
# Windows
unity -quit -batchmode -buildWindowsPlayer <output-path>/SmartFactory.exe

# Mac
unity -quit -batchmode -buildOSXPlayer <output-path>/SmartFactory.app

# Linux
unity -quit -batchmode -buildLinuxPlayer <output-path>/SmartFactory
```

**Standalone Distribution:**
```
SmartFactory-Windows/
├─ SmartFactory.exe         (Executable)
├─ SmartFactory_Data/       (Game data)
│   ├─ resources.assets
│   ├─ managed/             (C# compiled code)
│   └─ globalgamemanagers
├─ [DLL files]
└─ [Mono runtime]
```

**Users:** Download, extract, run `.exe` or app

## Deployment Options

### Option 1: Vercel / Netlify (WebGL Static Hosting)

**Setup:**
1. Build WebGL locally: `Build/WebGL/`
2. Push to GitHub (main branch)
3. Connect Vercel/Netlify to GitHub repo
4. Configure build command:
   ```bash
   # vercel.json or netlify.toml
   {
     "buildCommand": "echo 'Skipping build'",
     "outputDirectory": "Build/WebGL"
   }
   ```
5. Deploy

**Access:** `https://your-project.vercel.app/`

### Option 2: GitHub Pages

**Setup:**
```bash
# Create gh-pages branch
git checkout --orphan gh-pages
git rm -rf .

# Build WebGL locally
# Copy Build/WebGL/* to repo root
git add .
git commit -m "Deploy SmartFactory WebGL"
git push origin gh-pages
```

**Access:** `https://username.github.io/SmartFactory-Unity-POC/`

### Option 3: AWS S3 + CloudFront

**Setup:**
1. Create S3 bucket: `smartfactory-web`
2. Enable "Static website hosting"
3. Set index document: `index.html`
4. Create CloudFront distribution pointing to S3

**Deploy:**
```bash
# Build WebGL locally
aws s3 sync Build/WebGL/ s3://smartfactory-web/ --delete

# Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id E1234ABCD \
  --paths "/*"
```

**Access:** `https://d1234.cloudfront.net/`

### Option 4: Self-Hosted Server (Nginx)

**Nginx Configuration:**
```nginx
server {
    listen 80;
    server_name smartfactory.example.com;
    root /var/www/smartfactory;
    
    # Gzip compression
    gzip on;
    gzip_types application/wasm;
    
    # Cache WebAssembly files long-term
    location ~* \.wasm$ {
        expires 365d;
        add_header Cache-Control "public, immutable";
    }
    
    # Don't cache HTML (updates frequently)
    location ~* \.html$ {
        expires -1;
        add_header Cache-Control "no-cache, must-revalidate";
    }
    
    # WebGL loader fallback
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

**Deploy:**
```bash
# Build WebGL locally
# Copy to server
scp -r Build/WebGL/* user@example.com:/var/www/smartfactory/

# Restart Nginx
ssh user@example.com "sudo systemctl restart nginx"
```

### Option 5: Docker Container

**Dockerfile (Nginx):**
```dockerfile
FROM node:18-alpine as builder
# (If you need to build in container)

FROM nginx:alpine
COPY Build/WebGL /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

**Build & Run:**
```bash
# Build image
docker build -t smartfactory:latest .

# Run container
docker run -p 80:3000 smartfactory:latest

# Access at http://localhost
```

**Docker Compose:**
```yaml
version: '3.8'
services:
  smartfactory:
    build: .
    ports:
      - "80:80"
    environment:
      - NODE_ENV=production
    restart: unless-stopped
```

## Configuration

### Module URLs

Edit `FactoryStation` component to configure which web modules open:

```csharp
// In Editor or script:
station.moduleUrl = "http://localhost:5173/?module=robotics&embed=1";
station.label = "Robotics";
station.glow = new Color(0.2f, 0.85f, 0.75f);  // Cyan
```

**URL Parameters:**
- `module=<name>` — Module to load (robotics, sensors, etc.)
- `embed=1` — Embed in WebGL iframe (vs. open in browser)
- `tour=1` — Resume from previous progress (optional)

### Web Module Integration

**WebGL-to-Web Communication:**
```csharp
// In FactoryStation.cs:
Application.OpenURL(moduleUrl);  // Opens in browser tab
```

**Potential Future Enhancement (IPC):**
```csharp
// Pseudo-code for future iframe communication:
public IEnumerator SendMessageToModule(string message)
{
    var www = new UnityWebRequest("http://localhost:5173/api/data");
    www.SetRequestHeader("Content-Type", "application/json");
    www.downloadHandler = new DownloadHandlerBuffer();
    yield return www.SendWebRequest();
    
    var response = www.downloadHandler.text;
    Debug.Log("Module responded: " + response);
}
```

## Performance Optimization

### Build Size

| Component | Size |
|-----------|------|
| WebAssembly (.wasm) | ~35 MB (uncompressed) |
| Brotli Compressed | ~8-12 MB |
| Loader JS | ~0.5 MB |
| Assets (embedded) | ~2 MB |
| **Total** | **~20 MB download** |

**Reduce Size:**
- Remove unused Unity modules (Build Settings)
- Use WebGL 2.0 ES3 (not ES2)
- Disable development symbols
- Compress with Brotli (best compression)

### Frame Rate

**WebGL Performance:**
- Target: 60 FPS
- Typical: 45-60 FPS (depends on GPU)
- Mobile: 30-45 FPS

**Optimize:**
- Reduce light count (currently 3)
- Disable shadows (not enabled by default)
- Use LOD (Level of Detail) for distant objects
- Batch static geometry
- Limit particle effects

### Loading Time

**Typical Times:**
- Initial download: 5-15 seconds (20 MB, depends on connection)
- Unity engine init: 2-3 seconds
- Scene load: 1-2 seconds
- **Total:** 8-20 seconds (first load)
- **Cached:** 2-3 seconds (repeat visits)

**Optimize:**
- Enable browser caching (HTTP headers)
- Use CDN for delivery (CloudFront, Cloudflare)
- Preload WebAssembly (browser hints)
- Compress with Brotli (best compression ratio)

## Monitoring & Maintenance

### Health Checks

**WebGL Build:**
```bash
# Check site loads
curl -I https://smartfactory.example.com/

# Check WebAssembly loads
curl -I https://smartfactory.example.com/*.wasm

# Verify index.html not cached too long
curl -i https://smartfactory.example.com/ | grep Cache-Control
```

**Standalone Build:**
```bash
# Check executable can start
./SmartFactory.exe  # Should launch window
```

### Logs & Debugging

**WebGL:**
1. Open browser DevTools (F12)
2. Console tab shows any JS/WebGL errors
3. Network tab shows resource loading
4. Performance tab monitors frame rate

**Standalone:**
1. Check `<AppName>_Data/output_log.txt`
2. Run with `-logFile` flag for custom location
3. Use built-in profiler (Window → Analysis → Profiler)

### Analytics

Track usage with Google Analytics (insert script in `index.html`):

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

### Issue: WebGL loads blank page

**Solution:**
1. Check browser console (F12) for errors
2. Verify WebAssembly (.wasm) file loads in Network tab
3. Ensure MIME type correct: `application/wasm`
4. Try different browser (compatibility issue)

**Nginx Fix:**
```nginx
types {
  application/wasm wasm;
}
```

### Issue: Stations not clickable

**Solution:**
1. Verify FactoryStation component added to scene
2. Check moduleUrl is valid (not 404)
3. Ensure collider not destroyed
4. Test raycasting: add Debug.Log in Update

### Issue: Rootie doesn't move

**Solution:**
1. Check RootieMentor component exists
2. Verify spots[] array has 6 entries
3. Check moveTarget updates correctly
4. Monitor movement speed (Lerp parameter)

### Issue: Slow loading on mobile

**Solution:**
1. Build with "Auto Graphics" disabled
2. Reduce mesh quality
3. Use LOD for far objects
4. Deliver via CDN (faster download)
5. Consider Standalone build instead

### Issue: Module URL doesn't open

**Solution:**
1. Check Application.OpenURL() works in browser
2. Verify moduleUrl is accessible (test in browser manually)
3. Check for CORS issues (if cross-origin)
4. Ensure iframe embedding supported by target URL

## Backup & Updates

### Version Control

```bash
# Tag releases
git tag -a v0.1.0 -m "Initial WebGL release"
git push origin v0.1.0

# Create release branch
git checkout -b release/v0.2.0

# Merge to main when ready
git merge release/v0.2.0 -m "Release v0.2.0"
git push origin main
```

### Build Versioning

In `RobotArmController.cs`:
```csharp
public const string VERSION = "0.1.0";
```

Display in UI or logs:
```csharp
Debug.Log("SmartFactory v" + VERSION);
```

### Rollback Procedure

```bash
# If deployment breaks, revert to previous build
git checkout v0.1.0
# Rebuild and redeploy
```

## Security Considerations

- **HTTPS everywhere** — Use TLS/SSL (Let's Encrypt free)
- **Content Security Policy (CSP)** — Restrict resource loading
- **X-Frame-Options** — Prevent clickjacking
- **CORS headers** — If embedding modules cross-origin

**Nginx Security Headers:**
```nginx
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
```

## Support & Resources

- **Unity Docs:** https://docs.unity3d.com/
- **WebGL Build Guide:** https://docs.unity3d.com/Manual/webgl-building.html
- **WebGL Networking:** https://docs.unity3d.com/Manual/webgl-networking.html
- **Deployment Platforms:**
  - Vercel: https://vercel.com/docs
  - Netlify: https://docs.netlify.com/
  - AWS: https://aws.amazon.com/getting-started/
  - Docker: https://docs.docker.com/

## Deployment Checklist

- [ ] Code committed and tagged with version
- [ ] All scripts compiled without errors
- [ ] Scene loads without warnings in console
- [ ] Rootie moves all 6 stops correctly
- [ ] All station markers clickable
- [ ] Module URLs valid and accessible
- [ ] WebGL build completes successfully
- [ ] Build size < 30 MB (uncompressed)
- [ ] Loads in < 30 seconds (on 4G)
- [ ] 60 FPS on target hardware
- [ ] Works on Chrome, Firefox, Safari
- [ ] HTTPS enabled and valid
- [ ] Security headers configured
- [ ] Analytics configured
- [ ] Team notified of deployment
- [ ] Rollback plan documented

---

**Ready to deploy?** Start with Vercel for easiest setup!
