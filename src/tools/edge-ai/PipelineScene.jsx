/**
 * PipelineScene.jsx
 * -----------------
 * 3D content of the Edge AI tool: a smart camera streams frames to an edge
 * device and/or a cloud datacenter. Where inference runs (edge / cloud / hybrid)
 * changes which node "thinks" (a spinning ring + glow) and how much data flows
 * edge -> cloud. Pure renderer: reads placement/model/fps, reports clicks.
 */
import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import { RigLights, GridFloor } from '../../components/Stage';
import * as THREE from 'three';
import { NODES, PLACEMENT_LOAD } from './data';

const ROLE_COLOR = { source: '#38bdf8', edge: '#a78bfa', cloud: '#f0abfc' };
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

// A stream of arrow "data" darts flowing a -> b. Count/scale encode volume.
function Stream({ a, b, quat, count, speed, scale }) {
  const items = useMemo(() => Array.from({ length: count }, (_, i) => ({ phase: i / count })), [count]);
  const refs = useRef([]);
  const st = useRef([]);
  if (st.current.length !== items.length) st.current = items.map((it) => ({ p: it.phase }));

  useFrame((_, delta) => {
    for (let i = 0; i < items.length; i++) {
      const g = refs.current[i];
      if (!g) continue;
      const s = st.current[i];
      s.p = (s.p + delta * speed) % 1;
      g.position.set(a[0] + (b[0] - a[0]) * s.p, a[1] + (b[1] - a[1]) * s.p, a[2] + (b[2] - a[2]) * s.p);
      g.scale.setScalar(scale * (0.85 + Math.sin(s.p * Math.PI) * 0.2));
    }
  });

  return items.map((_, i) => (
    <group key={i} ref={(el) => (refs.current[i] = el)} quaternion={quat}>
      <mesh position={[0, 0.11, 0]}>
        <coneGeometry args={[0.12, 0.3, 14]} />
        <meshStandardMaterial color="#c4b5fd" emissive="#8b5cf6" emissiveIntensity={1.8} toneMapped={false} />
      </mesh>
      <mesh position={[0, -0.05, 0]}>
        <cylinderGeometry args={[0.045, 0.045, 0.24, 10]} />
        <meshStandardMaterial color="#a78bfa" emissive="#7c3aed" emissiveIntensity={1.2} toneMapped={false} />
      </mesh>
    </group>
  ));
}

// A spinning halo that shows a node is running inference.
function ProcessingRing({ active }) {
  const ref = useRef();
  useFrame((_, delta) => {
    if (!ref.current) return;
    ref.current.rotation.z += delta * 2.4;
    const s = 1 + Math.sin(performance.now() / 220) * 0.06;
    ref.current.scale.setScalar(active ? s : 0.001);
  });
  return (
    <mesh ref={ref} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
      <torusGeometry args={[0.85, 0.05, 8, 40]} />
      <meshStandardMaterial color="#a78bfa" emissive="#a78bfa" emissiveIntensity={2} toneMapped={false} />
    </mesh>
  );
}

function NodeMarker({ node, selected, computing, onSelect }) {
  const [hovered, setHovered] = useState(false);
  const active = selected || hovered;
  const color = ROLE_COLOR[node.role] ?? '#a78bfa';
  return (
    <group position={node.pos}>
      <ProcessingRing active={computing} />
      <mesh
        onClick={(e) => { e.stopPropagation(); onSelect(node.id); }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = 'default'; }}
      >
        {node.role === 'source' && <boxGeometry args={[0.66, 0.5, 0.5]} />}
        {node.role === 'edge' && <boxGeometry args={[0.62, 0.62, 0.62]} />}
        {node.role === 'cloud' && <boxGeometry args={[1.15, 0.7, 0.7]} />}
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={computing ? 1.1 : active ? 0.7 : 0.35} metalness={0.35} roughness={0.4} />
      </mesh>
      {/* camera lens */}
      {node.role === 'source' && (
        <mesh position={[0.42, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <cylinderGeometry args={[0.14, 0.2, 0.24, 20]} />
          <meshStandardMaterial color="#0ea5e9" emissive="#0ea5e9" emissiveIntensity={0.6} />
        </mesh>
      )}
      {/* cloud server slots */}
      {node.role === 'cloud' && [0.18, 0, -0.18].map((y) => (
        <mesh key={y} position={[0, y, 0.36]}>
          <boxGeometry args={[1, 0.08, 0.02]} />
          <meshStandardMaterial color="#f5d0fe" emissive="#e879f9" emissiveIntensity={0.5} />
        </mesh>
      ))}
      <Html position={[0, node.role === 'cloud' ? 0.72 : 0.6, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
        <button
          onClick={(e) => { e.stopPropagation(); onSelect(node.id); }}
          style={{ pointerEvents: 'auto' }}
          className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold backdrop-blur transition-colors ${
            selected ? 'border-violet-400 bg-violet-500/25 text-violet-100' : 'border-slate-600 bg-slate-900/85 text-slate-200 hover:border-violet-400/70'
          }`}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
          {node.name}
        </button>
      </Html>
    </group>
  );
}

export default function PipelineScene({ placement, fps, selectedId, onSelect, floorColor = '#111826', light = false }) {
  const camera = NODES.find((n) => n.role === 'source');
  const edge = NODES.find((n) => n.role === 'edge');
  const cloud = NODES.find((n) => n.role === 'cloud');

  const camEdge = useMemo(() => linkTransform(camera.pos, edge.pos), [camera, edge]);
  const edgeCloud = useMemo(() => linkTransform(edge.pos, cloud.pos), [edge, cloud]);

  const edgeComputes = placement === 'edge' || placement === 'hybrid';
  const cloudComputes = placement === 'cloud' || placement === 'hybrid';
  const load = PLACEMENT_LOAD[placement] ?? 0.4;
  const speed = 0.25 + fps * 0.03;

  return (
    <group>
      <RigLights light={light} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.4, 0]} receiveShadow>
        <planeGeometry args={[30, 30]} />
        <meshStandardMaterial color={floorColor} />
      </mesh>
      <GridFloor light={light} plane={false} y={-0.38} contactScale={15} />

      {/* Pedestals */}
      {[camera, edge, cloud].map((n) => (
        <mesh key={n.id} position={[n.pos[0], -0.05, n.pos[2]]}>
          <cylinderGeometry args={[n.role === 'cloud' ? 0.8 : 0.55, n.role === 'cloud' ? 0.95 : 0.66, 0.7, 24]} />
          <meshStandardMaterial color="#1e293b" metalness={0.3} roughness={0.6} />
        </mesh>
      ))}

      {/* Links */}
      {[camEdge, edgeCloud].map((l, i) => (
        <mesh key={i} position={l.mid} quaternion={l.quat}>
          <cylinderGeometry args={[0.02, 0.02, l.len, 8]} />
          <meshStandardMaterial color="#334155" emissive="#7c3aed" emissiveIntensity={0.25} transparent opacity={0.55} />
        </mesh>
      ))}

      {/* Camera always feeds the edge; edge -> cloud volume depends on placement */}
      <Stream a={camera.pos} b={edge.pos} quat={camEdge.quat} count={3} speed={speed} scale={1} />
      <Stream a={edge.pos} b={cloud.pos} quat={edgeCloud.quat} count={Math.max(1, Math.round(load * 5))} speed={speed} scale={0.5 + load} />

      {NODES.map((n) => (
        <NodeMarker
          key={n.id}
          node={n}
          selected={selectedId === n.id}
          computing={(n.role === 'edge' && edgeComputes) || (n.role === 'cloud' && cloudComputes)}
          onSelect={onSelect}
        />
      ))}

      <OrbitControls enablePan={false} minDistance={6} maxDistance={18} maxPolarAngle={Math.PI / 2.05} target={[0, 0.5, 0]} />
    </group>
  );
}
