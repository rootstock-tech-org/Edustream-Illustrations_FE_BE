/**
 * CapstoneScene.jsx
 * -----------------
 * 3D content of the Capstone tool: a factory floor of eight build pads, one per
 * pillar. An empty pad shows a faint blueprint outline; building it raises a
 * glowing machine with a light beam and a spinning ring. Adjacent built pads
 * connect with flowing data links. Pure renderer.
 */
import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls, Html, RoundedBox } from '@react-three/drei';
import { RigLights, GridFloor } from '../../components/Stage';
import { STATIONS } from './data';

function Ring({ color }) {
  const ref = useRef();
  useFrame((_, dt) => { if (ref.current) ref.current.rotation.z += dt * 0.7; });
  return (
    <mesh ref={ref} position={[0, 0.62, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[0.98, 0.03, 8, 40]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.4} toneMapped={false} />
    </mesh>
  );
}

function LightBeam({ color }) {
  const ref = useRef();
  useFrame((s) => { if (ref.current) ref.current.material.opacity = 0.1 + (Math.sin(s.clock.elapsedTime * 2) + 1) * 0.04; });
  return (
    <mesh ref={ref} position={[0, 2.2, 0]}>
      <cylinderGeometry args={[0.06, 0.34, 3.4, 16, 1, true]} />
      <meshBasicMaterial color={color} transparent opacity={0.12} side={2} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

function Station({ s, on, selected, onToggle }) {
  const [hover, setHover] = useState(false);
  const active = on;
  return (
    <group
      position={[s.pos[0], 0, s.pos[1]]}
      onClick={(e) => { e.stopPropagation(); onToggle(s.id); }}
      onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { setHover(false); document.body.style.cursor = 'default'; }}
    >
      {/* Hexagonal build pad, always visible so the factory layout reads even when empty. */}
      <mesh position={[0, 0.05, 0]} rotation={[0, Math.PI / 6, 0]}>
        <cylinderGeometry args={[0.98, 1.08, 0.1, 6]} />
        <meshStandardMaterial color={active ? '#243043' : '#161d28'} emissive={active ? s.color : '#0b1017'} emissiveIntensity={active ? 0.22 : 0.04} metalness={0.5} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.11, 0]} rotation={[0, Math.PI / 6, 0]}>
        <cylinderGeometry args={[0.82, 0.82, 0.02, 6]} />
        <meshStandardMaterial color={active ? s.color : '#2a3647'} emissive={active ? s.color : '#111a26'} emissiveIntensity={active ? 0.55 : 0.06} toneMapped={false} />
      </mesh>

      {active ? (
        <>
          <RoundedBox args={[1.15, 0.8, 1.15]} radius={0.09} smoothness={3} position={[0, 0.57, 0]} castShadow>
            <meshStandardMaterial color={s.color} emissive={s.color} emissiveIntensity={hover ? 0.85 : 0.5} metalness={0.35} roughness={0.4} />
          </RoundedBox>
          <RoundedBox args={[0.6, 0.5, 0.6]} radius={0.07} smoothness={3} position={[0, 1.2, 0]} castShadow>
            <meshStandardMaterial color={s.color} emissive={s.color} emissiveIntensity={hover ? 1 : 0.7} metalness={0.3} roughness={0.4} />
          </RoundedBox>
          <mesh position={[0, 1.68, 0]}>
            <sphereGeometry args={[0.12, 16, 16]} />
            <meshStandardMaterial color="#ffffff" emissive={s.color} emissiveIntensity={2.2} toneMapped={false} />
          </mesh>
          <Ring color={s.color} />
          <LightBeam color={s.color} />
        </>
      ) : (
        <mesh position={[0, 0.55, 0]}>
          <boxGeometry args={[1.05, 0.85, 1.05]} />
          <meshBasicMaterial color="#3f4c60" wireframe transparent opacity={hover ? 0.65 : 0.32} />
        </mesh>
      )}

      <Html position={[0, active ? 2.05 : 1.1, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(s.id); }}
          style={{ pointerEvents: 'auto' }}
          className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold backdrop-blur transition-colors ${
            selected ? 'border-cyan-400 bg-cyan-500/25 text-white' : active ? 'border-slate-500 bg-slate-900/85 text-slate-100' : 'border-slate-700 bg-slate-900/70 text-slate-400 hover:border-cyan-400/60'
          }`}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: active ? s.color : '#475569' }} /> {s.name}
        </button>
      </Html>
    </group>
  );
}

function FlowDot({ a, b }) {
  const ref = useRef();
  const p = useRef(Math.random());
  useFrame((_, dt) => {
    if (!ref.current) return;
    p.current = (p.current + dt * 0.45) % 1;
    ref.current.position.set(a[0] + (b[0] - a[0]) * p.current, 0.62, a[1] + (b[1] - a[1]) * p.current);
  });
  return <mesh ref={ref}><sphereGeometry args={[0.1, 12, 12]} /><meshStandardMaterial color="#a5f3fc" emissive="#22d3ee" emissiveIntensity={1.8} toneMapped={false} /></mesh>;
}

function Link({ a, b }) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.hypot(dx, dz);
  const mid = [(a[0] + b[0]) / 2, 0.62, (a[1] + b[1]) / 2];
  const rot = Math.atan2(dx, dz);
  return (
    <mesh position={mid} rotation={[Math.PI / 2, 0, rot]}>
      <cylinderGeometry args={[0.05, 0.05, len, 10]} />
      <meshStandardMaterial color="#0e7490" emissive="#22d3ee" emissiveIntensity={0.7} transparent opacity={0.7} toneMapped={false} />
    </mesh>
  );
}

export default function CapstoneScene({ enabled, selectedId, onToggle, floorColor = '#111826', light = false }) {
  const links = useMemo(() => {
    const out = [];
    for (let i = 0; i < STATIONS.length - 1; i++) {
      if (enabled[STATIONS[i].id] && enabled[STATIONS[i + 1].id]) out.push({ a: STATIONS[i].pos, b: STATIONS[i + 1].pos, key: i });
    }
    return out;
  }, [enabled]);

  return (
    <group>
      <RigLights light={light} />
      <pointLight position={[0, 5, 0]} intensity={light ? 0.2 : 0.5} color="#22d3ee" />

      {/* Raised factory platform. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
        <planeGeometry args={[26, 16]} />
        <meshStandardMaterial color={floorColor} metalness={0.2} roughness={0.85} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[13.5, 7.2]} />
        <meshStandardMaterial color={light ? '#d3ddec' : '#0d1420'} emissive="#22d3ee" emissiveIntensity={light ? 0.02 : 0.06} metalness={0.3} roughness={0.7} transparent opacity={0.6} />
      </mesh>
      <GridFloor light={light} plane={false} y={0.02} contactScale={14} />

      {links.map((l) => <Link key={l.key} a={l.a} b={l.b} />)}
      {links.map((l) => <FlowDot key={`d${l.key}`} a={l.a} b={l.b} />)}
      {STATIONS.map((s) => <Station key={s.id} s={s} on={!!enabled[s.id]} selected={selectedId === s.id} onToggle={onToggle} />)}

      <OrbitControls enablePan={false} minDistance={7} maxDistance={20} maxPolarAngle={Math.PI / 2.1} target={[0, 0.6, 0]} />
    </group>
  );
}
