/**
 * MachineScene.jsx
 * ----------------
 * 3D content of the Sensors tool: a motor-pump that spins with RPM and physically
 * vibrates with the live vibration reading, with clickable sensor markers. Pure
 * renderer: reads rpm/vibration/selectedId, reports clicks via onSelect.
 */
import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import { RigLights, GridFloor } from '../../components/Stage';
import { MACHINE_SENSORS, METRICS } from './data';

// Traffic-light tone from a sensor's live reading vs its warn/bad thresholds.
const TONES = {
  ok: { hex: '#34d399', dot: 'bg-emerald-400', pill: 'border-emerald-400 bg-emerald-500/25 text-emerald-100' },
  warn: { hex: '#fbbf24', dot: 'bg-amber-400', pill: 'border-amber-400 bg-amber-500/25 text-amber-100' },
  bad: { hex: '#f87171', dot: 'bg-rose-400', pill: 'border-rose-400 bg-rose-500/25 text-rose-100' },
};
function statusTone(metricKey, value) {
  const m = METRICS[metricKey];
  if (!m || value == null) return TONES.ok;
  if (value >= m.bad) return TONES.bad;
  if (value >= m.warn) return TONES.warn;
  return TONES.ok;
}

function SensorMarker({ sensor, selected, onSelect, reading }) {
  const [hovered, setHovered] = useState(false);
  const ref = useRef();
  const active = selected || hovered;
  const tone = statusTone(sensor.metric, reading);

  useFrame((state) => {
    if (!ref.current) return;
    const s = 1 + Math.sin(state.clock.elapsedTime * 4) * (active ? 0.25 : 0.12);
    ref.current.scale.setScalar(s);
  });

  return (
    <group position={sensor.pos}>
      <mesh
        ref={ref}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(sensor.id);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = 'default';
        }}
      >
        <sphereGeometry args={[0.1, 16, 16]} />
        <meshStandardMaterial color={tone.hex} emissive={tone.hex} emissiveIntensity={active ? 1.4 : 0.7} toneMapped={false} />
      </mesh>

      {/* Always-visible clickable label, like the robot arm's joint labels. */}
      <Html position={[0, 0.2, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSelect(sensor.id);
          }}
          style={{ pointerEvents: 'auto' }}
          className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold backdrop-blur transition-colors ${
            selected
              ? tone.pill
              : 'border-slate-600 bg-slate-900/85 text-slate-200 hover:border-emerald-400/70'
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
          {sensor.quantity}
        </button>
      </Html>
    </group>
  );
}

export default function MachineScene({ rpm, vibration, selectedId, onSelect, readings, floorColor = '#111826', light = false }) {
  const machineRef = useRef();
  const impellerRef = useRef();

  useFrame((state, delta) => {
    // Impeller spins proportional to RPM.
    if (impellerRef.current) impellerRef.current.rotation.z += (rpm / 1500) * delta * 9;
    // The whole machine jitters with the live vibration reading.
    if (machineRef.current) {
      const amp = Math.min(vibration, 12) * 0.004;
      machineRef.current.position.x = (Math.random() - 0.5) * amp;
      machineRef.current.position.y = (Math.random() - 0.5) * amp;
    }
  });

  return (
    <group>
      <RigLights light={light} />

      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.35, 0]} receiveShadow>
        <planeGeometry args={[24, 24]} />
        <meshStandardMaterial color={floorColor} />
      </mesh>
      <GridFloor light={light} plane={false} y={-0.33} contactScale={12} />

      <group ref={machineRef}>
        {/* Base skid */}
        <mesh position={[0, -0.2, 0]} castShadow>
          <boxGeometry args={[4, 0.22, 1.7]} />
          <meshStandardMaterial color="#1e293b" metalness={0.3} roughness={0.6} />
        </mesh>

        {/* Motor body */}
        <mesh position={[-1, 0.45, 0]} castShadow>
          <boxGeometry args={[1.7, 1.1, 1.05]} />
          <meshStandardMaterial color="#ea8a3c" metalness={0.25} roughness={0.5} />
        </mesh>
        {/* Cooling fins */}
        {[-0.5, -0.2, 0.1, 0.4].map((x) => (
          <mesh key={x} position={[-1 + x * 0.6, 0.45, 0]}>
            <boxGeometry args={[0.04, 1.14, 1.08]} />
            <meshStandardMaterial color="#c2410c" />
          </mesh>
        ))}

        {/* Shaft */}
        <mesh position={[0.2, 0.45, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.09, 0.09, 0.8, 16]} />
          <meshStandardMaterial color="#64748b" metalness={0.6} roughness={0.3} />
        </mesh>

        {/* Pump volute */}
        <mesh position={[1.4, 0.6, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.75, 0.75, 0.55, 32]} />
          <meshStandardMaterial color="#334155" metalness={0.35} roughness={0.5} />
        </mesh>
        {/* Impeller (spins with RPM) */}
        <group ref={impellerRef} position={[1.4, 0.6, 0.3]}>
          {[0, 1, 2, 3, 4].map((i) => (
            <mesh key={i} rotation={[0, 0, (i / 5) * Math.PI * 2]}>
              <boxGeometry args={[0.5, 0.08, 0.06]} />
              <meshStandardMaterial color="#94a3b8" metalness={0.6} roughness={0.3} />
            </mesh>
          ))}
          <mesh>
            <cylinderGeometry args={[0.1, 0.1, 0.08, 12]} />
            <meshStandardMaterial color="#475569" />
          </mesh>
        </group>
        {/* Outlet pipe */}
        <mesh position={[1.4, 1.35, 0]}>
          <cylinderGeometry args={[0.16, 0.16, 0.6, 16]} />
          <meshStandardMaterial color="#334155" />
        </mesh>

        {/* Power box */}
        <mesh position={[-1.9, 0.15, -0.45]} castShadow>
          <boxGeometry args={[0.4, 0.6, 0.3]} />
          <meshStandardMaterial color="#0f172a" metalness={0.4} roughness={0.5} />
        </mesh>

        {/* Sensor markers */}
        {MACHINE_SENSORS.map((s) => (
          <SensorMarker key={s.id} sensor={s} selected={selectedId === s.id} onSelect={onSelect} reading={readings?.[s.metric]} />
        ))}
      </group>

      <OrbitControls enablePan={false} minDistance={4} maxDistance={14} maxPolarAngle={Math.PI / 2.05} target={[0, 0.4, 0]} />
    </group>
  );
}
