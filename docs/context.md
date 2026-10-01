# SmartFactory-Unity-POC: Project Context

## Project Overview

**SmartFactory-Unity-POC** is an interactive 3D learning environment for smart factory and Industry 4.0 education. Built in Unity, it provides a procedurally-generated smart factory hall where students tour a factory layout, meet Rootie (an AI mentor character), and access interactive modules on specific topics (robotics, sensors, communication, edge AI, etc.) by clicking glowing station markers in the world. The environment bridges immersive 3D exploration with deep-dive web-based technical modules.

## Problem Statement

Industry 4.0 and manufacturing automation training requires:
- **Spatial understanding** of factory layouts (equipment placement, workflow)
- **Hands-on visualization** of concepts (robots, conveyors, control rooms, logistics)
- **Guided exploration** (a mentor explaining what you're seeing)
- **Topic deep-dives** (robotics, PLC, sensors, networking)
- **Engagement** (3D is more immersive than slides)

Traditional approaches (PowerPoint slides, textbooks, YouTube) are passive and 2D. SmartFactory-Unity-POC creates an **immersive 3D walkthrough** where students physically explore a factory, guided by an AI mentor, and seamlessly access detailed interactive modules on demand.

## Target Users

- Manufacturing engineers (entry to mid-level)
- Industrial automation technicians
- IIoT (Industrial IoT) students
- Vocational training programs
- Engineering universities
- Corporate training departments
- Roboticists and automation integrators
- Competitive learners (hands-on exploration preferred over lectures)

## Core Capabilities

### 1. **Procedurally-Generated Factory Hall**
- 30×30 meter concrete floor with safety lane markings
- 7-meter tall perimeter walls (gray)
- Ceiling with glowing light strips (realistic factory lighting)
- Non-interactive scenery for atmosphere building

### 2. **Interactive Factory Stations**
- Production machines (with blinking status lights)
- Conveyor line for material flow
- Control room (SCADA screens visible)
- AGV (Autonomous Guided Vehicle) + storage racks
- Safety fence perimeter (yellow/black hazard markings)
- Each major element has a glowing clickable marker

### 3. **Rootie AI Mentor**
- **Character:** Procedurally-built 3D robot with:
  - Dome head with dark face screen
  - Glowing green eyes
  - Rounded body with neck ring
  - Little arms
  - Wheel base (rolls around)
- **Behavior:**
  - Rolls into the factory and greets students
  - Visits 6 predefined spots in the factory
  - Explains each station in sequence
  - Teaches smart factory concepts (sense, think, act, connectivity)
  - Waits for student to explore before moving to next stop
- **Dialogue Topics:**
  - Production machines (network connectivity, status monitoring)
  - Conveyor system (material flow tracking, sensors)
  - Control room (SCADA, real-time monitoring)
  - Logistics (AGV, storage, automated handling)
  - Smart factory summary (integration of all concepts)

### 4. **Interactive Module Stations**
- **Glowing cylinder markers** at key locations
- **Pulses** to indicate interactivity
- **Click-activated** (raycasted from camera)
- **Opens web modules** in browser or WebGL iframe:
  - Robotics (6-axis arm control, kinematics)
  - Sensors (vibration, temperature, flow)
  - Communication (MQTT, pub-sub networking)
  - Edge AI (latency trade-offs, deployment modes)
  - Digital Twin (synchronization, wear divergence)
  - PLC & SCADA (tank level control, ladder logic)
  - Predictive Maintenance (health monitoring, RUL)
  - Cybersecurity (attack simulation, defense layers)
  - Pick & Place Robot (6-axis arm automation)
  - Capstone (full factory system design)

### 5. **Immersive 3D Navigation**
- **Orbit camera** for exploring the factory
- **Mouse drag** to rotate view
- **Scroll wheel** to zoom in/out
- **Auto-rotate** fallback (if mouse input disabled)
- **Smooth camera movement** with pitch/yaw limits

### 6. **Visual Design & Atmosphere**
- **Realistic factory colors:** Gray walls, concrete floor, steel equipment, yellow/black safety markings
- **Lighting:** Glowing ceiling strips, point lights, ambient fill
- **Material properties:** Metallic equipment, matte concrete, reflective floors
- **Factory ambiance:** Authentic equipment placement, realistic proportions

## Architecture Overview

```
┌────────────────────────────────────────────┐
│        Unity WebGL Player                  │
│  (Running in browser or standalone)        │
└────────────┬───────────────────────────────┘
             │
    ┌────────▼───────────────────────────┐
    │  RobotArmController (Bootstrap)    │
    │  - Initializes scene               │
    │  - Spawns FactoryWorld             │
    │  - Sets up camera & Rootie         │
    └────────┬────────────────────────────┘
             │
    ┌────────┴────────────────────────────────────┐
    │                                             │
    ▼                                             ▼
┌──────────────────┐               ┌─────────────────────┐
│  FactoryWorld    │               │  RootieMentor       │
│  (Procedural     │               │  (AI Guide)         │
│   Environment)   │               │  - 3D character     │
├──────────────────┤               │  - 6 tour stops     │
│ - Floor & walls  │               │  - Dialogue         │
│ - Ceiling & lights               │  - Rolling motion   │
│ - Machines       │               └─────────────────────┘
│ - Conveyor       │
│ - Control room   │               ┌──────────────────────┐
│ - AGV & racks    │               │  FactoryStation      │
│ - Safety fence   │               │  (Interactive Marker)│
└──────────────────┘               ├──────────────────────┤
         │                          │ - Glowing cylinder   │
         │                          │ - Pulsing animation  │
         │                          │ - Click detection    │
         │                          │ - URL opening        │
         │                          └──────────────────────┘
         │
    ┌────▼──────────────────────┐
    │  OrbitCamera              │
    │  - Mouse drag to rotate   │
    │  - Scroll to zoom         │
    │  - Auto-rotate fallback   │
    └───────────────────────────┘
             │
    ┌────────▼─────────────────────┐
    │  Raycasting & Input          │
    │  - Click detection           │
    │  - Station interaction       │
    │  - Camera control            │
    └──────────────────────────────┘
             │
    ┌────────▼──────────────────────┐
    │  Web Module Integration       │
    │  - Application.OpenURL()      │
    │  - Opens browser/iframe       │
    │  - (Robotics, Sensors, etc.)  │
    └───────────────────────────────┘
```

## Key Design Principles

1. **Immersive First** — 3D world draws students in; curiosity drives exploration
2. **Guided Discovery** — Rootie explains concepts naturally as you tour
3. **Seamless Transitions** — Click a station → instantly access detailed module
4. **Procedural Generation** — No asset dependencies; fast iteration
5. **Authentic Atmosphere** — Realistic factory colors, lighting, materials
6. **Accessibility** — Works without new Input System (auto-rotate fallback)
7. **Educational Scaffolding** — Tour → topics → hands-on modules (progression)

## Technology Stack

| Component | Technology |
|-----------|-----------|
| **Engine** | Unity 2022 LTS+ |
| **Graphics** | Built-in Render Pipeline (URP compatible) |
| **Language** | C# 9+ |
| **Platform** | WebGL (browser), Standalone (Windows/Mac/Linux) |
| **Camera** | Orbit camera with mouse/touch controls |
| **Proceduralism** | GameObject.CreatePrimitive() + procedural materials |
| **Scripting** | Event-driven, Update() loop for animation |
| **Web Integration** | Application.OpenURL() for module launching |

## File Structure

```
SmartFactory-Unity-POC/
├── Scripts/
│   ├── RobotArmController.cs    (32 lines) - Bootstrap/initializer
│   ├── FactoryWorld.cs          (400+ lines) - Procedural environment
│   ├── RootieMentor.cs          (270+ lines) - AI guide character
│   ├── FactoryStation.cs        (80 lines) - Interactive markers
│   └── OrbitCamera.cs           (47 lines) - Camera control
└── README.md                    (This documentation)
```

**Total:** ~830 lines of C# code

## Component Details

### RobotArmController (Bootstrap)
- Entry point for the scene
- Creates FactoryWorld (if not already present)
- Sets up Main Camera with OrbitCamera
- Spawns Rootie (if not already present)
- Handles scene initialization

### FactoryWorld (Procedural Environment)
- **Floor:** 30×30 meter concrete plane with safety lane markings (yellow)
- **Walls:** 4 perimeter walls (7m tall, gray)
- **Ceiling:** Gray with glowing light strips (3 strips with point lights)
- **Columns:** Support columns at corners
- **Machines:** Stylized production equipment cabinets (steel boxes with details)
- **Conveyor:** Belt system with motors
- **Control Room:** Glass-walled room with monitors
- **Overhead:** Storage racks, catwalks, cable trays
- **Logistics:** AGV charging station, parts storage
- **Safety:** Perimeter fence (yellow/black striped)
- **Lighting:** 3 point lights from ceiling strips + ambient light

**Material System:**
- Standard shader with configurable colors
- Metallic + smoothness for realistic reflections
- Emission for glowing elements (lights, signs)
- No textures (all colors procedural)

### RootieMentor (AI Guide Character)
- **Body Parts:**
  - Sphere wheel base (dark, metallic)
  - Cylinder body (cream colored)
  - Dome head (cream with smooth material)
  - Dark screen face (for text display)
  - Glowing green eyes (emissive)
  - Neck ring (dark)
  - Small arms (cream cylinders)
- **Animation:**
  - Wheel spinning (tracks movement)
  - Body bobbing (idle animation)
  - Eye blinking
  - Smooth pathfinding between 6 tour stops
- **Dialogue:** 6 sequential messages explaining factory concepts
- **Interaction:** Pauses at each stop; advances on student input

### FactoryStation (Interactive Marker)
- **Visual:** Glowing cylinder (0.35×0.9 scale, color-coded per station)
- **Animation:** Pulsing scale (to signal interactivity)
- **Interaction:** Raycast click detection
- **Action:** Opens web module URL
  - URL format: `http://localhost:5173/?module=robotics&embed=1`
  - Supports embedding in WebGL or opening in browser
- **Label:** World-space text above marker showing station name

### OrbitCamera (Camera Control)
- **Mode 1 (Legacy Input):** Mouse-driven orbit
  - Drag to rotate (yaw/pitch)
  - Scroll to zoom (distance)
  - Sensitivity: 3.0 (configurable)
  - Pitch limits: 5° to 80°
  - Distance limits: 4m to 20m
  - Target: center of factory (0, 2, 0)
- **Mode 2 (New Input System):** Auto-rotate
  - Gentle rotation if mouse unavailable
  - Speed: 12° per second
  - Target/distance same as legacy mode
- **Fallback:** Detects input system and gracefully switches

## Development Status

- **Status:** Proof of Concept (POC)
- **Version:** 0.1.0 (prototype)
- **Platform Support:**
  - ✅ WebGL (browser)
  - ✅ Standalone Windows/Mac
  - ✅ VR-ready (Oculus/SteamVR with minimal changes)
- **Features:** Core tour + basic stations

## Learning Outcomes

Students who complete the SmartFactory tour will:
- ✅ Understand factory layout and equipment placement
- ✅ Visualize material flow (conveyor, AGV, storage)
- ✅ Learn about smart factory concepts (sense, think, act, connectivity)
- ✅ Discover 10 specialized topics (modules) to deep-dive into
- ✅ Gain confidence to explore complex industrial systems
- ✅ See how Industry 4.0 works in an integrated system

## Success Metrics

- [ ] Factory hall renders at 60 FPS (WebGL)
- [ ] Rootie tours all 6 stops without breaking
- [ ] Station clicks successfully open web modules
- [ ] Students report increased engagement vs. slides
- [ ] Completion time < 10 minutes (tour + exploration)
- [ ] Works on Chrome, Firefox, Safari, Edge
- [ ] Mobile-friendly (touch-based orbit)

## Contact & Support

**Project:** SmartFactory-Unity-POC  
**Tech Stack:** Unity C# (WebGL/Standalone)  
**Status:** Interactive Learning Environment  
**License:** Proprietary
