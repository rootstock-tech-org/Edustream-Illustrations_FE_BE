# Pick & Place Robot: Project Context

## Project Overview

**Pick & Place Robot** is an interactive 3D robotic cell simulator for learning 6-axis articulated arm kinematics, gripper control, and automated pick-and-place operations. Users control individual joint angles via sliders, observe forward kinematics in real-time, or run automated demo cycles to see the robot pick blocks from a source stand and place them on a destination stand. Designed for manufacturing engineers, automation students, and roboticists.

## Problem Statement

Industrial robotics training requires hands-on understanding of:
- How 6-axis articulated arms move (joint configuration)
- Forward kinematics: joint angles → tool position (X, Y, Z)
- Inverse kinematics challenges (solving for angles given a target position)
- Gripper control and collision detection
- Pick-and-place cycle planning (coordination timing)
- Payload and work envelope constraints
- Safety in robotic cells (guarding, interlocks, cobots)
- Different robot types (SCARA, Delta, Cartesian, cylindrical, spherical)

Traditional approaches (textbooks, still diagrams, YouTube videos) are passive and hard to visualize. Pick & Place Robot provides **interactive 3D simulation**: adjust a joint slider, watch the arm move in real-time, see the gripper grasp and release the block, read the tool position updating live.

## Target Users

- Manufacturing engineers (beginner to advanced)
- Industrial automation technicians
- Robotics students (vocational, university)
- Factory automation integrators
- System designers planning robotic cells
- Training departments (onboarding new staff)
- Robotics hobbyists and learners

## Core Capabilities

### 1. **Interactive 6-Axis Arm Control**
- 6 independent joint sliders (Base, Shoulder, Elbow, Wrist Pitch, Wrist Roll, Gripper)
- Real-time joint angle display (in radians and degrees)
- Joint angle limits (realistic per industrial standards)
- Smooth motion between slider changes

### 2. **Forward Kinematics Visualization**
- Live calculation of tool position (X, Y, Z) from joint angles
- Visual tooltip showing current tool coordinates
- Reach calculation (distance from base to tool)
- Real-time updates as joints move

### 3. **Gripper & Pick-and-Place**
- 2-finger gripper with open/close control (0=closed, 1=open)
- Collision detection (gripper-block clearance)
- Manual pick-and-place: close gripper near block to pick, open to release
- Block automatically settles on nearest stand (Pick or Place)
- Payload visualization (cyan block held by gripper)

### 4. **Automated Demo Mode**
- Pre-programmed pick-and-place cycle (9 keyframes)
- Smooth interpolation between keyframes
- Cycle timing (2.5s per complete cycle)
- Cycle counter (track completed pickups)
- Pause/resume capability

### 5. **Robot Cell Environment**
- 3D robotic cell with safety fence (3-sided, camera side open)
- Yellow/black hazard markings around robot footprint
- Pick stand (source location)
- Place stand (destination location)
- Base pedestal/riser (realistic mounting)
- Contact shadows and lighting

### 6. **Educational Content**
- Robot types explorer (6 types: articulated, SCARA, Delta, Cartesian, cylindrical, spherical)
- Kinematics concepts (DOF, forward/inverse FK, work envelope, singularity)
- Applications overview (welding, assembly, palletizing, painting, inspection)
- Safety concepts (emergency stop, guarding, collaborative limits, work cells)
- Knowledge check quiz (3 questions covering key concepts)

### 7. **User Interface**
- Full-screen 3D canvas (React Three Fiber)
- Left panel: Joint sliders (manual control mode)
- Right panel: Educational content tabs (Types, Kinematics, Applications, Safety)
- Top controls: Demo/Pause/Reset buttons, joint selector
- Live readings: Current joint angles, tool position (X, Y, Z), gripper state
- Dark/light theme toggle

## Architecture Overview

```
┌─────────────────────────────────────┐
│    Browser (React app)              │
│  ├─ Canvas (3D scene)               │
│  ├─ Left panel (joint sliders)      │
│  └─ Right panel (educational tabs)  │
└────────────┬────────────────────────┘
             │
    ┌────────▼─────────────────┐
    │  Simulation Engine       │
    │  (data.js)               │
    │  - Forward kinematics    │
    │  - Keyframe interpolation│
    │  - Collision detection   │
    └────────┬─────────────────┘
             │
    ┌────────▼──────────────────────┐
    │  React Three Fiber Scene       │
    │  - Robot arm (6 joints)        │
    │  - Gripper (2 fingers)         │
    │  - Block (cyan, 0.4×0.4×0.4)   │
    │  - Stands (pick/place)         │
    │  - Safety fence & pedestal     │
    │  - Lighting & shadows          │
    └────────┬──────────────────────┘
             │
    ┌────────▼──────────────────┐
    │  Three.js Renderer        │
    │  - WebGL context          │
    │  - 60 FPS target          │
    │  - Shadow mapping         │
    │  - Anti-aliasing          │
    └──────────────────────────┘
```

## Key Design Principles

1. **Hands-On Learning** — Sliders directly control joints; instant visual feedback
2. **Real Physics** — Forward kinematics based on actual link lengths and geometry
3. **Safe Simulation** — No real hardware risk; experiment freely
4. **Accessibility** — Works in any modern browser; no software installation
5. **Interactive Exploration** — Manual control mode + automated demo mode
6. **Educational Context** — Built-in explanations (robot types, kinematics, safety)
7. **Responsive Design** — Adapts to desktop, tablet, mobile
8. **Dark/Light Theme** — User preference, easy on eyes

## Technology Stack

| Component | Technology |
|-----------|-----------|
| **Framework** | React 19.2.8, Next.js 16.3.3 |
| **3D Graphics** | React Three Fiber, Three.js |
| **Bundler** | Vite |
| **Styling** | Tailwind CSS 4 |
| **UI Icons** | Lucide React |
| **Simulation** | Vanilla JavaScript (data.js, pure logic) |
| **Communication** | Client-side only (no backend) |

## File Structure

```
Pick-Place-Robot/
├── [Module 9 from Smart Factory Tools]
│   ├── data.js                    # Simulation logic
│   ├── RobotCellScene.jsx         # 3D visualization
│   ├── RoboticsTool.jsx           # Main component & state
│   ├── Widgets.jsx                # Educational panels
│   └── README.md                  # Project documentation
```

## Component Details

### data.js - Simulation Logic
- **Link lengths:** Shoulder pivot (0.4), upper arm (2.0), forearm (1.7), wrist roll offset (0.28), wrist to grasp (0.6)
- **Forward kinematics function:** Takes joint angles, returns X, Y, Z tool position
- **Pick-place keyframes:** 9 keyframes (0-1 progress) defining the automated cycle
- **Robot types:** 6 types with descriptions (articulated, SCARA, Delta, Cartesian, cylindrical, spherical)
- **Kinematics concepts:** DOF, forward/inverse FK, work envelope, singularity, accuracy vs repeatability
- **Applications:** Welding, assembly, palletizing, painting, inspection
- **Safety:** Emergency stop, guarding, collaborative limits, work cells
- **Knowledge questions:** 3 quiz questions covering kinematics concepts

### RobotCellScene.jsx - 3D Visualization
- **Robot arm:** 6 joints with group hierarchies for realistic kinematics
- **Gripper:** 2 fingers, position varies with gripper slider (0=closed, 1=open)
- **Block:** Cyan box parented to wrist when held, settles on stand when released
- **Stands:** Pick stand (right) and Place stand (left) with labels
- **Safety fence:** 3-sided yellow/black striped fence with posts
- **Base riser:** Pedestal with hazard ring marking
- **Lighting:** Directional light, ambient light, contact shadows
- **Camera:** Orbit controls for user interaction
- **Joint labels:** Clickable labels on hover (show/hide for clarity)

### RoboticsTool.jsx - Main Component
- **State:** Pose (6 joint angles), selectedId, demo mode, demo progress, held block state
- **Demo loop:** Cycles through keyframes at 25 FPS (40ms interval), repeats infinitely
- **Manual control:** Adjusting joint sliders in real-time
- **Pick-release logic:** Gripper closes near block to pick, opens to release
- **Forward kinematics:** Calculates and displays current tool position
- **UI Layout:** Canvas on center, left panel (sliders), right panel (educational content)

### Widgets.jsx - Educational Content
- **Robot Types tab:** Card layout for 6 robot types (articulated, SCARA, Delta, Cartesian, cylindrical, spherical)
- **Kinematics Explorer tab:** Expandable concepts (DOF, forward/inverse FK, envelope, singularity, accuracy)
- **Applications tab:** 5 use cases (welding, assembly, palletizing, painting, inspection)
- **Safety tab:** 4 safety aspects (emergency stop, guarding, cobots, work cells)

## Development Status

- **Status:** Production Ready (from Smart Factory Tools Module 9)
- **Version:** 0.0.0
- **Browser Compatibility:** Chrome, Firefox, Safari, Edge (modern browsers with WebGL 2.0)
- **Mobile Support:** Basic support (tablet-friendly, portrait mode)

## Key Features Checklist

✅ 6-axis joint control (sliders)  
✅ Forward kinematics (real-time calculation)  
✅ Gripper control (open/close)  
✅ Automated pick-place demo  
✅ Manual pick-place (drag & release)  
✅ Robot types explorer (6 types)  
✅ Kinematics concepts (DOF, FK, IK, envelope, singularity)  
✅ Applications overview (5 use cases)  
✅ Safety education (4 concepts)  
✅ Knowledge check quiz  
✅ Joint angle display (radians & degrees)  
✅ Tool position readout (X, Y, Z)  
✅ 3D safety fence & cell  
✅ Dark/light theme  
✅ Responsive design  

## Success Metrics

- [ ] Smooth joint motion (60 FPS)
- [ ] Forward kinematics accurate to geometry
- [ ] Gripper collision detection working
- [ ] Block picks up and releases correctly
- [ ] Demo cycle completes in 2.5s
- [ ] All 6 robot types clearly explained
- [ ] Kinematics concepts understood via UI
- [ ] Quiz questions answerable from module
- [ ] Works on Chrome, Firefox, Safari, Edge
- [ ] Mobile-friendly controls and layout

## Contact & Support

**Project:** Pick & Place Robot (Module 9, Smart Factory Tools)  
**Tech Stack:** React + Three.js (Vite)  
**Status:** Interactive Learning Platform  
**License:** Proprietary
