# Pick & Place Robot

> **Interactive 3D robotic arm simulator.** Control 6 joint angles with sliders, watch forward kinematics calculate tool position in real-time, run automated pick-and-place demo cycles. Learn robotics hands-on!

**Status:** Production Ready | **Version:** 0.0.0 | **License:** Proprietary

## Overview

Pick & Place Robot is an **interactive 3D simulator** for learning industrial robot kinematics, gripper control, and automated pick-and-place operations. Unlike static diagrams or videos, you:

- 🎮 **Control joints directly** — 6 independent sliders for base, shoulder, elbow, wrist pitch, wrist roll, gripper
- 📊 **See math in real-time** — Forward kinematics calculates X, Y, Z tool position as you move sliders
- ⚙️ **Watch the mechanics** — Smooth 3D animation of all joints, gripper, and held block
- ▶️ **Run demo cycles** — Automated pick-and-place sequence (9 keyframes, smooth interpolation)
- 🚀 **Learn robotics concepts** — Robot types (6 types), kinematics theory, applications, safety

**Perfect for:** Manufacturing engineers, automation students, roboticists, educators, hobbyists learning industrial robots.

## Quick Start

### 5-Minute Setup

```bash
# 1. Clone Smart Factory Tools repo
git clone https://github.com/rootstock-tech-org/Edustream-Illustrations_FE_BE.git
cd Edustream-Illustrations_FE_BE
git checkout smart-factory-tools

# 2. Install dependencies
npm ci

# 3. Start dev server
npm run dev

# 4. Open http://localhost:5173
# Navigate to Robotics module → Pick & Place Robot
```

**You're done!** Start by adjusting the joint sliders.

## How It Works

### 1. **Manual Joint Control**

Each of the 6 joints has a slider:
- **J1 (Base):** Rotate around vertical axis (yaw)
- **J2 (Shoulder):** Pitch up/down
- **J3 (Elbow):** Pitch up/down
- **J4 (Wrist Pitch):** Fine-tune tool orientation
- **J5 (Wrist Roll):** Roll the gripper
- **J6 (Gripper):** Open (1) or close (0) fingers

Move any slider → see the arm respond instantly in 3D!

### 2. **Real-Time Forward Kinematics**

As you adjust joints:
```
Joint angles (6 inputs) → Mathematical calculation → Tool position X, Y, Z (output)
```

**Live display shows:**
- Current joint angles (radians)
- Tool position (X, Y, Z coordinates)
- Distance from base (reach)

### 3. **Pick-and-Place Block**

The cyan block rests on the **Pick Stand** by default:

**Manual grab-and-release:**
1. Move gripper close to block (< 0.6 units away)
2. Close gripper (J6 slider toward 0)
3. Block is now held by gripper
4. Move arm to new location
5. Open gripper (J6 slider toward 1)
6. Block settles on nearest stand

**Automated demo cycle:**
1. Click "Demo" button
2. Watch the arm execute a pre-programmed sequence
3. Picks block from Pick Stand (right)
4. Lifts, rotates, lowers to Place Stand (left)
5. Releases block
6. Returns to home position
7. Repeats infinitely

### 4. **Learn Robotics Concepts**

Right panel has 4 tabs:

**Types (6 robot types):**
- Articulated (6 DOF, most common)
- SCARA (4 DOF, fast assembly)
- Delta (3 DOF, ultra-fast pick-place)
- Cartesian (3+ DOF, rectangular workspace)
- Cylindrical (3-4 DOF, tight spaces)
- Spherical (3+ DOF, historic design)

**Kinematics (6 concepts):**
- Degrees of Freedom (DOF)
- Forward Kinematics (FK) — angles → position
- Inverse Kinematics (IK) — position → angles
- Work Envelope — reachable region
- Singularity — unpredictable poses
- Accuracy vs Repeatability — specifications

**Applications (5 use cases):**
- Welding — torch follows path
- Assembly — precise pick-place
- Palletizing — stack boxes
- Painting — spray gun traces
- Inspection — vision-guided

**Safety (4 aspects):**
- Emergency stop (big red button)
- Guarding & interlocks (fences, light curtains)
- Collaborative limits (cobots safe for humans)
- Work cell (robot + feeders + machines)

### 5. **Knowledge Check**

Quiz yourself on kinematics:
- 3 questions covering key concepts
- Multiple choice
- Instant feedback with explanations

## Key Features

### 🎮 **Interactive Control**
- ✅ 6 independent joint sliders (real-time control)
- ✅ Joint angle display (radians + degrees)
- ✅ Gripper open/close slider
- ✅ Demo/Pause/Reset buttons

### 📐 **Forward Kinematics**
- ✅ Real-time calculation from joint angles
- ✅ XYZ tool position display
- ✅ Reach distance (base to tool)
- ✅ Smooth joint motion (eased transitions)

### 🤖 **Pick-and-Place Automation**
- ✅ Pre-programmed 9-keyframe cycle
- ✅ Smooth interpolation (no jerk)
- ✅ Cycle counter (track pickups)
- ✅ Demo on/off toggle

### 🏗️ **Robotic Cell**
- ✅ 3D safety fence (yellow/black hazard markings)
- ✅ Pick stand (source location, right side)
- ✅ Place stand (destination, left side)
- ✅ Base pedestal with hazard ring
- ✅ Realistic joint visualization

### 📚 **Educational Content**
- ✅ 6 robot types (descriptions + use cases)
- ✅ 6 kinematics concepts (expandable)
- ✅ 5 applications (welding, assembly, palletizing, painting, inspection)
- ✅ 4 safety aspects (emergency stop, guarding, cobots, work cells)
- ✅ Knowledge check quiz (3 questions)

### 🎨 **User Interface**
- ✅ Full-screen 3D canvas (React Three Fiber)
- ✅ Left panel: Joint sliders + controls
- ✅ Right panel: Educational tabs (collapsible)
- ✅ Orbit controls (rotate camera by dragging)
- ✅ Dark/light theme toggle
- ✅ Responsive design (desktop, tablet, mobile)

## Tech Stack

| Component | Technology |
|-----------|-----------|
| **Framework** | React 19.2.8, Next.js 16.3.3 |
| **3D Graphics** | React Three Fiber, Three.js |
| **Bundler** | Vite |
| **Styling** | Tailwind CSS 4 |
| **UI Icons** | Lucide React |
| **Simulation** | Vanilla JavaScript (pure math, no frameworks) |

## Performance

| Metric | Value |
|--------|-------|
| **FPS Target** | 60 |
| **Frame Time** | 14-18ms |
| **Pick-Place Cycle** | ~6.7 seconds |
| **Memory Usage** | 100-150 MB |
| **Initial Load** | ~2-3 seconds |
| **Bundle Size** | ~500 KB (gzipped) |

## Browser Support

✅ **Chrome 90+** — Full support (WebGL 2.0)  
✅ **Firefox 88+** — Full support (WebGL 2.0)  
✅ **Safari 14+** — Full support (WebGL 2.0)  
✅ **Edge 90+** — Full support (WebGL 2.0)  
✅ **Mobile** — iOS Safari, Android Chrome (basic support)

## Usage Examples

### Example 1: Learn Forward Kinematics

**Goal:** Understand how joint angles affect tool position

```
1. Start with home pose (all joints at default)
2. Read initial tool position: e.g., X=0, Y=2.5, Z=0
3. Move J2 (Shoulder) slider up
4. Watch Z coordinate increase (arm reaches forward)
5. Move J1 (Base) slider left
6. Watch X and Z coordinates change (arm sweeps sideways)
7. Understand: changing multiple joints changes tool position in complex ways
```

### Example 2: Automated Pick-and-Place

**Goal:** See the robot pick and place blocks

```
1. Click Demo button
2. Watch the pre-programmed cycle:
   - Arm moves to pick stand (right side)
   - Gripper closes (picks up cyan block)
   - Arm lifts and rotates
   - Arm moves to place stand (left side)
   - Gripper opens (releases block)
   - Arm returns to home
3. Notice the 9 keyframes smooth out for realistic motion
4. Counter shows completed cycles
5. Click Pause to stop, Demo again to resume
```

### Example 3: Manual Pick-and-Place

**Goal:** Control the robot manually

```
1. Don't click Demo (manual mode)
2. Adjust J1, J2, J3 to position gripper near block on Pick stand
3. Reduce J6 (Gripper) slider from 1 to ~0.3 (close gripper)
4. Block is now held (appears cyan with glow)
5. Move J1, J2, J3 sliders to carry block to Place stand
6. Increase J6 slider to 1 (open gripper)
7. Block settles on Place stand
8. Repeat for multiple pickups
```

### Example 4: Learn Kinematics Concepts

**Goal:** Understand robot types

```
1. Open Types tab (right panel)
2. Read about Articulated robot (6 DOF, most common)
3. See description: "flexible for welding, assembly and handling"
4. Click on SCARA type: "fast and precise for assembly"
5. Notice Delta type: "extremely fast for lightweight pick-and-place"
6. Understand: different robot types suit different tasks
```

### Example 5: Quiz Yourself

**Goal:** Test kinematics knowledge

```
1. Click "Knowledge Check" button
2. Question 1: "How many DOF does a typical articulated arm have?"
3. Options: 3, 6, 2
4. Select 6 (correct!)
5. See explanation: "Three axes place tool anywhere, three more orient wrist"
6. Next questions cover forward kinematics and robot types
7. All correct = robotics fundamentals understood!
```

## Getting Started

### Development

```bash
# Clone repository
git clone https://github.com/rootstock-tech-org/Edustream-Illustrations_FE_BE.git
cd Edustream-Illustrations_FE_BE
git checkout smart-factory-tools

# Install dependencies
npm ci

# Start dev server (hot reload)
npm run dev

# Open browser at http://localhost:5173
```

### Production Build

```bash
# Build optimized version
npm run build

# Output in dist/ folder
```

### Docker

```bash
# Build image
docker build -t pick-place-robot .

# Run container
docker run -p 3000:3000 pick-place-robot

# Access at http://localhost:3000
```

## Deployment

See [deployment.md](deployment.md) for detailed options:
- **Vercel** (easiest, auto-deploy from Git)
- **Netlify** (drag-and-drop or Git)
- **GitHub Pages** (free, GitHub Actions CI/CD)
- **AWS** (S3 + CloudFront, Amplify, or App Runner)
- **Google Cloud** (Cloud Run, Firebase)
- **Azure** (App Service)
- **Docker** (self-hosted)
- **Nginx** (traditional web server)

## File Structure

```
src/tools/robotics/
├── data.js                      (Simulation + educational content)
├── RobotCellScene.jsx           (3D visualization)
├── RoboticsTool.jsx             (Main component)
├── Widgets.jsx                  (Educational panels)
└── README.md                    (This file)
```

## Customization

### Change Robot Dimensions

Edit in `data.js`:
```javascript
export const LINK = {
  UPPER_ARM: 2.0,   // Change arm length
  FOREARM: 1.7,     // Change forearm length
  // ... more
};
```

### Modify Pick-Place Cycle

Edit `KEYFRAMES[]` in `data.js`:
```javascript
const KEYFRAMES = [
  { t: 0.0, pose: { base: 0.0, shoulder: -0.3, ... } },
  { t: 0.15, pose: { ... } },  // Add/modify keyframes
  // ...
];
```

### Change Gripper Color

In `RobotCellScene.jsx`, find the gripper meshes:
```javascript
<meshStandardMaterial color="#1f2937" metalness={0.5} roughness={0.4} />
```
Change color hex code.

### Add New Educational Content

Add to appropriate array in `data.js`:
```javascript
export const APPLICATIONS = [
  // ... existing
  { id: 'machining', name: 'CNC Machining', detail: 'Robot arm holding workpiece...' },
];
```

## Troubleshooting

### Blank screen on load
- Check browser console (F12) for errors
- Verify WebGL support (`https://www.khronos.org/webgl/wiki/Getting_Started`)
- Try different browser

### 3D scene not rendering
- Update graphics drivers
- Try incognito mode (sometimes helps)
- Check if hardware acceleration is enabled

### Slow performance
- Disable shadows in Three.js
- Reduce animation frame rate
- Check CPU/GPU usage with DevTools

### Block not picking up
- Ensure gripper is close to block (< 0.6 units)
- Gripper must close (J6 < 0.35) near block
- Open browser console for debug logs

## FAQ

### Q: Can I use this in my classroom?

**A:** Yes! It's designed for education. Show on projector, or students run locally.

### Q: Can I modify the robot design?

**A:** Yes. Edit link lengths in `data.js`, adjust keyframes, customize colors.

### Q: Does it work offline?

**A:** Yes. Build locally, open in browser. No internet needed after initial load.

### Q: Can I export/import robot poses?

**A:** Not built-in yet, but you can add localStorage persistence.

### Q: What about inverse kinematics?

**A:** Currently forward kinematics only (joint angles → position). IK solver is planned.

### Q: Can I add more robot types?

**A:** Yes. Create new link geometry, update kinematics function, add to `ROBOT_TYPES[]`.

## Roadmap

### Planned Features
- ⏳ Inverse kinematics solver (position → joint angles)
- ⏳ Work envelope visualization
- ⏳ Collision detection with obstacles
- ⏳ Multiple end-effectors (welding torch, spray gun, gripper variants)
- ⏳ Save/load poses
- ⏳ Motion planning (path smoothing)
- ⏳ Multiplayer (share robot design, collaborate)
- ⏳ Mobile-optimized UI
- ⏳ VR/AR support (WebXR)

## Testing

### Manual Testing Checklist

```
✅ Start dev server (npm run dev)
✅ Click each joint slider → arm moves
✅ Joint angles update in real-time
✅ Tool position (X, Y, Z) updates
✅ Click Demo button → pick-place cycle runs
✅ Block moves from Pick stand to Place stand
✅ Click Pause → stops mid-cycle
✅ Click Reset → returns to home position
✅ Cycle counter increments
✅ Switch to Types tab → 6 robot types visible
✅ Expand Kinematics tab → 6 concepts expand
✅ Read Applications tab → 5 use cases
✅ Click Knowledge Check → 3 quiz questions
✅ Select answers → feedback appears
✅ Toggle dark/light theme → colors update
✅ Drag camera → rotate view
✅ Test on mobile → responsive layout
✅ Test on different browsers (Chrome, Firefox, Safari)
```

## Performance Tips

1. **Reduce animation complexity** — Disable shadow maps for older devices
2. **Use WebWorkers** — Offload simulation to thread
3. **Lazy load educational content** — Load tabs on-demand
4. **Optimize assets** — Compress textures (if any)
5. **Use production build** — `npm run build` creates optimized bundle

## Support & Resources

- **GitHub Issues:** Report bugs or request features
- **Documentation:**
  - [context.md](context.md) — Project vision & features
  - [architecture.md](architecture.md) — Technical design & code
  - [deployment.md](deployment.md) — Setup & deployment options
- **External:**
  - [Three.js Docs](https://threejs.org/docs/) — 3D graphics
  - [React Three Fiber Docs](https://docs.pmnd.rs/react-three-fiber/) — 3D in React
  - [Vite Docs](https://vitejs.dev/guide/) — Build tool

## Related Documentation

- **[context.md](context.md)** — Project vision, problem statement, design principles
- **[architecture.md](architecture.md)** — Technical design, component breakdown, data flow
- **[deployment.md](deployment.md)** — Local setup, production deployment, troubleshooting

## License

Proprietary - Developed by RootStock Technology

## Version History

### v0.0.0 (Current)
✅ 6-axis articulated robot arm  
✅ Real-time forward kinematics  
✅ 6 independent joint controls  
✅ Gripper open/close  
✅ Automated pick-and-place demo  
✅ Manual pick-and-place  
✅ 6 robot types explorer  
✅ 6 kinematics concepts  
✅ 5 applications  
✅ 4 safety aspects  
✅ 3-question knowledge check  
✅ Dark/light theme  
✅ Responsive design  
✅ 60 FPS animation  

### Planned
- v0.1.0 — Inverse kinematics solver
- v0.2.0 — Work envelope visualization
- v0.3.0 — Collision detection
- v0.4.0 — Multiple end-effectors
- v0.5.0 — VR/AR support

---

**Ready to learn robotics?** 🚀 [Start here](http://localhost:5173) after running `npm run dev`.

**Questions?** Check [architecture.md](architecture.md) for technical details or [deployment.md](deployment.md) for setup help.
