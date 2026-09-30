import { MOUSE } from 'three'
import { Canvas } from '@react-three/fiber'
import { GizmoHelper, GizmoViewport, OrbitControls } from '@react-three/drei'
import { useUi } from '../state/uiStore'
import FrameController from './FrameController'
import GroundGrid from './GroundGrid'
import JointGizmo from './JointGizmo'
import SceneNodes from './SceneNodes'
import SelectionGizmo from './SelectionGizmo'
import { viewportBridge } from './viewportBridge'

// Blender-style navigation: middle-drag orbits, Shift+middle-drag pans (built into
// OrbitControls), scroll zooms. The left button is left free for selecting.
const NO_ACTION = -1 as MOUSE
const MOUSE_BUTTONS = { LEFT: NO_ACTION, MIDDLE: MOUSE.ROTATE, RIGHT: NO_ACTION }

// Scene units: 1 three.js unit = 1 metre. Y is up.
export default function Viewport() {
  return (
    <Canvas
      camera={{ position: [6, 4, 8], fov: 40, near: 0.05, far: 1000 }}
      onPointerMissed={(e) => {
        // Clicking empty space steps back out of joint posing, then clears the selection.
        if (viewportBridge.gizmoBusy || e.button !== 0 || e.ctrlKey || e.shiftKey) return
        const ui = useUi.getState()
        if (ui.selectedJoint) ui.selectJoint(null)
        else ui.select([])
      }}
    >
      <color attach="background" args={['#2a2b2f']} />

      {/* Neutral work lighting for the viewport only. Scene lights arrive in Milestone 4. */}
      <hemisphereLight args={['#ffffff', '#55575c', 1.6]} />
      <directionalLight position={[5, 10, 7]} intensity={1.4} />

      <GroundGrid />
      <SceneNodes />
      <SelectionGizmo />
      <JointGizmo />

      <OrbitControls makeDefault mouseButtons={MOUSE_BUTTONS} />
      <FrameController />

      <GizmoHelper alignment="bottom-right" margin={[64, 64]}>
        <GizmoViewport axisColors={['#e0555a', '#6fbf5a', '#4f8fe0']} labelColor="#1b1c1f" />
      </GizmoHelper>
    </Canvas>
  )
}
