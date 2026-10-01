# VLSICleanroom-POC: Project Context

## Project Overview

**VLSICleanroom-POC** is an interactive 3D semiconductor fabrication (fab) learning environment. Built in Unity, it provides an immersive tour through a realistic VLSI/semiconductor cleanroom following ASML's chip fabrication process flow. Students meet Rootie Tutor (an AI guide), walk past 10 interactive desks representing each step of chip manufacturing, and click glowing monitors to access detailed process illustrations on topics like deposition, photolithography, etching, and packaging.

## Problem Statement

Semiconductor manufacturing training requires understanding:
- **Complex multi-step process flow** (10+ process steps, 100+ layers)
- **Real fab equipment and layout** (tool cabinets, AMHS, cleanroom environment)
- **Each process step in detail** (deposition, resist coating, exposure, developing, etching, etc.)
- **Spatial orientation** (how steps flow through the cleanroom)
- **Real production environment** (to prepare for industry work)

Traditional approaches (PDF slides, videos, textbooks) don't convey the scale, complexity, or spatial layout of a real fab. VLSICleanroom-POC creates an **immersive 3D walkthrough** of a realistic fab bay where students see equipment, understand process flow, and access interactive illustrations on demand.

## Target Users

- Semiconductor engineering students
- Fab technicians (entry-level training)
- Process engineers (learning new tools)
- Equipment manufacturers (sales/support training)
- Vocational programs in microelectronics
- Corporate training departments (Intel, TSMC, Samsung, etc.)
- Students interested in chip manufacturing

## Core Capabilities

### 1. **Realistic Fab Bay Environment**
- 18×44 meter cleanroom (based on real fab photos)
- White tool cabinets in rows on both sides
- Central aisle for walking/touring
- Glossy raised floor with tile grid pattern
- Yellow safety lane marking
- Yellow photolithography zone (z < -6 in coordinate space)
- Overhead AMHS track carrying FOUP pods (wafer carriers)
- Bright grid ceiling with accent lighting

### 2. **Equipment Visualization**
- **Tool Cabinets:** White boxes representing process equipment
  - Front panels with details
  - Monitors displaying equipment status
  - Signal towers (red/amber/green status lights)
  - Realistic scale and positioning
- **AMHS (Automated Material Handling System):**
  - Overhead track running the length of the fab
  - FOUP pods (Front Opening Unified Pod) carrying wafers
  - Automated delivery system for wafer batches
- **Desk Stations:** Interactive kiosks at each process step
  - Glowing monitor screens (color-coded by process)
  - Status lights showing operation
  - Clickable for accessing process illustrations

### 3. **Chip Fabrication Process Flow**
10 sequential process steps (ASML's real flow):

1. **Deposition** (Teal) — Thin films laid onto silicon wafer
2. **Photoresist Coating** (Yellow) — Light-sensitive layer applied
3. **Exposure** (Blue) — Light projects chip pattern onto resist
4. **Baking & Developing** (Light Blue) — Resist patterns exposed
5. **Etching** (Orange) — Materials removed via gases
6. **Metrology & Inspection** (Cyan) — Wafer measured for defects
7. **Ion Implantation** (Purple) — Ions bombard wafer for tuning
8. **Layering (Repeat)** (Purple-Blue) — Cycle repeats 50-100 times
9. **Dicing** (Gray) — Wafer cut into individual chips
10. **Packaging** (Orange) — Dies encapsulated for shipping

### 4. **Rootie Tutor AI Guide**
- **Character:** Procedural 3D robot (similar to SmartFactory's Rootie)
  - Rolls around on wheel base
  - Cream-colored body with dark visor
  - Glowing accents (cyan)
  - Antenna for personality
- **Behavior:**
  - Greets student at entrance
  - Rolls to each of 10 desks sequentially
  - Explains each process step
  - Links explanation to desk location
  - Waits for student to explore before advancing

### 5. **Interactive Process Desks**
- **10 color-coded kiosks** (one per process step)
- **Layout:** Alternating left/right down the aisle (realistic fab layout)
- **Features per desk:**
  - Glowing monitor screen (color matches process)
  - Green status light (showing "ready")
  - Base cabinet (white/gray)
  - Front panel with details
  - Click monitor to open process illustration
- **Desk Positions:**
  ```
  Left side:  Deposition, Exposure, Etching, Implantation, Dicing (z = -18, -10, -2, 6, 14)
  Right side: Photoresist, Developing, Inspection, Layering, Packaging (z = -14, -6, 2, 10, 18)
  ```

### 6. **Lighting & Atmosphere**
- **Skybox:** Procedural bright sky (fab interior lighting)
- **Ambient Lighting:** Bright white/cool tone (factory lighting)
- **Reflection Probes:** Real-time reflections on glossy floor
- **Fog:** Realistic depth through cleanroom
- **Shadow Mapping:** Soft shadows from equipment
- **Glowing Elements:** Desk screens pulse with activity

### 7. **Immersive Navigation**
- **Orbit Camera:** Drag to rotate, scroll to zoom
- **Auto-rotate Fallback:** If mouse input unavailable
- **Smooth Camera Motion:** Pitch/yaw limits prevent disorientation
- **Walk through the aisle:** Experience the fab at scale

## Architecture Overview

```
┌────────────────────────────────────────────┐
│        Unity WebGL Player                  │
│  (Running in browser or standalone)        │
└────────────┬───────────────────────────────┘
             │
    ┌────────▼──────────────────────┐
    │  CleanroomBootstrap           │
    │  (Bootstrap/Initializer)      │
    │  - Creates CleanRoom scene    │
    │  - Sets up camera & Rootie    │
    └────────┬─────────────────────┘
             │
    ┌────────┴──────────────────────────────┐
    │                                       │
    ▼                                       ▼
┌──────────────────┐          ┌────────────────────┐
│  CleanRoom       │          │  RootieTutor       │
│  (Fab World)     │          │  (AI Guide)        │
├──────────────────┤          ├────────────────────┤
│ - Floor & walls  │          │ - Procedural 3D    │
│ - Tool rows      │          │ - 10-desk tour     │
│ - AMHS track     │          │ - Dialogue         │
│ - Ceiling & grid │          │ - Rolling motion   │
│ - Lighting setup │          └────────────────────┘
│ - 10 desks       │
└──────────────────┘          ┌───────────────────┐
         │                    │  DeskStation (×10)│
         │                    │  (Interactive Kiosk)
         │                    ├───────────────────┤
         │                    │ - Cabinet & screen│
         │                    │ - Glowing monitor │
         │                    │ - Status light    │
         │                    │ - URL opening     │
         │                    └───────────────────┘
         │
    ┌────▼──────────────────┐
    │  OrbitCamera          │
    │  - Mouse control      │
    │  - Smooth orbit       │
    │  - Auto-rotate        │
    └───────────────────────┘
```

## Key Design Principles

1. **Realistic Fab Layout** — Based on actual fab photos (ASML-style)
2. **Process Flow Visualization** — 10 desks in logical sequence (how chips are made)
3. **Guided Exploration** — Rootie explains each step as you tour
4. **Interactive Deep-Dives** — Click any desk for detailed process illustration
5. **Spatial Learning** — Walk through fab to understand layout and equipment
6. **Professional Atmosphere** — Clean white, realistic lighting, actual fab colors
7. **Self-Paced Discovery** — Follow Rootie's tour or explore at your own pace

## Technology Stack

| Component | Technology |
|-----------|-----------|
| **Engine** | Unity 2022 LTS+ |
| **Graphics** | Built-in Render Pipeline (URP compatible) |
| **Language** | C# 9+ |
| **Platform** | WebGL (browser), Standalone (PC/Mac/Linux) |
| **Camera** | Orbit camera with mouse/touch controls |
| **Proceduralism** | GameObject.CreatePrimitive() + materials |
| **Helpers** | Python scripts (image processing, 3D model prep) |
| **Assets** | 3D model (Rootie.glb), images, configurations |

## File Structure

```
VLSICleanroom-POC/
├── Scripts/
│   ├── CleanroomBootstrap.cs    (29 lines) - Initializer
│   ├── CleanRoom.cs             (400+ lines) - Fab environment
│   ├── RootieTutor.cs           (300+ lines) - AI guide
│   ├── DeskStation.cs           (87 lines) - Interactive kiosks
│   └── OrbitCamera.cs           (47 lines) - Camera control
├── Python/
│   ├── rootie.py                (156 lines) - Tutor logic
│   └── remove_bg.py             (74 lines) - Image processing
├── Assets/
│   ├── rootie.glb               (0.86 MB) - 3D model
│   └── rootie.png               (91 KB) - Asset
└── README.md                    - Documentation
```

**Total:** ~850 lines C# + 230 lines Python + 0.95 MB assets

## Component Details

### CleanroomBootstrap
- Entry point for scene initialization
- Creates CleanRoom (if not present)
- Sets up Main Camera with OrbitCamera
- Spawns RootieTutor
- Handles scene startup

### CleanRoom (Procedural Fab)
- **Dimensions:** 18×44 meters (HX=9f, HZ=22f)
- **Height:** 6 meters (WALL_H)
- **Layout:**
  - 10 desks (5 left, 5 right, alternating positions)
  - Tool cabinets lining both sides
  - Central aisle for walking
  - Glossy raised floor with tile grid
  - Yellow safety lane marking
  - Yellow photolithography zone (z < -6)
  - Overhead AMHS track with FOUP pods
  - Bright grid ceiling
- **Desk Data Structure:**
  ```csharp
  struct Desk {
    string name;           // "1. Deposition"
    string blurb;         // Description of process
    string url;           // Link to illustration
    Vector3 pos;          // Position in fab
    Color hue;            // Color code (teal, yellow, etc.)
  }
  DESKS[10];  // Array of 10 desks
  ```

### RootieTutor
- **Character:** Procedurally built from primitives
  - Wheel base (rolling)
  - Cream body with dark visor
  - Cyan accent lights
  - Antenna for personality
- **Tour System:**
  - Reads desk list from CleanRoom.DESKS
  - Builds 11-stop tour (greeting + 10 desks)
  - Rolls to each desk position
  - Displays descriptive dialogue
  - Waits for student input before advancing

### DeskStation (×10)
- **Visual:** White cabinet with glowing monitor
  - Base platform (gray)
  - Cabinet body (white)
  - Bezel frame (dark)
  - Screen (glowing, color-coded)
  - Status light (green)
- **Interaction:** Raycast click detection
  - Click screen → opens process URL
  - Screen pulses to signal interactivity
  - Label shows process name

### OrbitCamera
- **Parameters:**
  - Target: (0, 2.5, 0) - center of fab
  - Distance: 18-25 meters (zoomed out to see fab)
  - Pitch: 5° to 80° (don't look too far down)
  - Sensitivity: 3.0
- **Input Modes:**
  - Legacy: Mouse drag + scroll
  - Fallback: Auto-rotate at 12°/sec

## Development Status

- **Status:** Proof of Concept (POC)
- **Version:** 0.1.0 (prototype)
- **Platforms:**
  - ✅ WebGL (browser)
  - ✅ Standalone Windows/Mac/Linux
  - ⏳ VR-ready (Oculus/SteamVR with modifications)

## Learning Outcomes

Students completing the VLSICleanroom tour will:
- ✅ Understand 10-step chip fabrication process
- ✅ Visualize real fab equipment and layout
- ✅ See how wafers flow through the cleanroom
- ✅ Learn each process step in detail
- ✅ Understand equipment roles and timing
- ✅ Prepare for real fab work environments
- ✅ Gain confidence in semiconductor manufacturing concepts

## Success Metrics

- [ ] Cleanroom renders at 60 FPS (WebGL)
- [ ] Rootie tours all 10 desks smoothly
- [ ] All desk clicks open process URLs
- [ ] Students report improved understanding of fab flow
- [ ] Tour completes in 10-15 minutes
- [ ] Detailed illustrations enhance learning
- [ ] Works on Chrome, Firefox, Safari, Edge
- [ ] Responsive to mobile screens

## Contact & Support

**Project:** VLSICleanroom-POC  
**Tech Stack:** Unity C# (WebGL/Standalone)  
**Status:** Interactive Fab Learning Environment  
**License:** Proprietary
