/**
 * RobotCellScene.jsx
 * ------------------
 * 3D content of the Robotics tool: a 6-axis articulated arm (reused from the
 * robot-arm demo) whose joints are driven live by `pose`. During the demo it
 * picks the block from the pick stand, carries it and places it on the place
 * stand. Joint labels show only when driving manually so they don't clutter.
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls, Html, Grid, ContactShadows } from '@react-three/drei';
import { LINK } from './data';

const { SHOULDER_PIVOT_Y, UPPER_ARM, FOREARM, WRIST_ROLL_OFFSET } = LINK;

function JointLabel({ id, name, pos, selected, onSelect }) {
  return (
    <Html position={pos} center zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
      <button
        onClick={(e) => { e.stopPropagation(); onSelect(id); }}
        style={{ pointerEvents: 'auto' }}
        className={`inline-flex items-center whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[9px] font-semibold backdrop-blur transition-colors ${
          selected ? 'border-orange-400 bg-orange-500/30 text-white' : 'border-slate-600 bg-slate-900/85 text-slate-200 hover:border-orange-400/70'
        }`}
      >
        {name}
      </button>
    </Html>
  );
}

function RobotArm({ pose, carrying, showLabels, selectedId, onSelect }) {
  const poseRef = useRef(pose);
  poseRef.current = pose;
  const base = useRef();
  const shoulder = useRef();
  const elbow = useRef();
  const wristPitch = useRef();
  const wristRoll = useRef();
  const lf = useRef();
  const rf = useRef();

  useFrame((_, dt) => {
    const p = poseRef.current;
    // Frame-rate-independent damping so the arm eases to the target pose at 60fps
    // (the pose itself only updates every sim tick), giving smooth joint motion.
    const k = 1 - Math.pow(0.00001, dt);
    const ease = (cur, tgt) => cur + (tgt - cur) * k;
    if (base.current) base.current.rotation.y = ease(base.current.rotation.y, p.base);
    if (shoulder.current) shoulder.current.rotation.x = ease(shoulder.current.rotation.x, p.shoulder);
    if (elbow.current) elbow.current.rotation.x = ease(elbow.current.rotation.x, p.elbow);
    if (wristPitch.current) wristPitch.current.rotation.x = ease(wristPitch.current.rotation.x, p.wristPitch);
    if (wristRoll.current) wristRoll.current.rotation.y = ease(wristRoll.current.rotation.y, p.wristRoll);
    // Closed (gripper 0) leaves the finger faces just outside the 0.4 block (no clipping); open spreads wider.
    const gap = 0.26 + p.gripper * 0.12;
    if (lf.current) lf.current.position.x = ease(lf.current.position.x, -gap);
    if (rf.current) rf.current.position.x = ease(rf.current.position.x, gap);
  });

  return (
    <group ref={base}>
      <mesh position={[0, 0.2, 0]} castShadow>
        <cylinderGeometry args={[0.7, 0.8, 0.4, 32]} />
        <meshStandardMaterial color="#334155" metalness={0.3} roughness={0.6} />
      </mesh>
      {showLabels && <JointLabel id="base" name="J1 Base" pos={[0, 0.2, 1]} selected={selectedId === 'base'} onSelect={onSelect} />}

      <group ref={shoulder} position={[0, SHOULDER_PIVOT_Y, 0]}>
        {showLabels && <JointLabel id="shoulder" name="J2 Shoulder" pos={[-0.95, 0.1, 0]} selected={selectedId === 'shoulder'} onSelect={onSelect} />}
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[0.35, 0.35, 0.6, 24]} /><meshStandardMaterial color="#ea580c" metalness={0.2} roughness={0.5} /></mesh>
        <mesh position={[0, UPPER_ARM / 2, 0]} castShadow><boxGeometry args={[0.32, UPPER_ARM, 0.32]} /><meshStandardMaterial color="#fb923c" metalness={0.2} roughness={0.5} /></mesh>

        <group ref={elbow} position={[0, UPPER_ARM, 0]}>
          {showLabels && <JointLabel id="elbow" name="J3 Elbow" pos={[0.95, 0, 0]} selected={selectedId === 'elbow'} onSelect={onSelect} />}
          <mesh rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[0.28, 0.28, 0.5, 24]} /><meshStandardMaterial color="#ea580c" metalness={0.2} roughness={0.5} /></mesh>
          <mesh position={[0, FOREARM / 2, 0]} castShadow><boxGeometry args={[0.26, FOREARM, 0.26]} /><meshStandardMaterial color="#fdba74" metalness={0.2} roughness={0.5} /></mesh>

          <group ref={wristPitch} position={[0, FOREARM, 0]}>
            {showLabels && <JointLabel id="wristPitch" name="J4 Wrist" pos={[0.9, 0.35, 0]} selected={selectedId === 'wristPitch'} onSelect={onSelect} />}
            <mesh rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[0.2, 0.2, 0.36, 20]} /><meshStandardMaterial color="#ea580c" metalness={0.2} roughness={0.5} /></mesh>

            <group ref={wristRoll} position={[0, WRIST_ROLL_OFFSET, 0]}>
              {showLabels && <JointLabel id="wristRoll" name="J5 Roll" pos={[-0.9, 0.35, 0]} selected={selectedId === 'wristRoll'} onSelect={onSelect} />}
              {showLabels && <JointLabel id="gripper" name="J6 Gripper" pos={[0, 0.85, 0.55]} selected={selectedId === 'gripper'} onSelect={onSelect} />}
              <mesh position={[0, 0.05, 0]} castShadow><boxGeometry args={[0.72, 0.16, 0.34]} /><meshStandardMaterial color="#475569" metalness={0.4} roughness={0.5} /></mesh>
              <mesh ref={lf} position={[-0.26, 0.3, 0]} castShadow><boxGeometry args={[0.1, 0.4, 0.28]} /><meshStandardMaterial color="#1f2937" metalness={0.5} roughness={0.4} /></mesh>
              <mesh ref={rf} position={[0.26, 0.3, 0]} castShadow><boxGeometry args={[0.1, 0.4, 0.28]} /><meshStandardMaterial color="#1f2937" metalness={0.5} roughness={0.4} /></mesh>
              {/* Held block: parented to the wrist so it stays gripped and aligned with the fingers. */}
              {carrying && (
                <mesh position={[0, 0.32, 0]} castShadow>
                  <boxGeometry args={[0.4, 0.4, 0.4]} />
                  <meshStandardMaterial color="#38bdf8" emissive="#0ea5e9" emissiveIntensity={0.9} metalness={0.2} roughness={0.5} />
                </mesh>
              )}
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}

function Stand({ pos, label, light }) {
  const h = Math.max(0.2, pos[1] - 0.2); // top meets the block's underside (block half = 0.2)
  return (
    <group position={[pos[0], 0, pos[2]]}>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow><cylinderGeometry args={[0.42, 0.5, h, 20]} /><meshStandardMaterial color={light ? '#334155' : '#8b97ab'} metalness={0.3} roughness={0.7} /></mesh>
      <Html position={[0, h + 0.2, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
        <span className="rounded-full border border-slate-600 bg-slate-900/80 px-2 py-0.5 text-[9px] font-semibold text-slate-300 backdrop-blur">{label}</span>
      </Html>
    </group>
  );
}

/** Robot base riser so the arm mounts on a real pedestal, not the bare floor. */
function Riser({ light }) {
  const darkStripe = light ? '#0f172a' : '#2b3547';
  return (
    <group>
      <mesh position={[0, 0.09, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.05, 1.2, 0.18, 40]} />
        <meshStandardMaterial color={light ? '#334155' : '#556073'} metalness={0.5} roughness={0.5} />
      </mesh>
      {/* Yellow/black hazard ring painted around the robot footprint. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[1.25, 1.55, 48]} />
        <meshStandardMaterial color="#facc15" roughness={0.8} />
      </mesh>
      {Array.from({ length: 24 }).map((_, i) => {
        const a = (i / 24) * Math.PI * 2;
        const r = 1.4;
        return (
          <mesh key={i} rotation={[-Math.PI / 2, 0, a]} position={[Math.cos(a) * r, 0.025, Math.sin(a) * r]}>
            <planeGeometry args={[0.18, 0.3]} />
            <meshStandardMaterial color={i % 2 ? darkStripe : '#facc15'} roughness={0.8} />
          </mesh>
        );
      })}
    </group>
  );
}

/** A simple guard fence on three sides, leaving the camera side open. */
function SafetyFence() {
  const S = 5.2;
  const postH = 1.6;
  const Post = ({ x, z }) => (
    <mesh position={[x, postH / 2, z]} castShadow>
      <cylinderGeometry args={[0.06, 0.06, postH, 12]} />
      <meshStandardMaterial color="#eab308" metalness={0.3} roughness={0.6} />
    </mesh>
  );
  const Rail = ({ from, to, y }) => {
    const dx = to[0] - from[0];
    const dz = to[1] - from[1];
    const len = Math.hypot(dx, dz);
    const ang = Math.atan2(dz, dx);
    return (
      <mesh position={[(from[0] + to[0]) / 2, y, (from[1] + to[1]) / 2]} rotation={[0, -ang, 0]}>
        <boxGeometry args={[len, 0.05, 0.05]} />
        <meshStandardMaterial color="#eab308" metalness={0.3} roughness={0.6} />
      </mesh>
    );
  };
  // Corners: back-left, back-right, front-left, front-right (front = +z, left open toward camera).
  const bl = [-S, -S], br = [S, -S], fl = [-S, S], fr = [S, S];
  const posts = [bl, br, fl, fr, [0, -S], [-S, 0], [S, 0]];
  return (
    <group>
      {posts.map((p, i) => <Post key={i} x={p[0]} z={p[1]} />)}
      {[0.5, 1.15].map((y) => (
        <group key={y}>
          <Rail from={bl} to={br} y={y} />
          <Rail from={bl} to={fl} y={y} />
          <Rail from={br} to={fr} y={y} />
        </group>
      ))}
    </group>
  );
}

/** Roller conveyor feeding parts into the cell; the rollers spin while running. */
function Conveyor({ running, light }) {
  const frame = light ? '#111827' : '#3c4a5e';
  const side = light ? '#334155' : '#6a778d';
  const leg = light ? '#1f2937' : '#525d70';
  const rollers = Array.from({ length: 7 });
  return (
    <group position={[-4.4, 0, 1.6]} rotation={[0, Math.PI / 2, 0]}>
      <mesh position={[0, 0.55, 0]} castShadow receiveShadow>
        <boxGeometry args={[3.4, 0.12, 1.1]} />
        <meshStandardMaterial color={frame} metalness={0.3} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.28, 0.55]}><boxGeometry args={[3.4, 0.5, 0.08]} /><meshStandardMaterial color={side} metalness={0.4} roughness={0.6} /></mesh>
      <mesh position={[0, 0.28, -0.55]}><boxGeometry args={[3.4, 0.5, 0.08]} /><meshStandardMaterial color={side} metalness={0.4} roughness={0.6} /></mesh>
      {rollers.map((_, i) => (
        <Roller key={i} x={-1.5 + i * 0.5} running={running} />
      ))}
      {/* Legs */}
      {[-1.5, 1.5].map((x) => (
        <group key={x}>
          <mesh position={[x, 0.15, 0.4]}><boxGeometry args={[0.08, 0.5, 0.08]} /><meshStandardMaterial color={leg} /></mesh>
          <mesh position={[x, 0.15, -0.4]}><boxGeometry args={[0.08, 0.5, 0.08]} /><meshStandardMaterial color={leg} /></mesh>
        </group>
      ))}
    </group>
  );
}

function Roller({ x, running }) {
  const r = useRef();
  useFrame((_, dt) => { if (running && r.current) r.current.rotation.x += dt * 4; });
  return (
    <mesh ref={r} position={[x, 0.62, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
      <cylinderGeometry args={[0.09, 0.09, 1.0, 16]} />
      <meshStandardMaterial color="#64748b" metalness={0.7} roughness={0.3} />
    </mesh>
  );
}

/** Andon stack light: green while a cycle runs, amber when idle. */
function StackLight({ running }) {
  const lamps = [
    { c: '#ef4444', on: false },
    { c: '#f59e0b', on: !running },
    { c: '#22c55e', on: running },
  ];
  return (
    <group position={[4.6, 0, -4.6]}>
      <mesh position={[0, 0.9, 0]}><cylinderGeometry args={[0.05, 0.05, 1.8, 12]} /><meshStandardMaterial color="#334155" /></mesh>
      {lamps.map((l, i) => (
        <mesh key={i} position={[0, 1.9 + i * 0.34, 0]}>
          <cylinderGeometry args={[0.16, 0.16, 0.3, 20]} />
          <meshStandardMaterial color={l.c} emissive={l.c} emissiveIntensity={l.on ? 1.4 : 0.05} roughness={0.4} transparent opacity={l.on ? 1 : 0.5} />
        </mesh>
      ))}
    </group>
  );
}

export default function RobotCellScene({ pose, objectPos, carrying, pickPos, placePos, showLabels, selectedId, onSelect, floorColor = '#111826', light = false }) {
  const running = !showLabels; // demo runs while labels are hidden
  return (
    <group>
      <ambientLight intensity={light ? 0.9 : 0.4} />
      <hemisphereLight args={['#fff2e0', light ? '#c8d3e4' : '#0a0e14', light ? 0.9 : 0.55]} />
      <directionalLight position={[6, 12, 6]} intensity={light ? 1.3 : 1.15} castShadow shadow-mapSize={[2048, 2048]}>
        <orthographicCamera attach="shadow-camera" args={[-10, 10, 10, -10, 0.1, 40]} />
      </directionalLight>
      <spotLight position={[0, 9, 3]} angle={0.5} penumbra={0.6} intensity={light ? 0.4 : 0.8} color="#fff2e0" />
      <pointLight position={[-5, 3, 4]} intensity={light ? 0.2 : 0.45} color="#38bdf8" />

      {/* Industrial floor: solid base + subtle engineering grid. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color={floorColor} metalness={0.1} roughness={0.9} />
      </mesh>
      <Grid
        position={[0, 0, 0]}
        args={[40, 40]}
        cellSize={0.6}
        cellThickness={0.6}
        cellColor={light ? '#b6c2d6' : '#1e293b'}
        sectionSize={3}
        sectionThickness={1.1}
        sectionColor={light ? '#8aa0c0' : '#334155'}
        fadeDistance={28}
        fadeStrength={1}
        infiniteGrid
      />
      <ContactShadows position={[0, 0.01, 0]} scale={16} blur={2.4} opacity={light ? 0.35 : 0.6} far={6} />

      <Riser light={light} />
      <SafetyFence />
      <Conveyor running={running} light={light} />
      <StackLight running={running} />

      <Stand pos={pickPos} label="Pick" light={light} />
      <Stand pos={placePos} label="Place" light={light} />

      {/* The block rests on a stand until the gripper picks it up (then it is drawn inside the wrist). */}
      {!carrying && (
        <mesh position={objectPos} castShadow>
          <boxGeometry args={[0.4, 0.4, 0.4]} />
          <meshStandardMaterial color="#38bdf8" emissive="#0ea5e9" emissiveIntensity={0.3} metalness={0.2} roughness={0.5} />
        </mesh>
      )}

      <RobotArm pose={pose} carrying={carrying} showLabels={showLabels} selectedId={selectedId} onSelect={onSelect} />

      <OrbitControls enablePan={false} minDistance={5} maxDistance={18} maxPolarAngle={Math.PI / 2.05} target={[0, 2, 0]} />
    </group>
  );
}
