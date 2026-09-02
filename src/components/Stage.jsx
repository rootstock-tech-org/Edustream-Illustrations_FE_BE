/**
 * Stage.jsx
 * ---------
 * Shared 3D "factory stage" so every module reads like a real simulation cell,
 * not a floating widget: a rich industrial light rig plus a grounded engineering
 * grid floor with soft contact shadows. Both are theme-aware (dark control-room
 * vs light shop-floor) so structure stays visible in either mode.
 *
 * `light` is passed as a prop (React context does not bridge into <Canvas>), so
 * each scene forwards its own `light` flag. Use inside a <Canvas>:
 *   <RigLights light={light} />
 *   <GridFloor light={light} y={-0.4} plane={false} />
 */
import { Grid, ContactShadows } from '@react-three/drei';

/** Industrial light rig: soft ambient fill + a shadow-casting key + warm/cool accents. */
export function RigLights({ light = false }) {
  return (
    <>
      <ambientLight intensity={light ? 0.85 : 0.42} />
      <hemisphereLight args={['#fff2e0', light ? '#c8d3e4' : '#0a0e14', light ? 0.85 : 0.5]} />
      <directionalLight position={[7, 13, 7]} intensity={light ? 1.25 : 1.1} castShadow shadow-mapSize={[2048, 2048]}>
        <orthographicCamera attach="shadow-camera" args={[-16, 16, 16, -16, 0.1, 60]} />
      </directionalLight>
      <spotLight position={[0, 11, 5]} angle={0.5} penumbra={0.6} intensity={light ? 0.35 : 0.7} color="#fff2e0" />
      <pointLight position={[-7, 4, 6]} intensity={light ? 0.2 : 0.42} color="#38bdf8" />
    </>
  );
}

/**
 * Grounded engineering grid floor + soft contact shadow, giving depth and a real
 * "shop floor" under the scene. Position it at the scene's floor via `y`. Set
 * `plane={false}` to overlay only the grid + shadow on a floor the scene already
 * draws (avoids a double floor / z-fighting).
 */
export function GridFloor({ light = false, y = 0, size = 44, contact = true, contactScale = 18, plane = true }) {
  const floorColor = light ? '#dbe2ee' : '#0c1220';
  return (
    <group position={[0, y, 0]}>
      {plane && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
          <planeGeometry args={[size, size]} />
          <meshStandardMaterial color={floorColor} metalness={0.1} roughness={0.9} />
        </mesh>
      )}
      <Grid
        args={[size, size]}
        cellSize={0.6}
        cellThickness={0.6}
        cellColor={light ? '#b6c2d6' : '#1e293b'}
        sectionSize={3}
        sectionThickness={1.1}
        sectionColor={light ? '#8aa0c0' : '#334155'}
        fadeDistance={32}
        fadeStrength={1}
        infiniteGrid
      />
      {contact && <ContactShadows position={[0, 0.01, 0]} scale={contactScale} blur={2.4} opacity={light ? 0.3 : 0.5} far={7} />}
    </group>
  );
}
