  'use client';
import { useRef, useMemo, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment, Html } from '@react-three/drei';
import * as THREE from 'three';
import { FAB_STAGES, type FabStage, type FabStep } from '@/domain/education/fab-process';
import { useAvsarStore } from '@/state/useAvsarStore';
import { useThemeStore } from '@/ui/theme';

// ── Colors (Cyber-Tech Palette) ───────────────────────────────────────────
const C = {
  bgLight: '#e2e6ec',
  bgDark: '#060a10',
  chuck: '#4a5a75', 
  wafer: '#8a9ab0',
  oxide: '#00E5FF', 
  nitride: '#00FF66', 
  poly: '#FF6B00', 
  resist: '#FF00FF',
  metal: '#E0E7FF',
  glass: '#ffffff',
  laser: '#A259FF',
  plasma: '#00E5FF',
  ion: '#00BFA6',
  diel: '#556677'
};

// ── Shared Label Component ────────────────────────────────────────────────
function Label({ children, position }: { children: React.ReactNode; position: [number, number, number] }) {
  return (
    <Html position={position} center distanceFactor={20} zIndexRange={[100, 0]}>
      <div className="pointer-events-none rounded-md bg-black/80 px-2.5 py-1 text-[11px] font-medium tracking-wide text-white border border-white/20 backdrop-blur-md whitespace-nowrap shadow-xl">
        {children}
      </div>
    </Html>
  );
}

// ── Animation Helpers ─────────────────────────────────────────────────────
function SmoothLayer({ active, yOffset, color, transmission = 0, isGrid = false }: { active: boolean; yOffset: number; color: string; transmission?: number; isGrid?: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshPhysicalMaterial>(null);

  // Procedural Grid Texture for patterned layers
  const gridTexture = useMemo(() => {
    if (!isGrid) return null;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = color;
    ctx.lineWidth = 12;
    for (let i = 0; i <= 512; i += 64) {
      ctx.beginPath();
      ctx.moveTo(i, 0); ctx.lineTo(i, 512);
      ctx.moveTo(0, i); ctx.lineTo(512, i);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4, 4);
    return tex;
  }, [isGrid, color]);

  useFrame((_, dt) => {
    if (!ref.current || !matRef.current) return;
    const targetScale = active ? 1 : 0.001;
    const targetOpacity = active ? 1 : 0;
    ref.current.scale.y = THREE.MathUtils.lerp(ref.current.scale.y, targetScale, dt * 4);
    matRef.current.opacity = THREE.MathUtils.lerp(matRef.current.opacity, targetOpacity, dt * 4);
  });

  const th = 0.02;

  return (
    <mesh ref={ref} position={[0, yOffset + th / 2, 0]}>
      <cylinderGeometry args={[5.95, 5.95, th, 64]} />
      <meshPhysicalMaterial 
        ref={matRef}
        color={isGrid ? '#000' : color}
        emissive={isGrid ? color : '#000'}
        emissiveMap={gridTexture}
        emissiveIntensity={isGrid ? 2 : 0}
        transmission={transmission} 
        roughness={0.1} 
        thickness={0.1}
        transparent
        opacity={0}
      />
    </mesh>
  );
}

function SpinCoatLayer({ active, yOffset }: { active: boolean; yOffset: number }) {
  const ref = useRef<THREE.Mesh>(null);
  
  useFrame((_, dt) => {
    if (!ref.current) return;
    const targetScale = active ? 5.9 : 0.01;
    const targetOpacity = active ? 0.8 : 0;
    
    // Slow radial expansion to simulate physical spin-coating
    const speed = active ? 4 : 8;
    ref.current.scale.x = THREE.MathUtils.lerp(ref.current.scale.x, targetScale, dt * speed);
    ref.current.scale.z = THREE.MathUtils.lerp(ref.current.scale.z, targetScale, dt * speed);
    
    const mat = ref.current.material as THREE.MeshPhysicalMaterial;
    mat.opacity = THREE.MathUtils.lerp(mat.opacity, targetOpacity, dt * speed);
  });

  return (
    <mesh ref={ref} position={[0, yOffset + 0.01, 0]}>
      <cylinderGeometry args={[1, 1, 0.025, 64]} />
      <meshPhysicalMaterial color={C.resist} transparent opacity={0} roughness={0.1} transmission={0.5} />
    </mesh>
  );
}

// ── Particle Systems ──────────────────────────────────────────────────────
function ParticleShower({ active, count = 1000, speedBase = 15, color = C.ion, isStreak = false, direction = 'down', radius = 6, startY = 15, endY = 0, isLight = false }: { active: boolean, count?: number, speedBase?: number, color?: string, isStreak?: boolean, direction?: 'up' | 'down', radius?: number, startY?: number, endY?: number, isLight?: boolean }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  
  const particles = useMemo(() => {
    return Array.from({length: count}).map(() => ({
      x: (Math.random() - 0.5) * (radius * 2),
      y: direction === 'down' ? endY + Math.random() * (startY - endY) : endY + Math.random() * (startY - endY),
      z: (Math.random() - 0.5) * (radius * 2),
      speed: Math.random() * speedBase + (speedBase / 2)
    }));
  }, [count, speedBase, direction, radius, startY, endY]);

  // Make particles slightly thicker/larger in light mode to compensate for lack of glowing bloom
  const geo = useMemo(() => isStreak ? new THREE.CylinderGeometry(isLight ? 0.04 : 0.02, isLight ? 0.04 : 0.02, 0.8, 4) : new THREE.SphereGeometry(isLight ? 0.07 : 0.04, 4, 4), [isStreak, isLight]);
  
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ 
    color, 
    transparent: true, 
    opacity: isLight ? 1.0 : 0.6, 
    blending: isLight ? THREE.NormalBlending : THREE.AdditiveBlending, 
    depthWrite: false 
  }), [color, isLight]);

  useFrame((_, dt) => {
    if (!meshRef.current || !active) return;
    particles.forEach((p, i) => {
      if (direction === 'down') {
        p.y -= p.speed * dt;
        if (p.y < endY) {
          p.y = startY;
          p.x = (Math.random() - 0.5) * (radius * 2);
          p.z = (Math.random() - 0.5) * (radius * 2);
        }
      } else {
        p.y += p.speed * dt;
        if (p.y > startY) {
          p.y = endY;
          p.x = (Math.random() - 0.5) * (radius * 2);
          p.z = (Math.random() - 0.5) * (radius * 2);
        }
      }
      dummy.position.set(p.x, p.y, p.z);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  if (!active) return null;

  return <instancedMesh ref={meshRef} args={[geo, mat, count]} position={[0, 0, 0]} />;
}

// ── Equipment Components ──────────────────────────────────────────────────

function WaferAndChuck({ spinning, step }: { spinning: boolean; step: FabStep }) {
  const chuckRef = useRef<THREE.Group>(null);
  
  useFrame((_, dt) => {
    if (chuckRef.current) {
      chuckRef.current.rotation.y += spinning ? dt * 25 : dt * 0.15;
    }
  });

  const i = FAB_STAGES.indexOf(step.stage);
  const ge = (s: FabStage) => i >= FAB_STAGES.indexOf(s);
  const btw = (a: FabStage, b: FabStage) => ge(a) && !ge(b);
  const t = step.title;

  const v = useAvsarStore((s) => s.wafer_state.visibleLayers);
  
  const showOxide = v.oxide && (btw('padox', 'contact') || ge('bpsg'));
  const showNitride = v.nitride && btw('nitride', 'polydep');
  const showPoly = v.poly && btw('polydep', 'contact');
  const showMetal = v.metal && ge('metal1');
  const showResistDrop = /Photoresist/.test(t);
  
  const isPatterned = ge('pwell') || ge('sti');
  let yOffset = 0.05;

  return (
    <group>
      <pointLight position={[5, 5, 5]} intensity={1} color="#ffffff" distance={20} />
      <group ref={chuckRef}>

        {v.silicon && (
          <mesh position={[0, yOffset, 0]}>
            <cylinderGeometry args={[6, 6, 0.02, 64]} />
            <meshStandardMaterial color={C.wafer} metalness={0.8} roughness={0.2} />
          </mesh>
        )}
        
        <SmoothLayer active={!!showOxide} yOffset={(yOffset += 0.02)} color={C.oxide} transmission={0.9} />
        <SmoothLayer active={!!showNitride} yOffset={(yOffset += 0.02)} color={C.nitride} transmission={0.8} />
        <SmoothLayer active={!!showPoly} yOffset={(yOffset += 0.02)} color={C.poly} />
        <SmoothLayer active={!!showMetal} yOffset={(yOffset += 0.02)} color={C.metal} />
        
        <SpinCoatLayer active={!!showResistDrop} yOffset={(yOffset += 0.02)} />
        
        <SmoothLayer active={!!(isPatterned && !showResistDrop)} yOffset={yOffset + 0.01} color={C.laser} transmission={0.9} isGrid />
      </group>
      
      <Label position={[-7.5, 0.05, 0]}>Silicon Wafer (8-inch)</Label>
    </group>
  );
}

function FurnaceTube() {
  const tubeRef = useRef<THREE.Group>(null);
  
  useFrame((state) => {
    if (tubeRef.current) {
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 4) * 0.01;
      tubeRef.current.scale.set(pulse, 1, pulse);
    }
  });

  return (
    <group ref={tubeRef} position={[0, 4, 0]}>
      <pointLight position={[0, 1, 0]} intensity={2} color="#ffaa00" distance={30} />
      <mesh>
        <cylinderGeometry args={[8, 8, 10, 64, 1, true]} />
        <meshPhysicalMaterial color={C.glass} roughness={0.1} transparent opacity={0.2} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {[...Array(5)].map((_, i) => (
        <mesh key={i} position={[0, i * 1.5 - 3, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[7.8, 0.05, 16, 64]} />
          <meshStandardMaterial color={C.poly} emissive={C.poly} emissiveIntensity={5} />
        </mesh>
      ))}
      <Label position={[9.5, 1, 0]}>Heating Coils</Label>
      <Label position={[-8.5, 1, 0]}>Quartz Tube</Label>
    </group>
  );
}

function LithographyOptics({ active }: { active: boolean }) {
  const laserPivotRef = useRef<THREE.Group>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const haloRef = useRef<THREE.Mesh>(null);
  const flareRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (laserPivotRef.current && coreRef.current && flareRef.current && haloRef.current) {
      if (active) {
        const t = state.clock.elapsedTime * 6;
        
        const xTarget = Math.sin(t) * 4.5;
        const zTarget = Math.sin(t * 1.3) * 4.5;
        
        // Target is mathematically fixed to the wafer plane (local y = -9.95)
        const localTarget = new THREE.Vector3(xTarget, -9.95, zTarget);
        flareRef.current.position.copy(localTarget);
        
        // Point the laser pivot at the target in world space
        const targetWorld = laserPivotRef.current.parent!.localToWorld(localTarget.clone());
        laserPivotRef.current.lookAt(targetWorld);
        
        // Dynamically scale the beam so it stretches exactly from the lens to the flare without protruding
        const dist = new THREE.Vector3(0, -4, 0).distanceTo(localTarget);
        laserPivotRef.current.scale.z = dist;
        
        (coreRef.current.material as THREE.MeshBasicMaterial).opacity = 0.6 + 0.4 * Math.sin(t * 10);
        (haloRef.current.material as THREE.MeshBasicMaterial).opacity = 0.15;
        (flareRef.current.material as THREE.MeshBasicMaterial).opacity = 0.8;
      } else {
        (coreRef.current.material as THREE.MeshBasicMaterial).opacity = 0;
        (haloRef.current.material as THREE.MeshBasicMaterial).opacity = 0;
        (flareRef.current.material as THREE.MeshBasicMaterial).opacity = 0;
      }
    }
  });

  return (
    <group position={[0, 10, 0]}>
      <pointLight position={[0, 2, 0]} intensity={1} color="#ffffff" distance={15} />

      <mesh position={[0, 4, 0]}>
        <cylinderGeometry args={[4.5, 4.5, 8, 32, 1, true]} />
        <meshStandardMaterial color={C.diel} metalness={0.5} roughness={0.5} side={THREE.DoubleSide} />
      </mesh>
      <Label position={[5.5, 4, 0]}>Projection Lens Stack</Label>

      <mesh position={[0, 0.2, 0]}>
        <torusGeometry args={[4.2, 0.1, 16, 64]} />
        <meshStandardMaterial color={C.oxide} emissive={C.oxide} emissiveIntensity={2} />
      </mesh>
      <mesh position={[0, 0, 0]} scale={[1, 0.25, 1]}>
        <sphereGeometry args={[4, 32, 16]} />
        <meshPhysicalMaterial transmission={1} ior={1.8} thickness={3} roughness={0} color={C.glass} />
      </mesh>
      <mesh position={[0, -3, 0]} scale={[1, 0.3, 1]}>
        <sphereGeometry args={[3, 32, 16]} />
        <meshPhysicalMaterial transmission={1} ior={1.8} thickness={3} roughness={0} color={C.glass} />
      </mesh>
      <mesh position={[0, -5, 0]}>
        <boxGeometry args={[8.5, 0.2, 8.5]} />
        <meshStandardMaterial color={C.diel} metalness={0.6} roughness={0.4} />
      </mesh>
      <Label position={[-5.5, -5, 0]}>Reticle Mask (Pattern)</Label>
      
      {/* Laser Pivot Assembly anchored to the bottom of the lens */}
      <group ref={laserPivotRef} position={[0, -4, 0]}>
        {/* Core Laser Beam aligned to +Z axis so lookAt aims it perfectly */}
        <mesh ref={coreRef} position={[0, 0, 0.5]} rotation={[Math.PI/2, 0, 0]}>
          <cylinderGeometry args={[0.08, 0.08, 1, 16]} />
          <meshBasicMaterial color={C.laser} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
        {/* Glow Halo */}
        <mesh ref={haloRef} position={[0, 0, 0.5]} rotation={[Math.PI/2, 0, 0]}>
          <cylinderGeometry args={[0.4, 0.4, 1, 16]} />
          <meshBasicMaterial color={C.laser} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      </group>

      {/* Surface Impact Flare */}
      <mesh ref={flareRef} position={[0, -9.95, 0]}>
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshBasicMaterial color={'#ffffff'} transparent opacity={0} blending={THREE.AdditiveBlending} />
      </mesh>
      
      <Label position={[4.5, -7, 0]}>Scanning DUV Laser</Label>
    </group>
  );
}

function PlasmaEtch() {
  const plasmaRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (plasmaRef.current) {
      const scale = 1 + 0.05 * Math.sin(state.clock.elapsedTime * 15);
      plasmaRef.current.scale.set(scale, 1, scale);
    }
  });

  return (
    <group position={[0, 5, 0]}>
      <pointLight position={[0, -1, 0]} intensity={2} color={C.plasma} distance={20} />
      <mesh>
        <cylinderGeometry args={[7.5, 7.5, 10, 32, 1, true]} />
        <meshPhysicalMaterial roughness={0.1} color={C.glass} transparent opacity={0.2} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh position={[0, 4, 0]}>
        <cylinderGeometry args={[6.5, 6.5, 1, 32]} />
        <meshStandardMaterial color={C.diel} metalness={0.6} roughness={0.5} />
      </mesh>
      <Label position={[8, 4, 0]}>Gas Showerhead</Label>

      <mesh ref={plasmaRef} position={[0, -0.5, 0]}>
        <cylinderGeometry args={[6.3, 6.3, 7.5, 32, 1, true]} />
        <meshStandardMaterial color={C.plasma} emissive={C.plasma} emissiveIntensity={1.5} transparent opacity={0.3} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
      </mesh>
      <Label position={[-8, -0.5, 0]}>Reactive Ion Plasma</Label>
    </group>
  );
}

function IonImplant() {
  const beamRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (beamRef.current) {
      beamRef.current.position.x = Math.sin(state.clock.elapsedTime * 50) * 0.3;
      beamRef.current.position.z = Math.cos(state.clock.elapsedTime * 45) * 0.3;
    }
  });

  return (
    <group position={[0, 0, 0]}>
      <pointLight position={[0, 10, 0]} intensity={1.5} color={C.ion} distance={25} />
      <group position={[0, 10, 0]}>
        <mesh>
          <cylinderGeometry args={[3, 3, 8, 32, 1, true]} />
          <meshStandardMaterial color={C.diel} metalness={0.5} roughness={0.4} side={THREE.DoubleSide} />
        </mesh>
      </group>
      <Label position={[4, 10, 0]}>Magnetic Accelerator</Label>

      <group position={[0, 6, 0]}>
        <mesh ref={beamRef}>
          <cylinderGeometry args={[1.5, 6, 12, 32, 1, true]} />
          <meshStandardMaterial color={C.ion} emissive={C.ion} emissiveIntensity={2} transparent opacity={0.4} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
        </mesh>
      </group>
      <Label position={[-5, 6, 0]}>High-Energy Ion Beam</Label>
    </group>
  );
}

function CVDSputter() {
  return (
    <group position={[0, 6, 0]}>
      <pointLight position={[0, 0, 0]} intensity={1.5} color="#aaaaaa" distance={15} />
      <mesh>
        <cylinderGeometry args={[8, 8, 12, 32, 1, true]} />
        <meshPhysicalMaterial color={C.glass} roughness={0.1} transparent opacity={0.2} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh position={[0, 4, 0]}>
        <cylinderGeometry args={[6.5, 6.5, 1, 32]} />
        <meshStandardMaterial color={C.diel} metalness={0.7} roughness={0.3} />
      </mesh>
      <Label position={[8.5, 4, 0]}>Sputtering Target (Source)</Label>
      <mesh position={[0, -2, 0]}>
        <cylinderGeometry args={[6.5, 6.5, 5, 32, 1, true]} />
        <meshStandardMaterial color="#aaaaaa" emissive="#aaaaaa" emissiveIntensity={0.5} transparent opacity={0.2} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
      </mesh>
      <Label position={[-8, -2, 0]}>Deposition Mist</Label>
    </group>
  );
}

// ── Main Scene ─────────────────────────────────────────────────────────────

export function MacroFabScene3D({ step }: { step: FabStep }) {
  const isLight = useThemeStore((s) => s.theme === 'light');
  const bg = isLight ? '#e5e7eb' : C.bgDark; // Light gray instead of pure white
  const grid1 = isLight ? '#9ca3af' : '#141e2e'; // Darker gray for grid lines in light mode
  const grid2 = isLight ? '#d1d5db' : '#0b1320'; // Mid-gray for secondary grid lines

  const m = step.method;
  const t = step.title;

  let isImplant = false, isEtch = false, isDeposition = false, isOxidation = false, isLitho = false;

  if (/Implantation/i.test(m)) isImplant = true;
  else if (/RIE|Ashing/i.test(m)) isEtch = true;
  else if (/CVD|Sputter/i.test(m)) isDeposition = true;
  else if (/Oxidation|Annealing/i.test(m)) isOxidation = true;
  else if (/Lithography/i.test(m)) isLitho = true;

  const isSpinCoat = /Photoresist/.test(t);

  const metalParticleColor = isLight ? '#334155' : C.metal;
  const ionParticleColor = isLight ? '#047857' : C.ion;
  const plasmaParticleColor = isLight ? '#0369a1' : C.plasma;
  const debrisParticleColor = isLight ? '#b45309' : '#ffaa55';

  return (
    <Canvas
      className="h-full w-full bg-transparent"
      camera={{ position: [20, 16, 20], fov: 40 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: false }}
      frameloop="always"
    >
      <color attach="background" args={[bg]} />
      <fog attach="fog" args={[bg, 25, 65]} />
      
      <Suspense fallback={null}>
        <Environment preset="city" background={false} />
      </Suspense>
      
      <ambientLight intensity={0.4} />
      <hemisphereLight args={['#ffffff', '#222222', 0.6]} />
      <spotLight position={[0, 30, 0]} angle={0.5} penumbra={1} intensity={2} color="#ffffff" />
      
      <gridHelper args={[80, 40, grid1, grid2]} position={[0, -3, 0]} />

      {/* Downward Showers */}
      <ParticleShower active={isDeposition && !isOxidation} color={metalParticleColor} count={200} speedBase={10} direction="down" startY={8} isLight={isLight} />
      <ParticleShower active={isOxidation} color={metalParticleColor} count={200} speedBase={10} direction="down" startY={7} isLight={isLight} />
      <ParticleShower active={isImplant} color={ionParticleColor} count={300} speedBase={30} isStreak direction="down" startY={10} isLight={isLight} />
      
      {/* Upward Etching Debris */}
      <ParticleShower active={isEtch} color={debrisParticleColor} count={150} speedBase={20} isStreak direction="up" startY={8} endY={0} isLight={isLight} />
      <ParticleShower active={isEtch} color={plasmaParticleColor} count={250} speedBase={15} direction="down" startY={7} isLight={isLight} />

      <group position={[0, -2, 0]}>
        <WaferAndChuck spinning={isSpinCoat} step={step} />

        {isOxidation && <FurnaceTube />}
        {isLitho && !isSpinCoat && <LithographyOptics active={true} />}
        {isEtch && <PlasmaEtch />}
        {isImplant && <IonImplant />}
        {isDeposition && <CVDSputter />}
      </group>

      <OrbitControls
        makeDefault
        enablePan={false}
        enableDamping
        dampingFactor={0.05}
        autoRotate
        autoRotateSpeed={0.5}
        maxPolarAngle={Math.PI / 2 - 0.05}
        minDistance={10}
        maxDistance={50}
        target={[0, 2, 0]}
      />
    </Canvas>
  );
}
