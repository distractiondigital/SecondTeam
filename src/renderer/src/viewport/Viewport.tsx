import { useRef } from 'react'
import { MOUSE } from 'three'
import { Canvas } from '@react-three/fiber'
import { GizmoHelper, GizmoViewport, OrbitControls } from '@react-three/drei'
import EditingBanner from '../panels/EditingBanner'
import FrameOverlay from '../panels/FrameOverlay'
import { useDocument } from '../state/documentStore'
import { useUi } from '../state/uiStore'
import FrameController from './FrameController'
import GroundGrid from './GroundGrid'
import JointGizmo from './JointGizmo'
import LookThrough from './LookThrough'
import SceneNodes from './SceneNodes'
import SelectionGizmo from './SelectionGizmo'
import ShotScenes, { BACKGROUND, WorkLights } from './ShotScenes'
import ShotTracker from './ShotTracker'
import { viewportBridge } from './viewportBridge'

// Blender-style navigation: middle-drag orbits, Shift+middle-drag pans (built into
// OrbitControls), scroll zooms. The left button is left free for selecting.
// While looking through a shot camera, LookThrough takes over the mouse and keyboard.
const NO_ACTION = -1 as MOUSE
const MOUSE_BUTTONS = { LEFT: NO_ACTION, MIDDLE: MOUSE.ROTATE, RIGHT: NO_ACTION }

// Scene units: 1 three.js unit = 1 metre. Y is up.
export default function Viewport() {
  const container = useRef<HTMLDivElement>(null)
  const lookingThrough = useUi((s) => s.lookThroughId !== null)
  const activeShotId = useDocument((s) => s.activeShotId)

  return (
    <div className={`viewport-wrap${activeShotId ? ' in-shot' : ''}`} ref={container}>
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
        <color attach="background" args={[BACKGROUND]} />
        <WorkLights />

        <GroundGrid />
        {/* The set as the shot being edited sees it (Master if none). */}
        <SceneNodes shotId={activeShotId} />
        <ShotScenes />
        <SelectionGizmo />
        <JointGizmo />

        <OrbitControls makeDefault mouseButtons={MOUSE_BUTTONS} />
        <FrameController />
        <LookThrough />
        <ShotTracker />

        {!lookingThrough && (
          <GizmoHelper alignment="bottom-right" margin={[64, 64]}>
            <GizmoViewport axisColors={['#e0555a', '#6fbf5a', '#4f8fe0']} labelColor="#1b1c1f" />
          </GizmoHelper>
        )}
      </Canvas>
      <FrameOverlay container={container} />
      <EditingBanner />
    </div>
  )
}
