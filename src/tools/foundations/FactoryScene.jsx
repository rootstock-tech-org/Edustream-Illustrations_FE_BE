/**
 * FactoryScene.jsx
 * ----------------
 * The 3D content of the Foundations tool (rendered inside a <Canvas>). A vertical
 * IIoT stack, field devices at the bottom up to applications at the top, with
 * data packets flowing upward. Click a layer to select it; hover to highlight.
 *
 * Pure renderer: it reads `selectedId` and reports clicks via `onSelect`, so all
 * state lives in the parent tool (same pattern as the robot-arm demo).
 */
import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls, RoundedBox, Text, Html } from '@react-three/drei';
import { RigLights, GridFloor } from '../../components/Stage';
import { IOT_ARCH_LAYERS } from './data';

const LAYER_GAP = 1.7;
const LAYER_COLORS = {
  sensing: '#64748b',
  network: '#38bdf8',
  processing: '#a78bfa',
  application: '#34d399',
};

function LayerSlab({ layer, index, selected, onSelect, labelColor, subColor }) {
  const [hovered, setHovered] = useState(false);
  const color = LAYER_COLORS[layer.id] ?? '#38bdf8';
  const active = selected || hovered;
  const y = index * LAYER_GAP;

  return (
    <group position={[0, y, 0]} scale={selected ? 1.05 : 1}>
      <RoundedBox
        args={[5.2, 0.66, 3.4]}
        radius={0.13}
        smoothness={4}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(layer.id);
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
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={active ? 0.55 : 0.12}
          metalness={0.3}
          roughness={0.45}
        />
      </RoundedBox>

      {/* Selection ring */}
      {selected && (
        <RoundedBox args={[5.5, 0.82, 3.42]} radius={0.15} smoothness={4}>
          <meshBasicMaterial color={color} wireframe transparent opacity={0.6} />
        </RoundedBox>
      )}

      {/* Label */}
      <Text renderOrder={5} position={[-2.6, 0, 1.75]} fontSize={0.32} color={labelColor} anchorX="left" anchorY="middle" outlineWidth={0.02} outlineColor={labelColor === '#0f172a' ? '#ffffff' : '#0a0e14'}>
        {layer.name}
      </Text>
      <Text renderOrder={5} position={[-2.6, -0.34, 1.75]} fontSize={0.17} color={subColor ?? color} anchorX="left" anchorY="middle" outlineWidth={0.012} outlineColor={subColor ? '#ffffff' : '#0a0e14'}>
        {layer.short}
      </Text>
    </group>
  );
}

/**
 * Straight 3D data flow up the centre of the stack, in the real IIoT order
 * (field devices -> connectivity -> edge -> cloud -> applications). A stream of
 * arrows rises through every layer; the clickable rail explains the path.
 */
function FlowArrows({ flowing, speed, gap, count }) {
  const gaps = Math.max(1, count - 1);
  const yB = 0.25; // just above the bottom (field) layer
  const yT = (count - 1) * gap; // top (applications) layer
  const H = yT - yB;
  const COUNT = 4; // arrows in the rising stream
  const arrows = useRef([]);
  const labelRef = useRef();
  const [info, setInfo] = useState(false); // wire clicked -> show the path tooltip

  useFrame((state) => {
    const t = state.clock.elapsedTime * (0.12 + speed * 0.05);
    for (let i = 0; i < COUNT; i++) {
      const m = arrows.current[i];
      if (!m) continue;
      m.visible = flowing;
      if (flowing) m.position.set(0, yB + ((t + i / COUNT) % 1) * H, 0);
    }
    if (labelRef.current) {
      labelRef.current.visible = flowing;
      // Ride up the right side of the stack so the pill stays over the model but clear of the left-anchored labels.
      if (flowing) labelRef.current.position.set(2.0, yB + (t % 1) * H + 0.4, 0);
    }
  });

  return (
    <group>
      {/* Straight vertical rail up the centre */}
      <mesh position={[0, (yB + yT) / 2, 0]}>
        <cylinderGeometry args={[0.022, 0.022, H, 8]} />
        <meshStandardMaterial color="#155e75" emissive="#0e7490" emissiveIntensity={info ? 0.9 : 0.35} transparent opacity={0.6} />
      </mesh>
      {/* Upward guide arrowheads between each pair of layers */}
      {Array.from({ length: gaps }).map((_, i) => (
        <mesh key={i} position={[0, i * gap + gap / 2, 0]}>
          <coneGeometry args={[0.1, 0.2, 16]} />
          <meshStandardMaterial color="#0e7490" emissive="#22d3ee" emissiveIntensity={0.35} transparent opacity={0.45} toneMapped={false} />
        </mesh>
      ))}
      {/* Clickable hit targets in each open gap */}
      {Array.from({ length: gaps }).map((_, i) => (
        <mesh
          key={`h${i}`}
          position={[0, i * gap + gap / 2, 0]}
          onClick={(e) => { e.stopPropagation(); setInfo((v) => !v); }}
          onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
          onPointerOut={() => { document.body.style.cursor = 'default'; }}
        >
          <sphereGeometry args={[0.32, 12, 12]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
      {info && (
        <Html position={[0, yT + 0.45, 0]} center zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
          <div className="whitespace-nowrap rounded-md border border-brand-500/40 bg-slate-900/90 px-2 py-1 text-[10px] font-medium text-brand-200 shadow-lg">
            Data path · devices → connectivity → edge → cloud → apps
          </div>
        </Html>
      )}
      {/* Rising stream of upward arrows */}
      {Array.from({ length: COUNT }).map((_, i) => (
        <group key={i} ref={(el) => (arrows.current[i] = el)}>
          <mesh position={[0, -0.13, 0]}>
            <cylinderGeometry args={[0.045, 0.045, 0.28, 10]} />
            <meshStandardMaterial color="#67e8f9" emissive="#22d3ee" emissiveIntensity={1.5} toneMapped={false} />
          </mesh>
          <mesh position={[0, 0.08, 0]}>
            <coneGeometry args={[0.14, 0.26, 16]} />
            <meshStandardMaterial color="#a5f3fc" emissive="#22d3ee" emissiveIntensity={1.8} toneMapped={false} />
          </mesh>
        </group>
      ))}
      {/* Small upright "Data" label riding the lead arrow */}
      <group ref={labelRef}>
        <Html center zIndexRange={[25, 0]} style={{ pointerEvents: 'none' }}>
          <span className="rounded-full bg-brand-500/90 px-1.5 py-[1px] text-[8px] font-bold text-slate-950 shadow">Data</span>
        </Html>
      </group>
    </group>
  );
}

export default function FactoryScene({ selectedId, onSelect, flowing, speed, autoRotate, labelColor = '#e2e8f0', subColor, light = false }) {
  const topY = (IOT_ARCH_LAYERS.length - 1) * LAYER_GAP;

  return (
    <group>
      <RigLights light={light} />
      <GridFloor light={light} y={-0.9} contactScale={9} />

      {IOT_ARCH_LAYERS.map((layer, i) => (
        <LayerSlab key={layer.id} layer={layer} index={i} selected={selectedId === layer.id} onSelect={onSelect} labelColor={labelColor} subColor={subColor} />
      ))}

      <FlowArrows flowing={flowing} speed={speed} gap={LAYER_GAP} count={IOT_ARCH_LAYERS.length} />

      <OrbitControls
        enablePan={false}
        autoRotate={autoRotate}
        autoRotateSpeed={0.7}
        minDistance={7}
        maxDistance={20}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 1.9}
        target={[0, topY / 2 - 1.2, 0]}
      />
    </group>
  );
}
