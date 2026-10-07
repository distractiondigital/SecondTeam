import { useEffect, useMemo } from 'react'
import { Color, Scene } from 'three'
import { createPortal } from '@react-three/fiber'
import { activeScene, environmentFor, sceneForShot, sceneOfShot, useDocument } from '../state/documentStore'
import { useUi } from '../state/uiStore'
import GroundGrid from './GroundGrid'
import EnvironmentView, { sunOnGround } from './EnvironmentView'
import SceneNodes, { hasLights } from './SceneNodes'

// A hidden copy of the set for every shot, each showing that shot's version (Master plus the
// shot's own changes). They're never drawn on screen; ShotTracker renders thumbnails and
// measures readouts from them, and renderPasses.ts renders the passes from them.
// Unless the scene turns it off, each copy also has an endless floor at ground level.

export const BACKGROUND = '#2a2b2f'

const FLOOR_WORK_COLOR = '#3c3e44'
const FLOOR_RADIUS = 200 // metres

/** The even light of Work shading (tagged so a clay pass can switch it off). */
export function WorkLights() {
  return (
    <group userData={{ workLight: true }}>
      <hemisphereLight args={['#ffffff', '#55575c', 1.6]} />
      <directionalLight position={[5, 10, 7]} intensity={1.4} />
    </group>
  )
}

/** The automatic floor: a hair below 0 so floor planes built in the set cover it. In Clay it's the environment's ground colour. */
export function RenderFloor({ clay, ground }: { clay: boolean; ground: string }) {
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, -0.002, 0]} receiveShadow={clay} userData={{ floor: true }}>
      <circleGeometry args={[FLOOR_RADIUS, 96]} />
      <meshStandardMaterial color={clay ? ground : FLOOR_WORK_COLOR} roughness={clay ? 0.92 : 0.95} metalness={0} />
    </mesh>
  )
}

/** The hidden scene for each shot, by camera id. */
export const shotScenes = new Map<string, Scene>()

function ShotScene({ shotId }: { shotId: string }) {
  // Thumbnails show the shot lit (Clay); a scene without lights falls back to the work look.
  const clay = useDocument((s) => hasLights(sceneForShot(s, shotId)))
  const floor = useDocument((s) => sceneOfShot(s, shotId).floor)
  const env = useDocument((s) => environmentFor(s, shotId))
  const sunLight = useDocument((s) => sunOnGround(sceneForShot(s, shotId)))
  const scene = useMemo(() => {
    const s = new Scene()
    s.background = new Color(BACKGROUND)
    return s
  }, [])
  useEffect(() => {
    shotScenes.set(shotId, scene)
    return () => {
      if (shotScenes.get(shotId) === scene) shotScenes.delete(shotId)
    }
  }, [shotId, scene])

  return createPortal(
    <>
      {clay ? <EnvironmentView env={env} sunOnGround={sunLight} /> : <WorkLights />}
      {/* The floor replaces the grid (they'd flicker against each other in the distance). */}
      {floor ? <RenderFloor clay={clay} ground={env.ground} /> : <GroundGrid />}
      <SceneNodes shotId={shotId} passive clay={clay} />
    </>,
    scene
  )
}

export default function ShotScenes() {
  // The active scene's shots; on the board, every scene's (for clay pictures and clay exports).
  const allScenes = useUi((s) => s.view === 'board')
  const cameraIds = useDocument((s) =>
    (allScenes ? s.project.scenes : [activeScene(s)])
      .flatMap((scene) => Object.values(scene.nodes))
      .filter((n) => n.type === 'camera')
      .map((n) => n.id)
      .join(',')
  )
  return (
    <>
      {cameraIds
        .split(',')
        .filter(Boolean)
        .map((id) => (
          <ShotScene key={id} shotId={id} />
        ))}
    </>
  )
}
