/**
 * TwinScene.jsx
 * -------------
 * 3D content of the Digital Twin tool: a solid industrial motor (the physical
 * asset) on a steel base, and its glowing holographic twin on a digital dais
 * with a scanning ring. Both spin, but the twin follows the last synced speed,
 * so a low sync rate makes it lag and turn amber. A data beam carries syncs.
 */
import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import { RigLights, GridFloor } from '../../components/Stage';

function Label({ id, name, pos, color, selected, onSelect }) {
  return (
    <Html position={pos} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
      <button
        onClick={(e) => { e.stopPropagation(); onSelect(id); }}
        style={{ pointerEvents: 'auto' }}
        className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold backdrop-blur transition-colors ${
          selected ? 'border-indigo-400 bg-indigo-500/30 text-white' : 'border-slate-600 bg-slate-900/85 text-slate-200 hover:border-indigo-400/70'
        }`}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} /> {name}
      </button>
    </Html>
  );
}

/** Shared motor body geometry (solid for physical, wireframe for the twin). */
function MotorBody({ rotorRef, speedRef, wire, color, glow }) {
  useFrame((_, dt) => { if (rotorRef.current) rotorRef.current.rotation.x += speedRef.current * dt; });
  const mat = (extra = {}) => ({ color, emissive: color, emissiveIntensity: glow, metalness: wire ? 0.1 : 0.6, roughness: 0.4, wireframe: wire, transparent: wire, opacity: wire ? 0.55 : 1, ...extra });
  return (
    <group>
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[0.55, 0.55, 1.5, 28]} /><meshStandardMaterial {...mat()} /></mesh>
      {/* cooling fins */}
      {[-0.45, -0.2, 0.05, 0.3].map((x) => (
        <mesh key={x} position={[x, 0, 0]} rotation={[0, 0, Math.PI / 2]}><torusGeometry args={[0.57, 0.03, 8, 24]} /><meshStandardMaterial {...mat({ emissiveIntensity: glow * 0.8 })} /></mesh>
      ))}
      {/* shaft + rotor */}
      <mesh position={[0.9, 0, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.09, 0.09, 0.6, 12]} /><meshStandardMaterial {...mat()} /></mesh>
      <mesh ref={rotorRef} position={[1.15, 0, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.34, 0.34, 0.14, 8]} /><meshStandardMaterial {...mat({ emissiveIntensity: wire ? glow : 0 })} /></mesh>
    </group>
  );
}

function PhysicalMachine({ x, speedRef, selected, onSelect }) {
  const [hover, setHover] = useState(false);
  const rotor = useRef();
  return (
    <group position={[x, 0.95, 0]}
      onClick={(e) => { e.stopPropagation(); onSelect('physical'); }}
      onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { setHover(false); document.body.style.cursor = 'default'; }}
    >
      {/* steel base */}
      <mesh position={[0, -0.85, 0]}><boxGeometry args={[2, 0.35, 1.4]} /><meshStandardMaterial color="#334155" metalness={0.5} roughness={0.6} /></mesh>
      <mesh position={[0, -0.5, 0]}><boxGeometry args={[0.5, 0.4, 0.5]} /><meshStandardMaterial color="#475569" metalness={0.5} roughness={0.5} /></mesh>
      <MotorBody rotorRef={rotor} speedRef={speedRef} wire={false} color={hover || selected ? '#94a3b8' : '#64748b'} glow={hover || selected ? 0.25 : 0.1} />
    </group>
  );
}

function ScanRing() {
  const ref = useRef();
  useFrame((state) => {
    if (!ref.current) return;
    const t = (state.clock.elapsedTime % 2) / 2; // 0..1 sweep
    ref.current.position.x = -0.85 + t * 1.7;
    ref.current.material.opacity = 0.15 + Math.sin(t * Math.PI) * 0.55;
  });
  return (
    <mesh ref={ref} rotation={[0, 0, Math.PI / 2]}>
      <torusGeometry args={[0.62, 0.02, 8, 32]} />
      <meshStandardMaterial color="#a5b4fc" emissive="#818cf8" emissiveIntensity={2} transparent opacity={0.5} toneMapped={false} />
    </mesh>
  );
}

function TwinMachine({ x, speedRef, color, selected, onSelect }) {
  const [hover, setHover] = useState(false);
  const rotor = useRef();
  const daisRef = useRef();
  useFrame((state) => { if (daisRef.current) daisRef.current.rotation.y = state.clock.elapsedTime * 0.4; });
  return (
    <group position={[x, 0.95, 0]}
      onClick={(e) => { e.stopPropagation(); onSelect('twin'); }}
      onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { setHover(false); document.body.style.cursor = 'default'; }}
    >
      {/* holographic dais */}
      <mesh position={[0, -0.85, 0]}><cylinderGeometry args={[1.15, 1.25, 0.12, 6]} /><meshStandardMaterial color="#312e81" emissive="#4338ca" emissiveIntensity={0.5} transparent opacity={0.55} metalness={0.3} roughness={0.4} /></mesh>
      <mesh ref={daisRef} position={[0, -0.77, 0]}><torusGeometry args={[1.05, 0.03, 8, 6]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.6} toneMapped={false} /></mesh>
      {/* projection beam base */}
      <mesh position={[0, -0.4, 0]}><cylinderGeometry args={[0.05, 1.0, 0.7, 16, 1, true]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} transparent opacity={0.12} side={2} toneMapped={false} /></mesh>

      <MotorBody rotorRef={rotor} speedRef={speedRef} wire color={hover || selected ? '#a5b4fc' : color} glow={hover || selected ? 0.9 : 0.6} />
      <ScanRing />
    </group>
  );
}

// Data packets streaming physical -> twin; more/faster with a higher sync rate.
function SyncBeam({ from, to, syncRate }) {
  const COUNT = 6;
  const refs = useRef([]);
  const st = useRef(Array.from({ length: COUNT }, (_, i) => ({ p: i / COUNT })));
  useFrame((_, dt) => {
    const speed = 0.22 + syncRate * 0.08;
    const visible = Math.max(1, Math.min(COUNT, Math.round(syncRate)));
    for (let i = 0; i < COUNT; i++) {
      const m = refs.current[i];
      if (!m) continue;
      const s = st.current[i];
      s.p = (s.p + dt * speed) % 1;
      m.visible = i < visible;
      m.position.set(from[0] + (to[0] - from[0]) * s.p, from[1] + Math.sin(s.p * Math.PI) * 0.12, from[2]);
      m.scale.setScalar(0.7 + Math.sin(s.p * Math.PI) * 0.5);
    }
  });
  return Array.from({ length: COUNT }, (_, i) => (
    <mesh key={i} ref={(el) => (refs.current[i] = el)} rotation={[0, 0, Math.PI / 4]}>
      <octahedronGeometry args={[0.12, 0]} />
      <meshStandardMaterial color="#c7d2fe" emissive="#818cf8" emissiveIntensity={1.8} toneMapped={false} />
    </mesh>
  ));
}

export default function TwinScene({ physicalSpeed, twinSpeed, syncRate, diverged, selectedId, onSelect, floorColor = '#111826', light = false }) {
  const pRef = useRef(physicalSpeed);
  pRef.current = physicalSpeed;
  const tRef = useRef(twinSpeed);
  tRef.current = twinSpeed;
  const twinColor = diverged ? '#fbbf24' : '#818cf8';

  return (
    <group>
      <RigLights light={light} />
      <pointLight position={[2.6, 1.6, 1.5]} intensity={light ? 0.3 : 0.7} color="#818cf8" />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
        <planeGeometry args={[26, 18]} />
        <meshStandardMaterial color={floorColor} />
      </mesh>
      <GridFloor light={light} plane={false} y={-0.03} contactScale={13} />

      <PhysicalMachine x={-2.6} speedRef={pRef} selected={selectedId === 'physical'} onSelect={onSelect} />
      <TwinMachine x={2.6} speedRef={tRef} color={twinColor} selected={selectedId === 'twin'} onSelect={onSelect} />
      <SyncBeam from={[-1.3, 0.95, 0]} to={[1.3, 0.95, 0]} syncRate={syncRate} />

      <Label id="physical" name="Physical asset" pos={[-2.6, 2, 0]} color="#94a3b8" selected={selectedId === 'physical'} onSelect={onSelect} />
      <Label id="twin" name="Digital twin" pos={[2.6, 2, 0]} color={twinColor} selected={selectedId === 'twin'} onSelect={onSelect} />
      <Label id="link" name="Sync link" pos={[0, 1.55, 0]} color="#a5b4fc" selected={selectedId === 'link'} onSelect={onSelect} />

      <OrbitControls enablePan={false} minDistance={5} maxDistance={16} maxPolarAngle={Math.PI / 2.05} target={[0, 1, 0]} />
    </group>
  );
}
