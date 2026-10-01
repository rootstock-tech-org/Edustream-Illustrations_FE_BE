# NTPC-MSW-Segmentor: Frontend Deployment

## Local Development (Simple)

### 1. Direct File Opening

```bash
# Navigate to project folder
cd ~/.ntpc

# Open in browser
# Double-click dashboard.html
# OR use: python -m http.server 8000
# Then visit: http://localhost:8000/dashboard.html
```

**Limitation:** File:// protocol may block webcam/clipboard access. Use local server instead.

### 2. Simple HTTP Server

**Python 3:**
```bash
cd ~/.ntpc
python -m http.server 8000
# Visit http://localhost:8000/dashboard.html
```

**Python 2:**
```bash
python -m SimpleHTTPServer 8000
```

**Node.js:**
```bash
npx http-server . -p 8000
```

**PHP:**
```bash
cd ~/.ntpc
php -S localhost:8000
```

### 3. With Flask Backend (Recommended)

```bash
cd ~/.ntpc

# Install dependencies
pip install flask torch torchvision

# Run backend (starts frontend too)
python app.py

# OR start Flask server separately
python server.py
# Then open http://localhost:5000
```

## Production Deployment

### Static File Hosting

Since `dashboard.html` is a single HTML file, deploy as static content:

**GitHub Pages:**
```bash
# Copy to gh-pages branch
git checkout gh-pages
cp dashboard.html .
git add dashboard.html
git commit -m "Deploy dashboard"
git push origin gh-pages
# Access: https://username.github.io/repo/dashboard.html
```

**Netlify:**
1. Drag & drop dashboard.html
2. Auto-deployed
3. Get shareable URL

**Vercel:**
```bash
npm install -g vercel
vercel --prod
```

**Traditional Web Server (Nginx):**

```nginx
server {
    listen 80;
    server_name waste-segmentor.ntpc.local;
    root /var/www/msw-dashboard;
    
    location / {
        try_files $uri =404;
    }
    
    location ~ \.html?$ {
        add_header Cache-Control "no-cache, must-revalidate";
    }
}
```

**Copy dashboard.html:**
```bash
sudo cp dashboard.html /var/www/msw-dashboard/
sudo systemctl restart nginx
```

### Docker Deployment

**Dockerfile (frontend + backend):**

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install -r requirements.txt

# Copy files
COPY dashboard.html .
COPY app.py .
COPY server.py .
COPY models/ models/

EXPOSE 5000
CMD ["python", "app.py"]
```

**Build & Run:**
```bash
docker build -t msw-segmentor .
docker run -p 5000:5000 msw-segmentor
# Access: http://localhost:5000
```

**docker-compose.yml:**
```yaml
version: '3'
services:
  msw-app:
    build: .
    ports:
      - "5000:5000"
    volumes:
      - ./uploads:/app/uploads
    environment:
      - MODEL_PATH=/app/models/msw_yolov8l_detect_best.pt
```

### Cloud Deployment

**AWS (Elastic Beanstalk):**
```bash
eb init msw-segmentor
eb create production
eb deploy
```

**Google Cloud (Cloud Run):**
```bash
gcloud run deploy msw-segmentor \
  --source . \
  --platform managed \
  --region us-central1
```

**Azure (App Service):**
```bash
az webapp up --name msw-segmentor
```

## Configuration

### Environment Variables

**.env:**
```env
FLASK_ENV=production
MODEL_PATH=./models/msw_yolov8l_detect_best.pt
API_PORT=5000
MAX_IMAGE_SIZE=10485760  # 10 MB
CONFIDENCE_DEFAULT=0.5
IOU_DEFAULT=0.5
```

### Model Configuration

Edit in dashboard.html:
```javascript
const CONFIG = {
  modelName: 'msw_yolov8l_detect',
  classNames: ['Plastic', 'Metal', 'Organic', 'Paper', 'Glass', 'Other'],
  apiEndpoint: 'http://localhost:5000/api',
  confidenceMin: 0.1,
  confidenceMax: 0.99,
};
```

## Performance Optimization

### Frontend
- Minify dashboard.html (remove whitespace)
- Compress images (use WebP)
- Cache-bust assets (add version query params)
- Enable gzip compression in web server

**Nginx gzip config:**
```nginx
gzip on;
gzip_types text/html text/plain text/css application/json;
gzip_min_length 1000;
```

### Backend Integration
- Use WebAssembly for model inference (browser-side, future)
- Implement result caching
- Batch process images
- Rate limiting on API endpoints

## Monitoring

### Logs

**Local development:**
```bash
# Monitor server output
tail -f app.log
```

**Docker:**
```bash
docker logs -f msw-segmentor
```

**Production (Nginx):**
```bash
tail -f /var/log/nginx/error.log
tail -f /var/log/nginx/access.log
```

### Health Check

```bash
curl http://localhost:5000/health
# Should return: {"status": "ok", "model": "ready"}
```

## Troubleshooting

### Issue: Webcam not working

**Solution:**
- Ensure HTTPS (webcam requires secure context)
- Check browser permissions
- Test on http://localhost (development exemption)

### Issue: Large file upload fails

**Solution:**
- Increase `MAX_IMAGE_SIZE` in backend
- Compress image before upload
- Use drag-drop instead of input picker

### Issue: Model takes too long to load

**Solution:**
- Pre-load model on backend startup
- Use GPU acceleration (CUDA)
- Implement progress bar in UI

### Issue: CORS errors when calling API

**Solution (Flask):**
```python
from flask_cors import CORS
app = Flask(__name__)
CORS(app)  # Enable CORS for all routes
```

## Backup & Updates

### Backup Dashboard Config

```bash
# Save current state
cp dashboard.html dashboard.html.backup.$(date +%Y%m%d)

# Save model
cp models/msw_yolov8l_detect_best.pt models/backup/
```

### Update Frontend

```bash
# Edit dashboard.html locally
# Test: python -m http.server 8000
# Deploy: copy to production server
```

### Update Model

```bash
# New model file
cp new_model.pt models/msw_yolov8l_detect_best.pt

# Update backend to recognize new model
# Restart service
docker restart msw-segmentor
```

## Security Considerations

- Run behind reverse proxy (Nginx)
- Enable HTTPS (Let's Encrypt)
- Validate file uploads (size, format)
- Rate limit API endpoints
- Sanitize user inputs
- Keep dependencies updated
- Monitor logs for suspicious activity

## Support & Resources

- Flask: https://flask.palletsprojects.com/
- YOLOv8: https://docs.ultralytics.com/
- Canvas API: https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API
- Docker: https://docs.docker.com/
