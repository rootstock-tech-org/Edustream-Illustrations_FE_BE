# NTPC-MSW-Segmentor: Frontend Architecture

## Frontend Overview (HTML5 Single-File App)

```
dashboard.html (1,539 lines)
    ├── <head> HTML + CSS
    │   ├── Meta tags & viewport
    │   ├── Design tokens (:root CSS variables)
    │   ├── Component styles (topbar, sidebar, panels)
    │   ├── Utility classes
    │   └── Color palette (dark theme)
    │
    ├── <body> DOM Structure
    │   ├── Top Bar (.topbar)
    │   │   ├── Logo badge
    │   │   ├── Brand name
    │   │   ├── Spacer
    │   │   └── Model status
    │   │
    │   ├── Layout (.layout)
    │   │   ├── Sidebar (#sidebar)
    │   │   │   ├── Nav sections
    │   │   │   └── Nav items (active state tracking)
    │   │   │
    │   │   └── Main content (#main)
    │   │       ├── Page: Overview (#page-overview)
    │   │       │   ├── Coverage banner
    │   │       │   ├── KPI grid
    │   │       │   ├── File input + webcam
    │   │       │   ├── Control sliders
    │   │       │   ├── Source/segmented images
    │   │       │   ├── Detected classes
    │   │       │   ├── Class distribution chart
    │   │       │   ├── Detection table
    │   │       │   └── Technical analysis
    │   │       │
    │   │       └── Page: Generic (#page-generic)
    │   │
    │   └── Hidden elements (templates for dynamic content)
    │
    └── <script> JavaScript (Vanilla JS)
        ├── DOM element references
        ├── State management
        ├── API communication (fetch)
        ├── Image processing (Canvas API)
        ├── Chart rendering
        ├── Event handlers
        └── Helper functions
```

## Component Details

### 1. **Top Bar (.topbar)**
- Height: 56px
- Logo badge + brand name
- Model status display (right-aligned)
- Notification bell icon
- Sticky/fixed positioning

### 2. **Sidebar (#sidebar)**
- Width: 196px
- Navigation items (clickable)
- Active state: accent color + border
- Section headers (uppercase, small)
- Vertical scroll if content overflows

**Nav Items:**
- Overview (active by default)
- Generic (placeholder for future sections)

### 3. **Main Content Area (#main)**
- Flex: 1 (fills remaining space)
- Overflow-y: auto (scrollable)
- Padding: 14px 16px
- Page routing based on active nav item

### 4. **Overview Page (#page-overview)**

**Coverage Banner:**
- Model readiness status
- Accuracy metrics display
- Green/red indicators

**KPI Grid:**
- Key performance indicators
- 3-4 columns of metrics
- Large number display
- Labels and trends

**Input Section:**
- Upload button (file input)
- Webcam button (real-time camera)
- Clear button (reset)
- Save button (export results)

**Control Panel:**
- Confidence slider (0-100%)
  - Label: "Confidence Threshold"
  - Real-time value display
  - Affects detection filtering

- IoU slider (0-100%)
  - Label: "IoU Threshold"
  - Controls overlap tolerance
  - Real-time value display

**Segmentation Display:**
- Two-column layout (50/50)
  - Left: Source image (#sourceImg)
  - Right: Segmented result (#segImg)
- Canvas elements for rendering
- Bounding boxes drawn on canvas
- Class labels overlaid

**Detected Classes (#detectedClasses):**
- List of waste classes found
- Count per class
- Confidence score per class
- Color-coded class indicators

**Class Distribution Chart (#classDistChart):**
- Bar chart or pie chart
- X-axis: waste classes
- Y-axis: count/percentage
- Interactive tooltips (hover)
- Canvas or SVG rendering

**Detection Table (#detTableWrap):**
- Scrollable table
- Columns: Class, Confidence, Bounding Box (x, y, w, h)
- Sorted by confidence (descending)
- Alternating row colors for readability

**Technical Analysis:**
- Performance metrics
- Inference time
- Image resolution
- Model version
- Input source (file/webcam)

## JavaScript Logic

### State Management
```javascript
const state = {
  currentPage: 'overview',
  modelReady: false,
  sourceImage: null,
  segmentedImage: null,
  detections: [],
  confidenceThreshold: 0.5,
  iouThreshold: 0.5,
  classDistribution: {},
  // ... more state
};
```

### Key Functions

**Image Input Handling:**
- `handleFileUpload()` - Process file picker
- `handleDragDrop()` - Drag-and-drop support
- `captureWebcam()` - Webcam capture

**API Communication:**
```javascript
async function sendToBackend(imageData) {
  const response = await fetch('/api/segment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: imageData,
      confidence: state.confidenceThreshold,
      iou: state.iouThreshold
    })
  });
  return response.json();
}
```

**Image Rendering:**
- `renderSourceImage()` - Display original
- `renderSegmentedImage()` - Draw bounding boxes
- `drawBoundingBox()` - Canvas drawing
- `overlayClassLabels()` - Text labels on image

**Chart Rendering:**
- `renderClassDistributionChart()` - Bar/pie
- Uses Canvas API or embedded Chart.js

**UI Updates:**
- `updateDetectionTable()` - Populate table rows
- `updateKPIs()` - Update metric displays
- `updateCoverageStatus()` - Model status
- `togglePageVisibility()` - Show/hide pages

### Event Listeners
- File input: `.addEventListener('change', handleFileUpload)`
- Webcam: Click handler for camera button
- Sliders: `oninput` for real-time value changes
- Clear button: Reset all state
- Save button: Export results (JSON/CSV/image)

## CSS Design System

### Color Tokens
```css
:root {
  --bg: #0b0f14;              /* Dark background */
  --surface: #11161d;         /* Card/panel background */
  --overlay: #0f172a;         /* Overlay/modal background */
  --border: #1f2937;          /* Border color */
  --text: #e5e7eb;            /* Primary text */
  --text-mid: #9ca3af;        /* Secondary text */
  --accent: #22d3ee;          /* Cyan accent (highlight) */
  --good: #22c55e;            /* Green (success) */
  --warning: #fbbf24;         /* Yellow (warning) */
  --critical: #ef4444;        /* Red (error) */
}
```

### Typography
- Font: Helvetica Neue, Segoe UI, Inter, system-ui
- Monospace: Menlo, Consolas, JetBrains Mono
- Body font size: 13px
- Smooth antialiasing enabled

### Layout
- Flexbox for layout
- Full-height viewport (no scroll)
- Sidebar + main content split
- Responsive grid for KPIs
- Canvas elements for image rendering

## API Integration (Frontend → Backend)

### Endpoints Used
- `POST /api/segment` - Segment image and get detections
- `GET /api/status` - Check model status
- `POST /api/export` - Export results
- `GET /api/models` - List available models

### Request Format
```json
{
  "image": "base64-encoded-image-or-path",
  "confidence": 0.75,
  "iou": 0.5,
  "source": "upload|webcam"
}
```

### Response Format
```json
{
  "success": true,
  "detections": [
    {
      "class": "Plastic",
      "confidence": 0.92,
      "bbox": [x, y, width, height],
      "color": "#rgb"
    }
  ],
  "summary": {
    "total_objects": 15,
    "dominant_class": "Plastic",
    "inference_time_ms": 450
  }
}
```

## Browser Capabilities Used

- **HTML5 Canvas API** - Image rendering and bounding box drawing
- **Fetch API** - HTTP requests to backend
- **FileReader API** - File upload processing
- **getUserMedia API** - Webcam capture
- **CSS Grid & Flexbox** - Responsive layout
- **LocalStorage** - Persist user preferences
- **Responsive Design** - Mobile/tablet/desktop support

## Performance Characteristics

| Operation | Target |
|-----------|--------|
| File upload | < 100ms (UI response) |
| Canvas rendering | < 500ms |
| API request | < 2s (model inference) |
| UI update | < 100ms (refresh components) |
| Slider interaction | < 50ms (real-time feedback) |
| Chart render | < 300ms |

## Accessibility Features

- Semantic HTML
- ARIA labels (optional, can be added)
- Keyboard navigation support
- High contrast dark theme
- Focus indicators on buttons
- Tab order management

## Browser Compatibility

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+
- Mobile browsers (iOS Safari, Android Chrome)

## Future Enhancements

- Add chart library (Chart.js, D3)
- WebGL rendering for performance
- WebAssembly model inference (browser-side)
- Multi-image batch processing
- Real-time webcam preview
- Result history/timeline
- Custom waste class labeling
- Image annotation tools
