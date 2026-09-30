import { Canvas } from '@react-three/fiber'
import { GizmoHelper, GizmoViewport, Grid, OrbitControls } from '@react-three/drei'

// Scene units: 1 three.js unit = 1 metre. Y is up.
export default function Viewport() {
  return (
    <Canvas camera={{ position: [6, 4, 8], fov: 40, near: 0.05, far: 1000 }}>
      <color attach="background" args={['#2a2b2f']} />

      <Grid
        infiniteGrid
        cellSize={1}
        cellThickness={1}
        cellColor="#4a4d55"
        sectionSize={10}
        sectionThickness={1.2}
        sectionColor="#5d6068"
        fadeDistance={120}
        fadeStrength={1.5}
      />

      <OrbitControls makeDefault />

      <GizmoHelper alignment="bottom-right" margin={[64, 64]}>
        <GizmoViewport axisColors={['#e0555a', '#6fbf5a', '#4f8fe0']} labelColor="#1b1c1f" />
      </GizmoHelper>
    </Canvas>
  )
}
