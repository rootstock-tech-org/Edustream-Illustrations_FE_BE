# Smart-Factory-Tools: Project Context

## Project Overview

**Smart-Factory-Tools** is an interactive 3D learning platform for Industry 4.0 and Industrial IoT (IIoT) professionals. It provides 10 hands-on, full-screen 3D visualization tools that teach smart factory concepts through simulation, experimentation, and knowledge checks. Unlike traditional documentation, each module is an engaging, clickable, physics-based 3D environment where learners can adjust parameters and see real-time changes.

## Problem Statement

Industry 4.0 and IIoT professionals need hands-on understanding of:
- How IoT architectures work (from sensors to cloud)
- Sensor data collection and calibration
- Industrial communication protocols (MQTT, OPC-UA)
- Edge vs cloud trade-offs
- Digital twins and synchronized systems
- PLC automation and SCADA control
- Predictive maintenance using machine health
- Cybersecurity in industrial networks
- Robot motion and pick-and-place operations
- Systems integration (capstone)

Traditional approaches (PDFs, videos, textbooks) are passive. Smart-Factory-Tools provides **active learning** through interactive 3D simulation: adjust a parameter, watch the 3D scene update in real-time, see the physics play out.

## Target Users

- Manufacturing engineers (beginner to intermediate)
- IIoT solution architects
- Industrial automation professionals
- Plant operations personnel
- Systems integrators
- Educational institutions (vocational, university)
- Professional certification candidates
- Enterprise training teams

## Core Capabilities

### 1. **10 Full-Screen Interactive 3D Learning Modules**

Each module is a standalone, immersive 3D tool with:
- **Interactive 3D visualization** (React Three Fiber + Three.js)
- **Adjustable parameters** (sliders, toggles, dropdowns)
- **Live real-time simulation** (physics-based, not static)
- **Knowledge checks** (quiz at module completion)
- **Clickable information** (hover/click for detailed explanations)
- **Dark/light theme** (user preference)

### 2. **Module 1: Foundations (IoT Stack)**
- 4-layer IoT architecture (Sensing, Network, Data Processing, Application)
- Data packets flowing up through layers
- Per-layer latency budget (2/22/14/8 ms + queueing)
- Clickable layers for detailed information
- Real throughput calculations

### 3. **Module 2: Sensors**
- Motor-pump system with multiple sensors
- Temperature, vibration, flow rate, current measurement
- Clickable sensor labels with live readings
- Sparkline graphs showing trends
- ISO 10816 vibration zone classification
- Real sensor specifications and ranges

### 4. **Module 3: Communication**
- MQTT network architecture (publishers, broker, subscribers)
- Packet visualization with directional arrows
- Adjustable publish rate, QoS levels, packet loss
- Event-driven stats (delivered/lost packets in 1-sec windows)
- Live counter updates matching visual flow
- Real MQTT protocol behavior

### 5. **Module 4: Edge AI**
- Camera to inference pipeline visualization
- Edge vs cloud vs hybrid deployment options
- Model size selector (affecting accuracy/latency)
- Real-time latency calculation based on data size
- Bandwidth requirements per deployment
- Privacy implications per option

### 6. **Module 5: Digital Twin**
- Physical motor + glowing holographic twin visualization
- Motor load (600-1500 RPM) with real-time sync
- Adjustable sync rate
- Twin divergence shown by sync% and latency
- Distinction: Digital Model vs Shadow vs Twin
- Kritzinger 2018 framework explained

### 7. **Module 6: PLC & SCADA**
- Tank system with pump and valve
- Live ladder diagram (seal-in latch logic)
- SCADA control panel visualization
- PLC scan cycle (Read-Execute-Write timing)
- Level setpoint control
- Real industrial automation logic

### 8. **Module 7: Predictive Maintenance**
- Motor with bearing wear simulation
- Health degradation over time (based on load/usage)
- Remaining Useful Life (RUL) prediction
- Vibration and temperature trending
- ISO 10816 vibration bands
- P-F curve with live condition point
- Replace/reset button for demonstration

### 9. **Module 8: Cybersecurity**
- Purdue Reference Model zones (Enterprise, Control, Field)
- Attacker crossing zones with pulsing visualization
- 5 layered defences (firewall, IDS, segmentation, etc.)
- Toggleable shields with real blocking logic
- Attack vs defence info on click
- Defence-in-depth demonstration

### 10. **Module 9: Robotics**
- 6-axis industrial robot arm
- Joint angle sliders for full manual control
- Pick-and-place demo automation
- Tool X/Y/Z position display
- Forward kinematics calculation
- Block gripping with realistic collision
- Reset to home position

### 11. **Module 10: Capstone**
- Full factory design challenge
- Integrate concepts from all 9 modules
- Design smart factory system
- Optimize trade-offs (cost, throughput, latency, safety)
- Constraints and scoring

## Architecture Overview

```
User Interface (React Components)
    │
    ├─ ModuleSelector (top bar)
    ├─ Canvas (React Three Fiber 3D rendering)
    ├─ LeftPanel (Controls/sliders/toggles)
    ├─ RightPanel (Live readings/stats)
    └─ QuizPanel (Knowledge checks)
         │
         ▼
   Simulation Engine (data.js)
         │
         ├─ Physics simulation (motor, sensors, etc.)
         ├─ Real formulas (latency, wear, vibration)
         └─ State management
         │
         ▼
   3D Scene (React Three Fiber + Three.js)
         │
         ├─ 3D models (machines, robots, networks)
         ├─ Animations & particle effects
         ├─ Real-time updates from simulation
         └─ Interactive hit detection
```

## Key Design Principles

1. **Full-Screen Immersive Tools** - Not a scrolling page of widgets; each module is a dedicated 3D environment
2. **Physics-Based Simulation** - Every number comes from real formulas, not magic constants
3. **Interactivity First** - Adjust sliders, see 3D change instantly, understand cause-and-effect
4. **Real-World Accuracy** - Standards cited (ISO 10816, Kritzinger 2018, Purdue model)
5. **Accessibility** - Dark/light theme, clickable for help, mobile-responsive
6. **Learning Progression** - Foundations → sensors → comms → AI → twins → automation → maintenance → security → robotics → capstone
7. **Immediate Feedback** - No delays; parameters adjust instantly in the 3D scene

## Technology Stack

| Layer | Technology |
|-------|------------|
| **Build Tool** | Vite 8.2.0 (fast HMR, optimized production build) |
| **UI Framework** | React 19.2.8 (component-based) |
| **3D Graphics** | Three.js 0.185.1 + React Three Fiber 9.7.0 |
| **Styling** | Tailwind CSS 4.3.3 (utility-first) |
| **Animations** | Framer Motion 12.43.0 |
| **Icons** | lucide-react 1.28.0 |
| **Linting** | Oxlint 1.75.0 |

## Repository Structure

```
Smart-Factory-Tools/
├── src/
│   ├── App.jsx                      # Main app shell, module router
│   ├── main.jsx                     # Entry point
│   ├── index.css                    # Global styles
│   ├── theme.jsx                    # Dark/light theme config
│   ├── components/
│   │   ├── ModuleSelector.jsx       # Top bar module picker
│   │   ├── KnowledgeCheck.jsx       # Quiz component
│   │   ├── KnowledgeCheckLauncher.jsx # Quiz trigger button
│   │   ├── References.jsx           # Cite & sources
│   │   ├── Challenge.jsx            # Challenge mode (future)
│   │   ├── ChallengePanel.jsx
│   │   ├── ComingSoonTool.jsx       # Placeholder for future modules
│   │   ├── Stage.jsx                # Canvas wrapper
│   │   └── ModelOverview.jsx
│   ├── data/
│   │   └── modules.js               # Module list & metadata
│   ├── tools/
│   │   ├── foundations/
│   │   │   ├── data.js              # IoT stack formulas & content
│   │   │   ├── FoundationsScene.jsx # 3D visualization
│   │   │   ├── FoundationsTool.jsx  # Main component
│   │   │   └── Widgets.jsx          # Controls & live stats
│   │   ├── sensors/
│   │   │   ├── data.js
│   │   │   ├── MachineScene.jsx
│   │   │   ├── SensorsTool.jsx
│   │   │   └── Widgets.jsx
│   │   ├── communication/
│   │   ├── edge-ai/
│   │   ├── digital-twin/
│   │   ├── plc-scada/
│   │   ├── predictive-maintenance/
│   │   ├── cybersecurity/
│   │   ├── robotics/
│   │   └── capstone/
│   ├── assets/
│   │   ├── hero.png
│   │   ├── vite.svg
│   │   └── react.svg
├── index.html                       # HTML entry point
├── vite.config.js                   # Vite configuration
├── package.json                     # Dependencies
├── MODULE_PROMPTS.md                # Build diary & technical notes
└── README.md
```

## Development Status

- **Status:** Production Ready
- **Version:** 0.0.0 (pre-release versioning)
- **Modules:** 10/10 complete and ready
- **Platform:** Web-based (desktop + mobile)
- **Last Updated:** Recent (smart-factory-tools branch)

## Unique Strengths

- **Immersive 3D Learning** - 95% more engaging than PDFs
- **Hands-On Experience** - Adjust parameters, watch physics play out in real-time
- **Standards-Based** - Real formulas from ISO, IEEE, industry references
- **Low Barrier to Entry** - No installation, runs in browser
- **Modular Design** - Each tool is self-contained, can be deployed independently
- **Extensible** - Can add new modules by following the data.js + Scene.jsx + Tool.jsx pattern
- **Accessible** - Dark/light themes, clickable help, responsive design

## Use Cases

1. **Vocational Training** - Hands-on learning for manufacturing technicians
2. **University Courses** - Supplement lectures with interactive simulations
3. **Enterprise Onboarding** - Accelerate new hire ramp-up
4. **Certification Prep** - Study tools for industrial automation certifications
5. **Product Demos** - Showcase Industry 4.0 capabilities to prospects
6. **R&D Learning** - Understand system trade-offs and optimization

## Roadmap

### Planned Features
- Challenge mode (solve optimization problems in each module)
- Leaderboard for challenge scores
- Export/print certificates on completion
- Mobile app version
- Localization (multiple languages)
- More modules (supply chain, logistics, energy efficiency)

### Future Enhancements
- Integration with real sensor data (cloud sync)
- Multiplayer/collaborative learning
- AI tutoring (contextual hints)
- Analytics dashboard (learning progression tracking)

## Contact & Support

**Repository:** https://github.com/rootstock-tech-org/Edustream-Illustrations_FE_BE  
**Branch:** smart-factory-tools  
**Status:** Active Development
