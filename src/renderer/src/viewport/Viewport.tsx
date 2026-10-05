import { useRef } from 'react'
import { MOUSE } from 'three'
import { Canvas } from '@react-three/fiber'
import { GizmoHelper, GizmoViewport, OrbitControls } from '@react-three/drei'
import EditingBanner from '../panels/EditingBanner'
import FrameOverlay from '../panels/FrameOverlay'
import PassViewer from '../panels/PassViewer'
import TakeViewer from '../panels/TakeViewer'
import { activeScene, editedNodes, environmentFor, useDocument } from '../state/documentStore'
import { useUi } from '../state/uiStore'
import FrameController from './FrameController'
import GroundGrid from './GroundGrid'
import JointGizmo from './JointGizmo'
import LookThrough from './LookThrough'
import SceneNodes, { hasLights } from './SceneNodes'
import SelectionGizmo from './SelectionGizmo'
import EnvironmentView from './EnvironmentView'
import ShotScenes, { BACKGROUND, RenderFloor, WorkLights } from './ShotScenes'
import RendererHandle from './RendererHandle'
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
  const clay = useUi((s) => s.shading === 'clay')
  const lit = useDocument((s) => hasLights(editedNodes(s)))
  const env = useDocument((s) => environmentFor(s, s.activeShotId))
  const floor = useDocument((s) => activeScene(s).floor)

  return (
    <div className={`viewport-wrap${activeShotId ? ' in-shot' : ''}`} ref={container}>
      <Canvas
        shadows="variance"
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
        {/* Work shading: even work light. Clay: the scene's lights plus the environment's sky and
            fill (a dim fill if there are no lights), standing on the ground colour. */}
        {!clay && <WorkLights />}
        {clay && lit && <EnvironmentView env={env} />}
        {clay && !lit && <hemisphereLight args={['#ffffff', '#444444', 0.6]} />}

        {clay && lit && floor ? <RenderFloor clay ground={env.ground} /> : <GroundGrid />}
        {/* The set as the shot being edited sees it (Master if none). */}
        <SceneNodes shotId={activeShotId} clay={clay} />
        <ShotScenes />
        <SelectionGizmo />
        <JointGizmo />

        <OrbitControls makeDefault mouseButtons={MOUSE_BUTTONS} />
        <FrameController />
        <LookThrough />
        <ShotTracker />
        <RendererHandle />

        {!lookingThrough && (
          <GizmoHelper alignment="bottom-right" margin={[64, 64]}>
            <GizmoViewport axisColors={['#e0555a', '#6fbf5a', '#4f8fe0']} labelColor="#1b1c1f" />
          </GizmoHelper>
        )}
      </Canvas>
      <FrameOverlay container={container} />
      <EditingBanner />
      <PassViewer />
      <TakeViewer />
      {clay && !lit && <div className="viewport-note">No lights in this scene: add one from the toolbar.</div>}
    </div>
  )
}
