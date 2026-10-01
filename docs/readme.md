# NTPC-MSW-Segmentor

> **AI-powered waste classification dashboard.** Upload or capture waste images, get real-time AI segmentation with confidence scoring, class distribution analysis, and exportable reports.

**Status:** Frontend Complete | **Version:** 1.0 | **License:** NTPC Internal

## Overview

NTPC-MSW-Segmentor is a web-based dashboard for municipal solid waste (MSW) classification using AI image segmentation. Designed for waste facility operators, it provides:

- 📸 **Image Input** — Upload files or capture via webcam
- 🤖 **AI Segmentation** — Real-time waste classification (YOLOv8)
- 📊 **Visual Results** — Segmented image with bounding boxes
- 🎯 **Confidence Control** — Adjust detection thresholds dynamically
- 📈 **Analytics** — Class distribution charts, detection tables
- 💾 **Export** — Save results as JSON, CSV, or image

## Quick Start

### 1. Simple (File-Based)

```bash
# Open in browser directly
open dashboard.html
# OR double-click dashboard.html in file explorer
```

### 2. Local Server (Recommended)

```bash
# Python 3
python -m http.server 8000
# Visit: http://localhost:8000/dashboard.html
```

### 3. With Backend (Full Setup)

```bash
# Install dependencies
pip install flask torch torchvision

# Run app (backend + frontend)
python app.py
# Visit: http://localhost:5000
```

## How to Use

### Step 1: Load Image

- **Upload:** Click upload button, select image file
- **Webcam:** Click webcam button, capture live video
- Supported formats: JPG, PNG, WebP

### Step 2: Adjust Thresholds

- **Confidence:** Slider to filter low-confidence detections (0-100%)
- **IoU:** Intersection over Union tolerance (overlap threshold)
- Results update in real-time as you adjust

### Step 3: View Results

- **Left panel:** Original image
- **Right panel:** Segmentation with bounding boxes
- **Bottom panels:** Class list, distribution chart, detection table

### Step 4: Export (Optional)

- **Save:** Export segmentation results
- **Clear:** Reset and load new image

## Features

### 📸 **Image Input**
- File upload (drag-and-drop or picker)
- Webcam capture (real-time)
- Image preview before processing
- Support for JPEG, PNG, WebP formats

### 🤖 **AI Waste Classification**
- YOLOv8 large model for waste detection
- Real-time inference (< 2s per image)
- Bounding box drawing on canvas
- Class labeling on image
- Confidence scores per detection

### 🎨 **Interactive Visualization**
- Side-by-side source/segmented view
- Bounding boxes with class labels
- Color-coded waste types
- Hover tooltips with details

### 📊 **Results Analysis**
- Detected classes list (with count)
- Class distribution chart (bar/pie)
- Confidence scores per class
- Detailed detection table
- Sortable/filterable results

### ⚙️ **Quality Control**
- Confidence threshold slider (0-100%)
- IoU threshold adjustment
- Dynamic result filtering
- Model readiness status

### 🎯 **Waste Classification Categories**

Typical classes:
- Plastic (bottles, bags, films)
- Metal (cans, foil, wires)
- Organic (food waste, leaves)
- Paper (cardboard, newspapers)
- Glass (bottles, jars)
- Other (miscellaneous)

### 📱 **Responsive Design**
- Works on desktop, tablet, mobile
- Adaptive layout
- Touch-friendly controls
- Dark theme optimized for facility lighting

## Tech Stack

| Component | Technology |
|-----------|-----------|
| **Frontend** | Single-file HTML5 (1,539 lines) |
| **Language** | Vanilla JavaScript (no frameworks) |
| **Styling** | CSS3 with design tokens |
| **Graphics** | HTML5 Canvas API |
| **Communication** | Fetch API (JSON over HTTP) |
| **Backend** | Flask (Python) - not modified |
| **ML Model** | YOLOv8 Large (waste detection) |

## File Structure

```
NTPC-MSW-Segmentor/
├── dashboard.html          # Frontend app (complete, 1,539 lines)
├── app.py                 # Backend (AI inference, not modified)
├── server.py              # Flask server (not modified)
├── models/
│   └── msw_yolov8l_detect_best.pt  # YOLOv8 model
└── README.md              # This file
```

## Performance

| Operation | Time |
|-----------|------|
| File upload | < 100ms |
| Canvas rendering | < 500ms |
| AI inference | < 2s |
| UI update | < 100ms |
| Slider response | < 50ms |

## Browser Support

✅ Chrome 90+  
✅ Firefox 88+  
✅ Safari 14+  
✅ Edge 90+  
✅ Mobile browsers (iOS Safari, Android Chrome)

## Troubleshooting

### Webcam not working
- Ensure running on `http://localhost` (HTTPS required for production)
- Check browser permissions
- Try different browser

### Model loading fails
- Verify model file exists: `models/msw_yolov8l_detect_best.pt`
- Check backend is running: `python app.py`
- Monitor logs for errors

### Slow inference
- Reduce image resolution
- Use GPU acceleration (CUDA)
- Close other browser tabs

### File upload fails
- Check file size (< 10 MB default)
- Use supported format (JPG, PNG, WebP)
- Increase server `MAX_IMAGE_SIZE`

## Deployment

### Local Development
```bash
python -m http.server 8000
# Visit: http://localhost:8000/dashboard.html
```

### Docker
```bash
docker build -t msw-segmentor .
docker run -p 5000:5000 msw-segmentor
```

### Cloud (Vercel, Netlify, GitHub Pages)
- Upload `dashboard.html` as static file
- Auto-deployed, no build step needed
- Note: Requires backend for AI inference

See [deployment.md](deployment.md) for detailed deployment options.

## Usage Examples

### Example 1: Waste Facility Inspection

```
1. Operator uploads waste sample image
2. Dashboard shows segmentation results
3. Confidence threshold adjusted to filter low-quality detections
4. Class distribution shows: 45% Plastic, 30% Organic, 15% Metal, 10% Other
5. Results exported for daily report
```

### Example 2: Quality Audit

```
1. Inspector captures webcam image of waste bin
2. Live segmentation shows detected waste types
3. Compares against expected composition
4. Flags anomalies (too much plastic, missing organic)
5. Stores result for historical analysis
```

### Example 3: Process Optimization

```
1. Facility runs segmentation on 50 daily samples
2. Exports results (CSV)
3. Data scientist analyzes trends
4. Identifies waste stream composition changes
5. Adjusts sorting procedures accordingly
```

## API Integration (Frontend ↔ Backend)

### Segment Image
```javascript
async function segment(imageData) {
  const response = await fetch('/api/segment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: imageData,
      confidence: 0.75,
      iou: 0.5
    })
  });
  return response.json();
}
```

### Response Format
```json
{
  "detections": [
    {"class": "Plastic", "confidence": 0.92, "bbox": [10, 20, 100, 80]},
    {"class": "Metal", "confidence": 0.88, "bbox": [150, 50, 80, 120]}
  ],
  "summary": {
    "total_objects": 2,
    "inference_time_ms": 450
  }
}
```

## Customization

### Change Waste Classes
Edit in `dashboard.html`:
```javascript
const WASTE_CLASSES = ['Plastic', 'Metal', 'Organic', 'Paper', 'Glass', 'Other'];
```

### Adjust Default Thresholds
```javascript
const DEFAULT_CONFIDENCE = 0.5;  // 50%
const DEFAULT_IOU = 0.5;         // 50%
```

### Change Colors/Theme
CSS variables in `<head>`:
```css
:root {
  --accent: #22d3ee;    /* Cyan */
  --bg: #0b0f14;        /* Dark background */
  --good: #22c55e;      /* Green for success */
}
```

## Future Enhancements

- [ ] Batch processing (multiple images)
- [ ] Result history/timeline
- [ ] Custom waste class labeling
- [ ] Image annotation tools
- [ ] Export to PDF with charts
- [ ] Email report generation
- [ ] Real-time webcam preview
- [ ] Browser-side model inference (WebAssembly)

## Limitations

- Requires backend server for AI inference
- Limited to image formats: JPG, PNG, WebP
- Model training data specific to NTPC waste types
- Confidence threshold must be manually adjusted
- No multi-user authentication

## Support

- **Documentation:** [context.md](context.md), [architecture.md](architecture.md), [deployment.md](deployment.md)
- **Issues:** Contact NTPC development team
- **Backend:** Flask/Python (see app.py)
- **Model:** YOLOv8 (see Ultralytics documentation)

## License

Proprietary - NTPC Internal Use

## Version History

### v1.0 (Current)
✅ HTML5 frontend complete  
✅ Image upload & webcam capture  
✅ Real-time segmentation display  
✅ Confidence & IoU controls  
✅ Class distribution analysis  
✅ Detection table  
✅ Export functionality  
✅ Dark theme  
✅ Responsive design  

### v1.1 (Planned)
- [ ] Batch processing
- [ ] Result history
- [ ] Custom class labeling
- [ ] PDF exports

---

**Ready to segment?** Start with `python app.py` or open `dashboard.html` directly.
