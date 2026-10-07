import { useRef } from 'react'
import { MOUSE } from 'three'
import { Canvas } from '@react-three/fiber'
import { GizmoHelper, GizmoViewport, OrbitControls } from '@react-three/drei'
import EditingBanner from '../panels/EditingBanner'
import { StartScreen } from '../panels/RecentProjects'
import FrameOverlay from '../panels/FrameOverlay'
import PassViewer from '../panels/PassViewer'
import ShotPip from '../panels/ShotPip'
import TakeViewer from '../panels/TakeViewer'
import { activeScene, editedNodes, environmentFor, useDocument } from '../state/documentStore'
import { useUi } from '../state/uiStore'
import FrameController from './FrameController'
import GroundGrid from './GroundGrid'
import JointGizmo from './JointGizmo'
import LookThrough from './LookThrough'
import { installSoftShadows } from './softShadows'
import LiveClayPost from './LiveClayPost'
import PipRender from './PipRender'
import FocusPick from './FocusPick'
import SceneNodes, { hasLights } from './SceneNodes'
import SelectionGizmo from './SelectionGizmo'
import EnvironmentView, { sunOnGround } from './EnvironmentView'
import BoxSelect from './BoxSelect'
import FreeFly from './FreeFly'
import ViewNav from './ViewNav'
import LightAim from './LightAim'
import ReachHandles from './ReachHandles'
import ShotScenes, { BACKGROUND, RenderFloor, WorkLights } from './ShotScenes'
import RendererHandle from './RendererHandle'
import ShotTracker from './ShotTracker'
import { viewportBridge } from './viewportBridge'
import { addKey } from '../platform'

// Blender-style navigation: middle-drag orbits, Shift+middle-drag pans (built into
// OrbitControls), scroll zooms; hold the right button to fly (FreeFly). The left button selects
// (click, or drag a box).
// While looking through a shot camera, LookThrough takes over the mouse and keyboard.
const NO_ACTION = -1 as MOUSE
const MOUSE_BUTTONS = { LEFT: NO_ACTION, MIDDLE: MOUSE.ROTATE, RIGHT: NO_ACTION }

// Scene units: 1 three.js unit = 1 metre. Y is up.
// Light-size soft shadows replace three's plain shadow filtering (before anything compiles).
installSoftShadows()

export default function Viewport() {
  const container = useRef<HTMLDivElement>(null)
  const lookingThrough = useUi((s) => s.lookThroughId !== null)
  const activeShotId = useDocument((s) => s.activeShotId)
  const clay = useUi((s) => s.shading === 'clay')
  const lit = useDocument((s) => hasLights(editedNodes(s)))
  const sunLight = useDocument((s) => sunOnGround(editedNodes(s)))
  const env = useDocument((s) => environmentFor(s, s.activeShotId))
  const floor = useDocument((s) => activeScene(s).floor)
  const pip = useUi((s) => s.pipElement !== null)

  return (
    <div className={`viewport-wrap${activeShotId ? ' in-shot' : ''}`} ref={container}>
      <Canvas
        shadows="basic"
        camera={{ position: [6, 4, 8], fov: 40, near: 0.05, far: 1000 }}
        onPointerMissed={(e) => {
          // Clicking empty space steps back out of joint posing, then clears the selection.
          if (viewportBridge.gizmoBusy || viewportBridge.boxSelecting || viewportBridge.suppressClick || e.button !== 0 || addKey(e) || e.shiftKey) return
          const ui = useUi.getState()
          if (ui.selectedJoint) ui.selectJoint(null)
          else ui.select([])
        }}
      >
        <color attach="background" args={[BACKGROUND]} />
        {/* Work shading: even work light. Clay: the scene's lights plus the environment's sky and
            fill (a dim fill if there are no lights), standing on the ground colour. */}
        {!clay && <WorkLights />}
        {clay && lit && <EnvironmentView env={env} sunOnGround={sunLight} />}
        {clay && !lit && <hemisphereLight args={['#ffffff', '#444444', 0.6]} />}

        {clay && lit && floor ? <RenderFloor clay ground={env.ground} /> : <GroundGrid />}
        {/* The set as the shot being edited sees it (Master if none). */}
        <SceneNodes shotId={activeShotId} clay={clay} />
        <ShotScenes />
        <SelectionGizmo />
        <JointGizmo />
        <BoxSelect />
        <LightAim />
        <ReachHandles />

        <OrbitControls makeDefault mouseButtons={MOUSE_BUTTONS} />
        <FrameController />
        <LookThrough />
        <LiveClayPost />
        <FocusPick />
        <FreeFly />
        <ViewNav />
        <ShotTracker />
        <RendererHandle />
        {pip && <PipRender />}

        {!lookingThrough && (
          // In Clay the Clay post (LiveClayPost) has drawn the set already: at priority 2 the gizmo
          // only draws itself on top (at 1 it would draw the whole set again first).
          <GizmoHelper alignment="bottom-right" margin={[64, 64]} renderPriority={clay ? 2 : 1}>
            <GizmoViewport axisColors={['#e0555a', '#6fbf5a', '#4f8fe0']} labelColor="#1b1c1f" />
          </GizmoHelper>
        )}
      </Canvas>
      <FrameOverlay container={container} />
      <EditingBanner />
      <ShotPip />
      <PassViewer />
      <TakeViewer />
      <StartScreen />
      {clay && !lit && <div className="viewport-note">No lights in this scene: add one from the toolbar.</div>}
    </div>
  )
}
