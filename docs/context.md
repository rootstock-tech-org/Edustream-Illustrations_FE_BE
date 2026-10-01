# NTPC-MSW-Segmentor: Project Context

## Project Overview

**NTPC-MSW-Segmentor** is an interactive web-based dashboard for municipal solid waste (MSW) classification using AI-powered image segmentation. Users upload waste images or capture via webcam, the backend AI model detects and classifies waste materials in real-time, and the frontend dashboard visualizes results with confidence metrics, class distribution, and technical analysis.

**NTPC Context:** For NTPC (National Thermal Power Corporation) waste management initiatives.

## Problem Statement

MSW (Municipal Solid Waste) sorting requires:
- Real-time classification of waste types (plastic, metal, organic, paper, etc.)
- Visual feedback on segmentation results
- Confidence scoring for quality control
- Class distribution analysis for waste composition
- Historical tracking and reporting
- Easy-to-use interface for non-technical operators

Traditional approaches: manual sorting (error-prone, slow), or desktop software (complex). MSW-Segmentor provides a browser-based, AI-powered solution accessible from any device.

## Target Users

- Waste management facility operators
- NTPC environmental teams
- Quality control inspectors
- Facility managers
- Data analysts (waste composition reports)

## Core Capabilities (Frontend)

### 1. **Image Input**
- File upload (drag-and-drop, file picker)
- Webcam capture (real-time camera)
- Image preview

### 2. **AI-Powered Waste Segmentation**
- Real-time segmentation display
- YOLOv8-based object detection
- Bounding boxes for detected waste
- Class labels (Plastic, Metal, Organic, Paper, etc.)

### 3. **Confidence & Quality Metrics**
- Adjustable confidence threshold slider (0-100%)
- IoU (Intersection over Union) slider for overlap tolerance
- Live metric display
- Dynamic result filtering

### 4. **Detection Results**
- Segmented image display (side-by-side with original)
- Detected classes list
- Detection count per class
- Class distribution chart (bar/pie chart)

### 5. **Technical Analysis**
- Per-class statistics (count, confidence)
- Detailed detection table (class, confidence, bounding box)
- Exportable results
- Performance metrics

### 6. **User Interface**
- Dark theme (optimized for facility environment)
- Responsive sidebar navigation
- KPI grid (key metrics)
- Status indicators (model ready, processing, etc.)
- Save/clear buttons for workflow
- Accessibility features

## Architecture Overview

```
┌─────────────────────────────────────────┐
│      Browser (dashboard.html)           │
│  ├─ Sidebar Navigation                  │
│  ├─ Image Input (upload/webcam)         │
│  ├─ Parameter Controls (sliders)        │
│  ├─ Segmentation Display                │
│  ├─ Results Panel (classes, table)      │
│  └─ Analysis Charts                     │
└────────────┬────────────────────────────┘
             │ HTTP/JSON
    ┌────────▼──────────────┐
    │  Backend Server       │
    │  (Flask/Python)       │
    │  - YOLOv8 inference   │
    │  - Image processing   │
    │  - Result formatting  │
    └──────────────────────┘
             │
    ┌────────▼──────────────┐
    │  ML Model             │
    │  msw_yolov8l_detect   │
    │  (waste classes)      │
    └──────────────────────┘
```

## Key Design Principles

1. **Browser-Based** — No installation; access from any device
2. **Real-Time Feedback** — Live preview of segmentation results
3. **Operator-Friendly** — Simple interface for non-technical users
4. **Quality Control** — Confidence & IoU sliders for result tuning
5. **Dark Theme** — Eye-friendly in facility lighting
6. **Responsive** — Works on desktop, tablet, mobile

## Technology Stack (Frontend)

| Component | Technology |
|-----------|-----------|
| **Format** | Single-file HTML5 app |
| **Markup** | HTML5 semantic |
| **Styling** | CSS3 (custom design system) |
| **Scripting** | Vanilla JavaScript (no frameworks) |
| **Canvas** | HTML5 Canvas API (image rendering) |
| **Communication** | Fetch API (JSON over HTTP) |
| **UI Components** | Custom built (sliders, buttons, charts) |

## File Structure

```
NTPC-MSW-Segmentor/
├── dashboard.html          # Single-file frontend app (1,539 lines)
│   ├── <head> — Meta, styles
│   ├── <body> — DOM structure
│   └── <script> — JavaScript logic
├── server.py              # Flask server (backend, not modified)
├── app.py                 # AI inference backend (not modified)
└── models/
    └── msw_yolov8l_detect_best.pt  # YOLOv8 model for waste detection
```

## Frontend Components (HTML)

### Top Bar
- Logo badge ("MSW SEGMENTOR")
- Brand name
- Model status indicator
- Notification bell

### Sidebar Navigation
- Overview (main dashboard)
- Generic section (future expansion)
- Section headers
- Active state indicators

### Main Area: Overview Page
- **Coverage Banner** — Model readiness, accuracy metrics
- **KPI Grid** — Key performance indicators
- **Input Section** — File upload, webcam capture
- **Control Panel** — Confidence & IoU sliders
- **Segmentation Display** — Source/segmented images side-by-side
- **Results Panel** — Detected classes, distribution chart
- **Technical Analysis** — Detailed detection table

## Development Status

- **Status:** Frontend Complete, Production Ready
- **Version:** 1.0 (frontend)
- **Browser Compatibility:** Chrome, Firefox, Safari, Edge (modern browsers with Canvas API)
- **Backend:** Flask (not modified by frontend team)
- **ML Model:** YOLOv8 large (waste detection)

## Key Features

✅ Image upload (drag-drop, picker)  
✅ Webcam capture (real-time)  
✅ AI waste segmentation  
✅ Confidence threshold control  
✅ IoU tolerance adjustment  
✅ Segmentation visualization  
✅ Class distribution charts  
✅ Detection statistics table  
✅ Model status display  
✅ Dark theme  
✅ Responsive design  
✅ Save/export results  

## Deployment Options

- Local development (open HTML file directly)
- Served via Flask backend (http://localhost:5000)
- Cloud deployment (Vercel, Netlify, GitHub Pages as static)
- Desktop app (Electron wrapper possible)

## Success Metrics

- [ ] Real-time segmentation < 2s per image
- [ ] Confidence threshold usable for all accuracy levels
- [ ] Class distribution accurately reflects waste composition
- [ ] UI responsive on mobile/tablet/desktop
- [ ] All waste classes correctly labeled
- [ ] Export/save functionality working

## Contact & Support

**Project:** NTPC-MSW-Segmentor  
**Frontend:** dashboard.html (single-file HTML5 app)  
**Backend:** Flask (Python) - not modified by frontend team  
**Status:** Frontend Complete
