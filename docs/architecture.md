# Pick & Place Robot: Architecture

## System Architecture

```
┌──────────────────────────────────────────────────┐
│       React App (RoboticsTool.jsx)               │
│  ├─ State: pose, demo, selectedId, held block   │
│  ├─ Event handlers: slider changes, buttons     │
│  └─ Canvas + UI Layout                          │
└──────────────┬───────────────────────────────────┘
               │
    ┌──────────▼──────────────────┐
    │  Simulation Engine (data.js) │
    │  - Forward kinematics        │
    │  - Keyframe interpolation    │
    │  - Collision detection       │
    │  - Pick/place logic          │
    └──────────┬───────────────────┘
               │
    ┌──────────▼──────────────────────────────┐
    │  React Three Fiber Scene                │
    │  (RobotCellScene.jsx)                   │
    │  ├─ Robot arm (6 joints)                │
    │  ├─ Gripper (2 fingers)                 │
    │  ├─ Block (held or resting)             │
    │  ├─ Stands (pick/place)                 │
    │  ├─ Safety fence & pedestal             │
    │  ├─ Lighting & shadows                  │
    │  └─ Orbit controls                      │
    └──────────┬──────────────────────────────┘
               │
    ┌──────────▼──────────────────┐
    │  Three.js WebGL Renderer    │
    │  - 60 FPS target            │
    │  - Shadow mapping           │
    │  - Anti-aliasing            │
    │  - Responsive to resize     │
    └──────────────────────────────┘
```

## File Structure

```
Module 9: Robotics/
├── data.js                  (Simulation + educational content)
├── RobotCellScene.jsx       (3D visualization)
├── RoboticsTool.jsx         (Main component & state)
├── Widgets.jsx              (Educational panels)
└── README.md                (This file)
```

## Component Breakdown

### 1. **data.js - Pure Simulation Logic**

**Purpose:** All numerical simulation + educational content (no React, no Three.js)

**Link Geometry:**
```javascript
LINK = {
  SHOULDER_PIVOT_Y: 0.4,    // Height of shoulder joint
  UPPER_ARM: 2.0,           // Length of upper arm segment
  FOREARM: 1.7,             // Length of forearm segment
  WRIST_ROLL_OFFSET: 0.28,  // Distance to wrist roll pivot
  WRIST_TO_GRASP: 0.6,      // Distance from wrist to grasp point
}
```

**Joint Configuration:**
- **J1 (Base):** Yaw rotation around Y-axis (±2.8 rad ≈ ±160°)
- **J2 (Shoulder):** Pitch rotation around X-axis (-1.2 to 1.4 rad)
- **J3 (Elbow):** Pitch rotation around X-axis (-0.4 to 2.2 rad)
- **J4 (Wrist Pitch):** Pitch rotation around X-axis (±1.7 rad ≈ ±97°)
- **J5 (Wrist Roll):** Roll rotation around Y-axis (±3.1 rad ≈ ±178°)
- **J6 (Gripper):** Linear open/close (0=closed, 1=open)

**Forward Kinematics Function:**
```javascript
forwardKinematics(pose) → { x, y, z, reach }
```
Takes joint angles (base, shoulder, elbow, wristPitch, wristRoll) and computes:
- **X:** Horizontal position (depends on base yaw + reach)
- **Y:** Vertical position (sum of pitches applied to upper arm, forearm, tool)
- **Z:** Horizontal depth (depends on base yaw + reach)
- **reach:** Distance from base to tool (√(x² + y² + z²))

**Math (simplified):**
```
a2 = shoulder
a23 = shoulder + elbow
a234 = a23 + wristPitch
tool = wristRollOffset + wristToGrasp

y = shoulderPivotY + upperArm·cos(a2) + forearm·cos(a23) + tool·cos(a234)
r = upperArm·sin(a2) + forearm·sin(a23) + tool·sin(a234)
x = r·sin(base)
z = r·cos(base)
```

**Pick-and-Place Cycle:**
- **9 keyframes** defining the motion from 0 (home) to 1 (home after cycle)
- **Smooth interpolation** between keyframes using easing function
- **GRIP_CLOSE_T = 0.36:** Progress point where gripper closes (grip active)
- **RELEASE_T = 0.88:** Progress point where gripper opens (block released)

**Keyframes:**
```
t=0.0  → home position (gripper open)
t=0.15 → move to pick stand
t=0.28 → lower toward block
t=0.36 → grip closed (HOLD BLOCK)
t=0.5  → lift block
t=0.64 → move to place stand
t=0.78 → lower toward place stand
t=0.88 → release block (OPEN GRIPPER)
t=1.0  → return to home
```

**Educational Content:**
- `ROBOT_TYPES[]` — 6 robot types (articulated, SCARA, Delta, Cartesian, cylindrical, spherical)
- `KINEMATICS[]` — 6 kinematics concepts (DOF, forward FK, inverse FK, work envelope, singularity, accuracy)
- `APPLICATIONS[]` — 5 use cases (welding, assembly, palletizing, painting, inspection)
- `SAFETY[]` — 4 safety aspects (emergency stop, guarding, collaborative limits, work cells)
- `KNOWLEDGE_QUESTIONS[]` — 3 quiz questions with explanations

### 2. **RobotCellScene.jsx - 3D Visualization**

**Purpose:** 3D scene rendering using React Three Fiber + Three.js

**Components:**

**RobotArm Component:**
- **Base:** Cylindrical pedestal (gray, metallic)
- **Shoulder (J2):** Rotates around X-axis, upper arm extends
  - Upper arm (orange box, 2.0 units long)
  - Shoulder joint (orange cylinder)
- **Elbow (J3):** Rotates around X-axis, forearm extends
  - Forearm (lighter orange box, 1.7 units long)
  - Elbow joint (orange cylinder)
- **Wrist Pitch (J4):** Rotates around X-axis, prepares for roll
  - Wrist joint (orange cylinder)
- **Wrist Roll (J5):** Rotates around Y-axis, final orientation
  - Roll axis (slim cylinder)
- **Gripper (J6):** Linear open/close
  - Base (gray box, 0.72×0.16×0.34)
  - Left finger (dark gray box, position ±gap)
  - Right finger (dark gray box, position ±gap)
  - Gap = 0.26 + gripper·0.12 (0=closed at 0.26, 1=open at 0.38)
- **Held Block:** Cyan emissive box (0.4×0.4×0.4), parented to wrist when held

**Joint Labels:**
- Clickable labels on hover showing J1-J6 names
- Orange highlight when selected
- HTML overlay (no 3D geometry, efficient)

**Stands:**
- **Pick Stand (right):** 0.42 radius, height varies
  - Label: "PICK"
  - Block rests here at t=0 and when released
- **Place Stand (left):** 0.42 radius, height varies
  - Label: "PLACE"
  - Block settles here when released near it

**Safety Fence:**
- 3-sided perimeter (rear, left, right; camera side open)
- Yellow/black hazard striping (24 segments)
- Posts at corners (yellow cylinders, 1.6 units tall)
- Yellow ring marking robot footprint

**Base Riser:**
- Pedestal (gray cylinder, 1.05-1.2 radius, 0.18 height)
- Yellow/black hazard ring painted on top

**Lighting & Environment:**
- Directional light (key light)
- Ambient light (fill)
- Contact shadows (ground plane)
- Orbit controls (user camera manipulation)
- Grid helper (optional floor reference)

### 3. **RoboticsTool.jsx - Main Component**

**Purpose:** State management, event handling, layout orchestration

**State:**
```javascript
pose = {
  base: number,       // J1 angle (radians)
  shoulder: number,   // J2 angle
  elbow: number,      // J3 angle
  wristPitch: number, // J4 angle
  wristRoll: number,  // J5 angle
  gripper: number,    // J6 open/close (0-1)
}

selectedId = string     // Currently selected joint (for highlighting)
demo = boolean          // Demo mode active?
leftOpen = boolean      // Left panel open?
rightOpen = boolean     // Right panel open?
held = boolean          // Block currently held by gripper?
blockRest = [x, y, z]   // Block position when resting
progress = number       // Demo cycle progress (0-1)
cycles = number         // Completed pick-place cycles
```

**Demo Mode:**
```javascript
if demo:
  every 40ms:
    progress += 0.006
    if progress >= 1: cycles++, progress = progress % 1
    pose = getPoseAtProgress(progress)
```
- **Cycle time:** 1.0 / 0.006 * 40ms ≈ 6.7s (170 frames per cycle at 25Hz interval)
- **Block carried:** From t=0.36 to t=0.88 (52% of cycle)

**Manual Control:**
```javascript
set(jointId, value) {
  demo = false       // Exit demo mode
  pose[jointId] = value
}
```

**Pick/Release Logic:**
```javascript
if !held && gripper < 0.35 && distance(tool, blockRest) < 0.6:
  held = true        // Pick up block

if held && gripper > 0.6:
  held = false       // Release block
  blockRest = nearest_stand(tool_position)  // Snap to nearest stand
```

**Rendering:**
- Canvas component (React Three Fiber)
- Camera position: [8.5, 6, 10], FOV 46°
- Left panel: 200px (optional collapse)
  - Joint sliders (6 sliders, one per joint)
  - Live angle readouts
  - Demo/Pause/Reset buttons
- Right panel: 200px (optional collapse)
  - Tab selector (Types, Kinematics, Applications, Safety)
  - Scrollable content area
- Center: Full-screen 3D canvas

### 4. **Widgets.jsx - Educational Panels**

**Purpose:** Educational content displayed in right panel tabs

**RobotTypes Component:**
- Card layout for 6 robot types
- Each card shows:
  - Type name (Articulated, SCARA, Delta, Cartesian, Cylindrical, Spherical)
  - DOF count (3-6 DOF)
  - Detailed description
  - Key applications

**KinematicsExplorer Component:**
- Expandable list of 6 concepts:
  1. **DOF (Degrees of Freedom)** — Explanation + 6 DOF standard
  2. **Forward Kinematics** — Live calculation shown in tool position
  3. **Inverse Kinematics** — Challenge of solving joint angles for target position
  4. **Work Envelope** — Reachable region in space
  5. **Singularity** — Poses where motion becomes unpredictable
  6. **Accuracy vs Repeatability** — Standards (ISO 9283)

**Applications Component:**
- 5 use cases with descriptions:
  1. **Welding** — Torch on flange, continuous path
  2. **Assembly** — Precise pick-and-place
  3. **Palletizing** — Stacking boxes
  4. **Painting** — Spray gun tracing surfaces
  5. **Inspection** — Vision-guided assembly

**Safety Component:**
- 4 safety aspects:
  1. **Emergency Stop** — Instant motion halt
  2. **Guarding & Interlocks** — Fences, light curtains
  3. **Collaborative Limits** — Force/speed limits for cobots
  4. **Work Cell** — Integrated robot + feeders + machines

## Data Flow (Per Frame)

```
requestAnimationFrame (60 FPS target)
    ↓
Update simulation state (if demo mode):
  - Increment progress by 0.006
  - Calculate pose = getPoseAtProgress(progress)
  - Set new joint angles
    ↓
React state updates:
  - pose changes → setPose()
  - Re-render occurs
    ↓
RobotCellScene re-renders:
  - Three Fiber scene re-renders with new pose
    ↓
RobotArm component:
  - useFrame hook updates joint rotations (eased)
  - Gripper finger positions updated
  - Block position follows tool (if held)
    ↓
Three.js renders to WebGL canvas:
  - Geometry transformed by rotations
  - Materials lit by directional + ambient light
  - Shadows computed and rendered
  - Output to screen
    ↓
Display on monitor (~60 FPS)
```

## Key Technical Decisions

1. **Pure simulation in data.js** — No React dependencies, testable math
2. **Eased joint motion** — Frame-rate-independent damping for smooth movement
3. **Gripper collision detection** — Simple distance-based (not physics engine)
4. **Keyframe interpolation** — Smooth Hermite easing between control points
5. **Parenting block to wrist** — Natural pick-and-place without physics simulation
6. **Right-side educational content** — Separate from control panel, doesn't interfere
7. **Orbit controls** — User can rotate/pan camera freely
8. **Contact shadows** — Subtle ground contact for depth perception
9. **Color-coded materials** — Orange arm = easy to track, gray = base/gripper, cyan = active block

## Performance Characteristics

| Metric | Target | Notes |
|--------|--------|-------|
| FPS | 60 | Smooth joint motion |
| Frame time | 16ms | ~14-18ms actual |
| Simulation loop | 40ms | Demo updates at 25 Hz |
| Canvas render | < 16ms | WebGL rendering |
| Memory | 100-150 MB | 3D scene + animation state |
| Model load | 0ms | No external models |
| Pick/place cycle | 6-7s | ~170 frames at 25 Hz |

## Browser Capabilities Used

- **WebGL 2.0** — Hardware-accelerated 3D rendering
- **requestAnimationFrame** — Smooth animation loop
- **Canvas API** — Direct rendering context
- **Three.js** — 3D scene graph, lighting, materials
- **React Three Fiber** — Declarative 3D in React
- **CSS Grid/Flexbox** — Responsive UI layout
- **Window resize listener** — Responsive canvas scaling

## Extension Points

To extend the system:

1. **Add new robot type** — Modify link lengths in `LINK`, adjust kinematics function
2. **Change demo cycle** — Edit `KEYFRAMES[]` in data.js
3. **Add gripper types** — Create new gripper geometry in `RobotArm`
4. **Add more stands** — Create new `Stand` components in scene
5. **Add constraints visualization** — Render work envelope as wireframe sphere
6. **Add inverse kinematics solver** — Implement IK algorithm in data.js
7. **Add motion planning** — Implement path planning algorithm

## Testing Strategy

- **Simulation logic** (data.js) — Unit tests for FK calculation
- **Scene rendering** — Visual regression tests (screenshot comparisons)
- **Component integration** — Manual testing of slider → animation flow
- **Kinematics accuracy** — Verify FK against known positions
- **Gripper collision** — Test pick/release near/far from block
- **Demo cycle** — Verify keyframes execute in correct order
- **Educational content** — Quiz correctness verification

## Accessibility

- **Keyboard control** — Arrow keys adjust joint angles (future)
- **High contrast theme** — Dark/light modes available
- **Descriptive labels** — Joint names visible on hover
- **Respectable color contrast** — Orange on dark background
- **No color-only information** — Position shown via 3D geometry
- **Responsive layout** — Works on mobile/tablet/desktop
- **Touch-friendly controls** — Sliders and buttons sized appropriately

## Security

- **Client-side only** — No backend, no data transmission
- **No user data collection** — Simulation is local
- **No authentication** — Safe to run anywhere
- **No external dependencies** — Only npm packages (vetted)

## Browser Compatibility

✅ Chrome 90+  
✅ Firefox 88+  
✅ Safari 14+  
✅ Edge 90+  
✅ Mobile browsers (iOS Safari, Android Chrome)
