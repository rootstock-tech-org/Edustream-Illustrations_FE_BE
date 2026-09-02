/**
 * NetworkScene.jsx
 * ----------------
 * 3D content of the Communication tool: an MQTT publish/subscribe network.
 * Publishers stream packets to a central broker, which fans them out to the
 * subscribers. Publish rate speeds the packets; packet loss drops some in red.
 * Pure renderer. Reads rate/dropPct/selectedId, reports clicks via onSelect.
 */
import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import { RigLights, GridFloor } from '../../components/Stage';
import * as THREE from 'three';
import { NODES } from './data';

const ROLE_COLOR = { publisher: '#38bdf8', broker: '#fbbf24', subscriber: '#34d399' };
const UP = new THREE.Vector3(0, 1, 0);

function linkTransform(a, b) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const dir = new THREE.Vector3().subVectors(vb, va);
  const len = dir.length();
  const mid = new THREE.Vector3().addVectors(va, vb).multiplyScalar(0.5);
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize());
  return { mid: [mid.x, mid.y, mid.z], len, quat: [q.x, q.y, q.z, q.w] };
}

function NodeMarker({ node, selected, onSelect }) {
  const [hovered, setHovered] = useState(false);
  const active = selected || hovered;
  const color = ROLE_COLOR[node.role] ?? '#38bdf8';
  const isBroker = node.role === 'broker';
  return (
    <group position={node.pos}>
      <mesh
        onClick={(e) => { e.stopPropagation(); onSelect(node.id); }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = 'default'; }}
      >
        {isBroker ? <boxGeometry args={[0.72, 0.72, 0.72]} /> : <sphereGeometry args={[0.27, 20, 20]} />}
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={active ? 1.2 : 0.5} metalness={0.3} roughness={0.4} />
      </mesh>
      <Html position={[0, isBroker ? 0.72 : 0.52, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
        <button
          onClick={(e) => { e.stopPropagation(); onSelect(node.id); }}
          style={{ pointerEvents: 'auto' }}
          className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold backdrop-blur transition-colors ${
            selected ? 'border-brand-400 bg-brand-500/25 text-brand-100' : 'border-slate-600 bg-slate-900/85 text-slate-200 hover:border-brand-400/70'
          }`}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
          {node.name}
        </button>
      </Html>
    </group>
  );
}

// Directional data darts streaming along each link: arrowhead + tail streak,
// oriented toward the destination. Lost packets flash red and fall away.
function Packets({ links, rate, dropPct, onEvent }) {
  const COUNT = 3;
  const items = useMemo(
    () => links.flatMap((l, li) => Array.from({ length: COUNT }, (_, i) => ({ a: l.a, b: l.b, quat: l.quat, kind: l.kind, phase: (i + li * 0.33) / COUNT }))),
    [links],
  );
  const refs = useRef([]);
  const st = useRef([]);
  if (st.current.length !== items.length) st.current = items.map((it) => ({ p: it.phase, lost: false, reported: false }));

  useFrame((state, delta) => {
    const speed = 0.16 + rate * 0.05;
    for (let i = 0; i < items.length; i++) {
      const g = refs.current[i];
      if (!g) continue;
      const s = st.current[i];
      const it = items[i];
      s.p += delta * speed;
      // Report the moment a lost dart drops, and each successful arrival.
      if (s.lost && !s.reported && s.p > 0.62) { onEvent?.('lost'); s.reported = true; }
      if (s.p >= 1) {
        s.p -= 1;
        if (!s.lost && it.kind === 'sub') onEvent?.('delivered');
        s.lost = Math.random() < dropPct / 100;
        s.reported = false;
      }
      const dropped = s.lost && s.p > 0.62;
      const t = s.lost ? Math.min(s.p, 0.62) : s.p;
      const fall = dropped ? (s.p - 0.62) * 2.2 : 0; // lost darts drop away
      g.position.set(
        it.a[0] + (it.b[0] - it.a[0]) * t,
        it.a[1] + (it.b[1] - it.a[1]) * t - fall,
        it.a[2] + (it.b[2] - it.a[2]) * t,
      );
      g.visible = !dropped || s.p < 0.86;
      g.scale.setScalar(0.9 + Math.sin(s.p * Math.PI) * 0.18);
      const head = s.lost ? '#fca5a5' : '#7dd3fc';
      const emis = s.lost ? '#ef4444' : '#22d3ee';
      for (const c of g.children) {
        if (!c.material) continue;
        c.material.color.set(head);
        c.material.emissive.set(emis);
      }
    }
  });

  return items.map((it, i) => (
    <group key={i} ref={(el) => (refs.current[i] = el)} quaternion={it.quat}>
      {/* arrowhead */}
      <mesh position={[0, 0.2, 0]}>
        <coneGeometry args={[0.16, 0.42, 18]} />
        <meshStandardMaterial color="#7dd3fc" emissive="#22d3ee" emissiveIntensity={1.9} toneMapped={false} />
      </mesh>
      {/* shaft */}
      <mesh position={[0, -0.06, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 0.32, 14]} />
        <meshStandardMaterial color="#38bdf8" emissive="#0ea5e9" emissiveIntensity={1.3} toneMapped={false} />
      </mesh>
      {/* comet tail */}
      <mesh position={[0, -0.46, 0]}>
        <coneGeometry args={[0.08, 0.56, 14]} />
        <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.7} transparent opacity={0.32} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  ));
}

export default function NetworkScene({ rate, dropPct, selectedId, onSelect, onEvent, floorColor = '#111826', light = false }) {
  const broker = NODES.find((n) => n.role === 'broker');
  const linkData = useMemo(
    () =>
      NODES.filter((n) => n.role !== 'broker').map((n) => {
        const isPub = n.role === 'publisher';
        const a = isPub ? n.pos : broker.pos;
        const b = isPub ? broker.pos : n.pos;
        return { a, b, kind: isPub ? 'pub' : 'sub', ...linkTransform(a, b) };
      }),
    [broker],
  );

  return (
    <group>
      <RigLights light={light} />

      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.4, 0]} receiveShadow>
        <planeGeometry args={[26, 26]} />
        <meshStandardMaterial color={floorColor} />
      </mesh>
      <GridFloor light={light} plane={false} y={-0.38} contactScale={13} />

      {/* Broker pedestal */}
      <mesh position={[0, 0.4, 0]}>
        <cylinderGeometry args={[0.5, 0.65, 1.4, 24]} />
        <meshStandardMaterial color="#1e293b" metalness={0.3} roughness={0.6} />
      </mesh>

      {/* Links */}
      {linkData.map((l, i) => (
        <mesh key={i} position={l.mid} quaternion={l.quat}>
          <cylinderGeometry args={[0.02, 0.02, l.len, 8]} />
          <meshStandardMaterial color="#334155" emissive="#0e7490" emissiveIntensity={0.3} transparent opacity={0.6} />
        </mesh>
      ))}

      <Packets links={linkData} rate={rate} dropPct={dropPct} onEvent={onEvent} />

      {NODES.map((n) => (
        <NodeMarker key={n.id} node={n} selected={selectedId === n.id} onSelect={onSelect} />
      ))}

      <OrbitControls enablePan={false} minDistance={5} maxDistance={16} maxPolarAngle={Math.PI / 2.05} target={[0, 0.6, 0]} />
    </group>
  );
}
