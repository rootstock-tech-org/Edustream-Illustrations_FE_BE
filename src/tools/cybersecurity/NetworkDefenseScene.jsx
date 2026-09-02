/**
 * NetworkDefenseScene.jsx
 * -----------------------
 * 3D content of the Cybersecurity tool: the Purdue zones from the enterprise
 * (left) inward to the process/PLC (right), separated by energy-shield defence
 * walls that glow when active. A red attack dart drives inward and is stopped
 * at the first active shield, or breaches the PLC it is trying to reach. Pure
 * renderer.
 */
import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls, Html, RoundedBox } from '@react-three/drei';
import { RigLights, GridFloor } from '../../components/Stage';
import { ZONES, DEFENSES } from './data';

const ZONE_COLOR = {
  enterprise: '#64748b',
  dmz: '#f59e0b',
  supervisory: '#38bdf8',
  control: '#a78bfa',
  process: '#34d399',
};

/** The protected asset in the process zone: a PLC cabinet with a blinking lamp. */
function PlcAsset({ color, breached }) {
  const lamp = useRef();
  useFrame((s) => {
    if (!lamp.current) return;
    lamp.current.material.emissiveIntensity = 0.5 + (Math.sin(s.clock.elapsedTime * (breached ? 12 : 4)) + 1) * 0.5;
  });
  const c = breached ? '#f87171' : color;
  return (
    <group position={[0, 0.55, 0]}>
      <RoundedBox args={[0.55, 0.8, 0.42]} radius={0.05} smoothness={3} castShadow>
        <meshStandardMaterial color="#0f5f57" emissive={c} emissiveIntensity={0.25} metalness={0.5} roughness={0.4} />
      </RoundedBox>
      <mesh ref={lamp} position={[0, 0.28, 0.22]}>
        <boxGeometry args={[0.32, 0.07, 0.02]} />
        <meshStandardMaterial color={c} emissive={c} emissiveIntensity={1} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.1, 0.22]}><boxGeometry args={[0.32, 0.04, 0.02]} /><meshStandardMaterial color="#083b36" /></mesh>
    </group>
  );
}

function ZoneSlab({ zone, selected, onSelect, isProcess, breached }) {
  const [hover, setHover] = useState(false);
  const color = ZONE_COLOR[zone.id] ?? '#38bdf8';
  const active = selected || hover;
  return (
    <group
      position={[zone.pos, 0, 0]}
      onClick={(e) => { e.stopPropagation(); onSelect(zone.id); }}
      onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { setHover(false); document.body.style.cursor = 'default'; }}
    >
      {/* Floor pad */}
      <mesh position={[0, 0.04, 0]}>
        <boxGeometry args={[1.6, 0.12, 2.1]} />
        <meshStandardMaterial color="#141d29" emissive={color} emissiveIntensity={active ? 0.25 : 0.08} metalness={0.4} roughness={0.6} />
      </mesh>
      {/* Translucent zone volume (visual only, does not capture clicks). */}
      <mesh position={[0, 0.85, 0]} raycast={() => null}>
        <boxGeometry args={[1.4, 1.5, 1.9]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={active ? 0.5 : 0.2} metalness={0.3} roughness={0.5} transparent opacity={0.26} />
      </mesh>
      {/* Inner asset: PLC in the process zone, a generic node elsewhere */}
      {isProcess ? (
        <PlcAsset color={color} breached={breached} />
      ) : (
        <RoundedBox args={[0.5, 0.6, 0.5]} radius={0.05} smoothness={3} position={[0, 0.5, 0]} castShadow>
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={active ? 0.65 : 0.3} metalness={0.4} roughness={0.4} />
        </RoundedBox>
      )}

      <Html position={[0, 1.75, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
        <button
          onClick={(e) => { e.stopPropagation(); onSelect(zone.id); }}
          style={{ pointerEvents: 'auto' }}
          className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold backdrop-blur transition-colors ${
            selected ? 'border-teal-400 bg-teal-500/25 text-white' : 'border-slate-600 bg-slate-900/85 text-slate-200 hover:border-teal-400/70'
          }`}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} /> {zone.name}
        </button>
      </Html>
    </group>
  );
}

/** An energy-shield wall between two zones: glows and pulses when active, clickable for info. */
function DefenseWall({ id, x, on, name, selected, onSelect }) {
  const shield = useRef();
  const [hover, setHover] = useState(false);
  useFrame((s) => {
    if (shield.current && on) shield.current.material.emissiveIntensity = 0.7 + (Math.sin(s.clock.elapsedTime * 3) + 1) * 0.3;
  });
  const active = selected || hover;
  const railColor = on ? '#5eead4' : active ? '#94a3b8' : '#475569';
  return (
    <group
      position={[x, 0.65, 0]}
      onClick={(e) => { e.stopPropagation(); onSelect(id); }}
      onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { setHover(false); document.body.style.cursor = 'default'; }}
    >
      {/* Wider invisible hit box so the thin shield is easy to click. */}
      <mesh>
        <boxGeometry args={[0.5, 2.0, 2.4]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh ref={shield}>
        <boxGeometry args={[0.07, 2.0, 2.4]} />
        <meshStandardMaterial color={on ? '#2dd4bf' : '#334155'} emissive={on ? '#14b8a6' : active ? '#334155' : '#000'} emissiveIntensity={on ? 1 : active ? 0.4 : 0} transparent opacity={on ? 0.5 : active ? 0.3 : 0.16} toneMapped={false} />
      </mesh>
      {/* frame rails top and bottom */}
      {[1.02, -1.02].map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <boxGeometry args={[0.14, 0.14, 2.5]} />
          <meshStandardMaterial color={railColor} emissive={on ? '#2dd4bf' : '#000'} emissiveIntensity={on ? 0.8 : 0} metalness={0.5} roughness={0.4} />
        </mesh>
      ))}
      {active && (
        <Html position={[0, 1.35, 0]} center zIndexRange={[25, 0]} style={{ pointerEvents: 'none' }}>
          <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[9px] font-semibold backdrop-blur ${on ? 'border-teal-400 bg-teal-500/25 text-teal-100' : 'border-slate-600 bg-slate-900/85 text-slate-300'}`}>{name} {on ? '· on' : '· off'}</span>
        </Html>
      )}
    </group>
  );
}

function Attack({ targetX, breached, launchKey }) {
  const ref = useRef();
  const trail = useRef();
  const state = useRef({ x: -6.6, key: -1, done: false });
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const s = state.current;
    if (s.key !== launchKey) { s.key = launchKey; s.x = -6.6; s.done = false; }
    if (!s.done) {
      s.x += 0.07;
      if (s.x >= targetX) { s.x = targetX; s.done = true; }
    }
    m.position.x = s.x;
    const blocked = s.done && !breached;
    const flash = s.done ? 1.4 + Math.sin(performance.now() / 120) * 0.5 : 1.7;
    m.material.emissiveIntensity = flash;
    m.material.color.set(blocked ? '#34d399' : '#f87171');
    m.material.emissive.set(blocked ? '#10b981' : '#ef4444');
    if (trail.current) {
      trail.current.position.x = s.x - 0.5;
      trail.current.material.opacity = s.done ? 0 : 0.35;
    }
  });
  return (
    <group>
      <mesh ref={trail} position={[-6.6, 0.9, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[0.1, 0.9, 12]} />
        <meshBasicMaterial color="#ef4444" transparent opacity={0.35} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={ref} position={[-6.6, 0.9, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[0.2, 0.6, 18]} />
        <meshStandardMaterial color="#f87171" emissive="#ef4444" emissiveIntensity={1.7} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Pulsing red attacker origin (the internet threat), clickable for info. */
function Attacker({ selected, onSelect }) {
  const ref = useRef();
  const [hover, setHover] = useState(false);
  useFrame((s) => { if (ref.current) ref.current.scale.setScalar(1 + Math.sin(s.clock.elapsedTime * 3) * 0.12); });
  const active = selected || hover;
  return (
    <group
      position={[-6.6, 0.9, 0]}
      onClick={(e) => { e.stopPropagation(); onSelect('attacker'); }}
      onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { setHover(false); document.body.style.cursor = 'default'; }}
    >
      {/* Larger invisible hit sphere so the attacker is easy to click. */}
      <mesh>
        <sphereGeometry args={[0.6, 12, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh ref={ref}><icosahedronGeometry args={[0.3, 0]} /><meshStandardMaterial color="#ef4444" emissive={active ? '#f87171' : '#b91c1c'} emissiveIntensity={active ? 1.3 : 0.9} metalness={0.3} roughness={0.4} toneMapped={false} /></mesh>
      <Html position={[0, 0.7, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
        <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold backdrop-blur ${active ? 'border-rose-400 bg-rose-500/30 text-white' : 'border-rose-500/60 bg-rose-950/70 text-rose-200'}`}>Attacker</span>
      </Html>
    </group>
  );
}

export default function NetworkDefenseScene({ defenseOn, reached, breached, launchKey, selectedId, onSelect, floorColor = '#111826', light = false }) {
  const reachedZone = ZONES.find((z) => z.id === reached) ?? ZONES[ZONES.length - 1];
  const targetX = breached ? reachedZone.pos + 0.2 : reachedZone.pos - 1.05;

  const walls = useMemo(
    () => DEFENSES.map((d) => ({ id: d.id, name: d.name, x: (ZONES.find((z) => z.id === d.guards)?.pos ?? 0) - 1.05, on: !!defenseOn[d.id] })),
    [defenseOn],
  );

  return (
    <group>
      <RigLights light={light} />
      <pointLight position={[4.4, 3, 2]} intensity={light ? 0.2 : 0.5} color="#34d399" />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
        <planeGeometry args={[40, 20]} />
        <meshStandardMaterial color={floorColor} metalness={0.2} roughness={0.85} />
      </mesh>
      <GridFloor light={light} plane={false} y={0.02} contactScale={20} />

      {walls.map((w) => <DefenseWall key={w.id} id={`wall:${w.id}`} name={w.name} x={w.x} on={w.on} selected={selectedId === `wall:${w.id}`} onSelect={onSelect} />)}
      {ZONES.map((z) => <ZoneSlab key={z.id} zone={z} selected={selectedId === z.id} onSelect={onSelect} isProcess={z.id === 'process'} breached={breached} />)}

      <Attacker selected={selectedId === 'attacker'} onSelect={onSelect} />
      <Attack targetX={targetX} breached={breached} launchKey={launchKey} />

      <OrbitControls enablePan={false} minDistance={7} maxDistance={20} maxPolarAngle={Math.PI / 2.05} target={[0, 0.6, 0]} />
    </group>
  );
}
