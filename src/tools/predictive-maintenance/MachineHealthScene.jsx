/**
 * MachineHealthScene.jsx
 * ----------------------
 * 3D content of the Predictive Maintenance tool: a motor driving a bearing that
 * degrades over time. As health falls, the bearing shifts green -> amber -> red,
 * vibration shakes the whole machine harder, and the sensor reads it. Pure
 * renderer: reads the live health state, reports node clicks via onSelect.
 */
import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import { RigLights, GridFloor } from '../../components/Stage';
import { NODES, bandFor } from './data';

function Label({ id, name, pos, color, selected, onSelect, dy = 0.7 }) {
  return (
    <Html position={[pos[0], pos[1] + dy, pos[2]]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
      <button
        onClick={(e) => { e.stopPropagation(); onSelect(id); }}
        style={{ pointerEvents: 'auto' }}
        className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold backdrop-blur transition-colors ${
          selected ? 'border-rose-400 bg-rose-500/25 text-white' : 'border-slate-600 bg-slate-900/85 text-slate-200 hover:border-rose-400/70'
        }`}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
        {name}
      </button>
    </Html>
  );
}

function useClick(id, onSelect) {
  const [hover, setHover] = useState(false);
  const handlers = {
    onClick: (e) => { e.stopPropagation(); onSelect(id); },
    onPointerOver: (e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = 'pointer'; },
    onPointerOut: () => { setHover(false); document.body.style.cursor = 'default'; },
  };
  return [hover, handlers];
}

export default function MachineHealthScene({ health, vib, running, selectedId, onSelect, floorColor = '#111826', light = false }) {
  const shakeRef = useRef();
  const rotorRef = useRef();
  const band = bandFor(health);
  const bearingColor = band.color;
  const bearingGlow = 0.25 + ((100 - health) / 100) * 1.3;

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    if (shakeRef.current) {
      const amp = running ? vib * 0.006 : 0; // vibration amplitude -> visible shake
      shakeRef.current.position.x = Math.sin(t * 46) * amp;
      shakeRef.current.position.y = 0.9 + Math.cos(t * 53) * amp * 0.7;
    }
    if (rotorRef.current && running) rotorRef.current.rotation.x += dt * 7;
  });

  const motor = NODES.find((n) => n.id === 'motor');
  const bearing = NODES.find((n) => n.id === 'bearing');
  const sensor = NODES.find((n) => n.id === 'sensor');
  const [motorHover, motorClick] = useClick('motor', onSelect);
  const [bearHover, bearClick] = useClick('bearing', onSelect);
  const [senHover, senClick] = useClick('sensor', onSelect);

  return (
    <group>
      <RigLights light={light} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.4, 0]} receiveShadow>
        <planeGeometry args={[34, 34]} />
        <meshStandardMaterial color={floorColor} />
      </mesh>
      <GridFloor light={light} plane={false} y={-0.38} contactScale={16} />

      {/* Baseplate */}
      <mesh position={[0, -0.05, 0]}>
        <boxGeometry args={[5, 0.3, 2.2]} />
        <meshStandardMaterial color="#1e293b" metalness={0.4} roughness={0.6} />
      </mesh>

      {/* Machine that shakes with vibration */}
      <group ref={shakeRef} position={[0, 0.9, 0]}>
        {/* Motor body */}
        <mesh {...motorClick} position={[motor.pos[0], 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.62, 0.62, 1.6, 32]} />
          <meshStandardMaterial color={motorHover || selectedId === 'motor' ? '#94a3b8' : '#64748b'} metalness={0.6} roughness={0.4} />
        </mesh>
        {/* Cooling fins */}
        {[-0.5, -0.25, 0, 0.25, 0.5].map((x) => (
          <mesh key={x} position={[motor.pos[0] + x, 0, 0]}><torusGeometry args={[0.63, 0.02, 8, 24]} /><meshStandardMaterial color="#475569" metalness={0.5} /></mesh>
        ))}
        {/* Shaft */}
        <mesh position={[0, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.1, 0.1, 2.2, 16]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.7} roughness={0.3} />
        </mesh>
        {/* Rotor disc (spins) */}
        <mesh ref={rotorRef} position={[0.1, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.34, 0.34, 0.12, 6]} />
          <meshStandardMaterial color="#e2e8f0" metalness={0.6} roughness={0.35} />
        </mesh>
        {/* Bearing housing (colours by health) */}
        <mesh {...bearClick} position={[bearing.pos[0], 0, 0]}>
          <cylinderGeometry args={[0.5, 0.5, 0.5, 24]} />
          <meshStandardMaterial color={bearingColor} emissive={bearingColor} emissiveIntensity={bearHover || selectedId === 'bearing' ? bearingGlow + 0.3 : bearingGlow} metalness={0.3} roughness={0.5} />
        </mesh>
        {/* Vibration sensor on the bearing */}
        <mesh {...senClick} position={[sensor.pos[0], 1, 0]}>
          <boxGeometry args={[0.28, 0.4, 0.28]} />
          <meshStandardMaterial color="#34d399" emissive="#34d399" emissiveIntensity={senHover || selectedId === 'sensor' ? 0.8 : 0.4} metalness={0.3} roughness={0.4} />
        </mesh>
        <mesh position={[sensor.pos[0], 0.7, 0]}><cylinderGeometry args={[0.03, 0.03, 0.2, 8]} /><meshStandardMaterial color="#94a3b8" /></mesh>

        <Label id="motor" name={motor.name} pos={[motor.pos[0], 0.65, 0]} color="#94a3b8" selected={selectedId === 'motor'} onSelect={onSelect} dy={0} />
        <Label id="bearing" name={`Bearing · ${band.name}`} pos={[bearing.pos[0], 0.6, 0]} color={bearingColor} selected={selectedId === 'bearing'} onSelect={onSelect} dy={0} />
        <Label id="sensor" name={sensor.name} pos={[sensor.pos[0], 1.3, 0]} color="#34d399" selected={selectedId === 'sensor'} onSelect={onSelect} dy={0} />
      </group>

      <OrbitControls enablePan={false} minDistance={5} maxDistance={16} maxPolarAngle={Math.PI / 2.05} target={[0, 1, 0]} />
    </group>
  );
}
