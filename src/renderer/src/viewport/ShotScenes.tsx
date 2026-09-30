import { useEffect, useMemo } from 'react'
import { Color, Scene } from 'three'
import { createPortal } from '@react-three/fiber'
import { activeScene, sceneForShot, useDocument } from '../state/documentStore'
import GroundGrid from './GroundGrid'
import SceneNodes, { hasLights } from './SceneNodes'

// A hidden copy of the set for every shot, each showing that shot's version (Master plus the
// shot's own changes). They're never drawn on screen; ShotTracker renders thumbnails and
// measures readouts from them, and Milestone 5 renders passes from them.

export const BACKGROUND = '#2a2b2f'

/** Viewport work lights (scene lights arrive in Milestone 4). */
export function WorkLights() {
  return (
    <>
      <hemisphereLight args={['#ffffff', '#55575c', 1.6]} />
      <directionalLight position={[5, 10, 7]} intensity={1.4} />
    </>
  )
}

/** The hidden scene for each shot, by camera id. */
export const shotScenes = new Map<string, Scene>()

function ShotScene({ shotId }: { shotId: string }) {
  // Thumbnails show the shot lit (Clay); a scene without lights falls back to the work look.
  const clay = useDocument((s) => hasLights(sceneForShot(s, shotId)))
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
      {!clay && <WorkLights />}
      <GroundGrid />
      <SceneNodes shotId={shotId} passive clay={clay} />
    </>,
    scene
  )
}

export default function ShotScenes() {
  const cameraIds = useDocument((s) =>
    Object.values(activeScene(s).nodes)
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
