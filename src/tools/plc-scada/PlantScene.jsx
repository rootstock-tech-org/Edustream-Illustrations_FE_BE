/**
 * PlantScene.jsx
 * --------------
 * 3D content of the PLC & SCADA tool: a liquid tank controlled by a PLC. The
 * pump and inlet valve fill the tank, a level sensor reads it, and the PLC
 * cabinet blinks through its scan cycle. Pure renderer: reads the live plant
 * state, reports node clicks via onSelect.
 */
import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import { RigLights, GridFloor } from '../../components/Stage';
import { NODES } from './data';

const ROLE_COLOR = {
  controller: '#fbbf24',
  process: '#38bdf8',
  actuator: '#f472b6',
  sensor: '#34d399',
};
const SCAN_COLOR = ['#38bdf8', '#fbbf24', '#34d399']; // read, execute, write

function Label({ id, name, pos, color, selected, onSelect, dy = 0.7 }) {
  return (
    <Html position={[pos[0], pos[1] + dy, pos[2]]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
      <button
        onClick={(e) => { e.stopPropagation(); onSelect(id); }}
        style={{ pointerEvents: 'auto' }}
        className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold backdrop-blur transition-colors ${
          selected ? 'border-amber-400 bg-amber-500/30 text-white' : 'border-slate-600 bg-slate-900/85 text-slate-200 hover:border-amber-400/70'
        }`}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
        {name}
      </button>
    </Html>
  );
}

function clickable(id, selected, onSelect, setHover) {
  return {
    onClick: (e) => { e.stopPropagation(); onSelect(id); },
    onPointerOver: (e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = 'pointer'; },
    onPointerOut: () => { setHover(false); document.body.style.cursor = 'default'; },
  };
}

const TANK_BASE = 0.15;
const TANK_H = 2.9;

function Tank({ level, lowSP, highSP, selected, onSelect }) {
  const [hover, setHover] = useState(false);
  const liquidRef = useRef();
  const n = NODES.find((x) => x.id === 'tank');
  useFrame((state) => {
    if (!liquidRef.current) return;
    const h = Math.max(0.02, (level / 100) * TANK_H);
    liquidRef.current.scale.y = h;
    liquidRef.current.position.y = TANK_BASE + h / 2;
    liquidRef.current.position.x = 0; // wobble is subtle
    liquidRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 2) * 0.004;
  });
  return (
    <group position={[0.4, 0, 0]}>
      {/* Shell */}
      <mesh {...clickable('tank', selected, onSelect, setHover)} position={[0, TANK_BASE + TANK_H / 2, 0]}>
        <cylinderGeometry args={[1, 1, TANK_H, 32, 1, true]} />
        <meshStandardMaterial color={hover || selected ? '#7dd3fc' : '#93c5fd'} transparent opacity={0.18} side={2} metalness={0.1} roughness={0.1} />
      </mesh>
      {/* Liquid (scaled by level) */}
      <mesh ref={liquidRef} position={[0, TANK_BASE, 0]}>
        <cylinderGeometry args={[0.94, 0.94, 1, 32]} />
        <meshStandardMaterial color="#0ea5e9" emissive="#0284c7" emissiveIntensity={0.35} transparent opacity={0.85} />
      </mesh>
      {/* Base + rim */}
      <mesh position={[0, TANK_BASE, 0]}><cylinderGeometry args={[1.02, 1.02, 0.08, 32]} /><meshStandardMaterial color="#334155" metalness={0.4} roughness={0.5} /></mesh>
      <mesh position={[0, TANK_BASE + TANK_H, 0]}><torusGeometry args={[1, 0.04, 8, 32]} /><meshStandardMaterial color="#475569" metalness={0.5} roughness={0.4} /></mesh>
      {/* Setpoint rings */}
      {[['#f87171', highSP], ['#fbbf24', lowSP]].map(([c, sp]) => (
        <mesh key={c} position={[0, TANK_BASE + (sp / 100) * TANK_H, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.03, 0.02, 8, 32]} />
          <meshStandardMaterial color={c} emissive={c} emissiveIntensity={0.6} toneMapped={false} />
        </mesh>
      ))}
      <Label id="tank" name={n.name} pos={[0, TANK_BASE + TANK_H, 0]} color={ROLE_COLOR.process} selected={selected} onSelect={onSelect} dy={0.35} />
    </group>
  );
}

function Pump({ running, selected, onSelect }) {
  const [hover, setHover] = useState(false);
  const rotor = useRef();
  const n = NODES.find((x) => x.id === 'pump');
  useFrame((_, dt) => { if (rotor.current && running) rotor.current.rotation.x += dt * 9; });
  const color = ROLE_COLOR.actuator;
  return (
    <group position={n.pos}>
      <mesh {...clickable('pump', selected, onSelect, setHover)}>
        <sphereGeometry args={[0.42, 24, 20]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={running ? 0.8 : hover || selected ? 0.5 : 0.2} metalness={0.4} roughness={0.4} />
      </mesh>
      <mesh ref={rotor} position={[0.42, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <boxGeometry args={[0.5, 0.06, 0.06]} />
        <meshStandardMaterial color="#f8fafc" emissive="#94a3b8" emissiveIntensity={0.4} />
      </mesh>
      <Label id="pump" name={running ? 'Pump · RUN' : 'Pump · OFF'} pos={[0, 0, 0]} color={running ? '#34d399' : '#94a3b8'} selected={selected} onSelect={onSelect} dy={0.6} />
    </group>
  );
}

function Valve({ open, selected, onSelect }) {
  const [hover, setHover] = useState(false);
  const n = NODES.find((x) => x.id === 'valve');
  const color = open ? '#34d399' : '#f472b6';
  return (
    <group position={n.pos}>
      <mesh {...clickable('valve', selected, onSelect, setHover)}>
        <boxGeometry args={[0.44, 0.44, 0.44]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={open ? 0.9 : hover || selected ? 0.5 : 0.25} metalness={0.35} roughness={0.4} />
      </mesh>
      {/* handle */}
      <mesh position={[0, 0.32, 0]}><cylinderGeometry args={[0.05, 0.05, 0.2, 8]} /><meshStandardMaterial color="#e2e8f0" /></mesh>
      <Label id="valve" name={open ? 'Valve · OPEN' : 'Valve · SHUT'} pos={[0, 0, 0]} color={color} selected={selected} onSelect={onSelect} dy={0.55} />
    </group>
  );
}

function Sensor({ level, selected, onSelect }) {
  const [hover, setHover] = useState(false);
  const n = NODES.find((x) => x.id === 'sensor');
  const color = ROLE_COLOR.sensor;
  return (
    <group position={n.pos}>
      <mesh {...clickable('sensor', selected, onSelect, setHover)}>
        <boxGeometry args={[0.34, 0.5, 0.34]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={hover || selected ? 0.7 : 0.35} metalness={0.3} roughness={0.4} />
      </mesh>
      <Label id="sensor" name={`Level · ${Math.round(level)}%`} pos={[0, 0, 0]} color={color} selected={selected} onSelect={onSelect} dy={0.55} />
    </group>
  );
}

function PlcCabinet({ scanPhase, running, alarm, selected, onSelect }) {
  const [hover, setHover] = useState(false);
  const n = NODES.find((x) => x.id === 'plc');
  const color = ROLE_COLOR.controller;
  return (
    <group position={n.pos}>
      <mesh {...clickable('plc', selected, onSelect, setHover)}>
        <boxGeometry args={[1.1, 1.9, 0.7]} />
        <meshStandardMaterial color={hover || selected ? '#facc15' : '#a16207'} emissive={color} emissiveIntensity={hover || selected ? 0.4 : 0.15} metalness={0.4} roughness={0.5} />
      </mesh>
      {/* Scan LED (colour = current scan phase) */}
      <mesh position={[0, 0.6, 0.37]}>
        <sphereGeometry args={[0.1, 16, 16]} />
        <meshStandardMaterial color={SCAN_COLOR[scanPhase]} emissive={SCAN_COLOR[scanPhase]} emissiveIntensity={1.6} toneMapped={false} />
      </mesh>
      {/* Run + Alarm lamps */}
      <mesh position={[-0.25, 0.2, 0.37]}>
        <sphereGeometry args={[0.07, 12, 12]} />
        <meshStandardMaterial color={running ? '#34d399' : '#1f2937'} emissive={running ? '#34d399' : '#000'} emissiveIntensity={running ? 1.4 : 0} toneMapped={false} />
      </mesh>
      <mesh position={[0.25, 0.2, 0.37]}>
        <sphereGeometry args={[0.07, 12, 12]} />
        <meshStandardMaterial color={alarm ? '#f87171' : '#1f2937'} emissive={alarm ? '#ef4444' : '#000'} emissiveIntensity={alarm ? 1.6 : 0} toneMapped={false} />
      </mesh>
      {/* I/O terminal strip */}
      {[-0.3, -0.1, 0.1, 0.3].map((x) => (
        <mesh key={x} position={[x, -0.4, 0.37]}><boxGeometry args={[0.08, 0.5, 0.04]} /><meshStandardMaterial color="#111827" metalness={0.3} /></mesh>
      ))}
      <Label id="plc" name="PLC" pos={[0, 0.95, 0]} color={color} selected={selected} onSelect={onSelect} dy={0.3} />
    </group>
  );
}

function Pipe({ from, to, color = '#64748b' }) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  const len = Math.hypot(dx, dy, dz);
  const mid = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2];
  // rotate a +y cylinder to align with the segment
  const yaw = 0;
  const pitch = Math.atan2(Math.hypot(dx, dz), dy);
  const roll = Math.atan2(dx, -dz);
  return (
    <mesh position={mid} rotation={[pitch, yaw, roll]}>
      <cylinderGeometry args={[0.08, 0.08, len, 12]} />
      <meshStandardMaterial color={color} metalness={0.5} roughness={0.5} />
    </mesh>
  );
}

export default function PlantScene({ level, lowSP, highSP, pump, valve, running, alarm, scanPhase, selectedId, onSelect, floorColor = '#111826', light = false }) {
  return (
    <group>
      <RigLights light={light} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.4, 0]} receiveShadow>
        <planeGeometry args={[34, 34]} />
        <meshStandardMaterial color={floorColor} />
      </mesh>
      <GridFloor light={light} plane={false} y={-0.38} contactScale={16} />

      {/* Process piping: pump -> valve -> tank */}
      <Pipe from={[-1.4, -0.15, 0]} to={[-0.4, 2.4, 0]} />
      <Pipe from={[-0.4, 2.6, 0]} to={[0.35, 2.6, 0]} />
      {/* Signal wires: PLC to devices */}
      <Pipe from={[-3.0, 0.9, 0.2]} to={[-1.6, 0.0, 0.1]} color="#facc15" />
      <Pipe from={[-3.0, 1.3, 0.2]} to={[-0.6, 2.6, 0.1]} color="#facc15" />
      <Pipe from={[-3.0, 1.5, 0.2]} to={[1.9, 1.7, 0.1]} color="#34d399" />

      <PlcCabinet scanPhase={scanPhase} running={running} alarm={alarm} selected={selectedId === 'plc'} onSelect={onSelect} />
      <Tank level={level} lowSP={lowSP} highSP={highSP} selected={selectedId === 'tank'} onSelect={onSelect} />
      <Pump running={pump} selected={selectedId === 'pump'} onSelect={onSelect} />
      <Valve open={valve} selected={selectedId === 'valve'} onSelect={onSelect} />
      <Sensor level={level} selected={selectedId === 'sensor'} onSelect={onSelect} />

      <OrbitControls enablePan={false} minDistance={6} maxDistance={18} maxPolarAngle={Math.PI / 2.05} target={[-0.4, 1.3, 0]} />
    </group>
  );
}
