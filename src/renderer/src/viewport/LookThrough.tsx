import { useEffect } from 'react'
import { type PerspectiveCamera } from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { opticsFor } from '../../../shared/camera'
import { activeScene, useDocument } from '../state/documentStore'
import { useUi } from '../state/uiStore'
import { cameraPose } from './shotInfo'
import { viewFit } from './viewFit'
import { poseQuaternion, useShotFly } from './useShotFly'

// Looking through a shot camera. The viewport's own camera copies the shot camera every frame
// (with a wider field of view so the frame fits with a margin; FrameOverlay draws the frame).
// The mouse and keyboard steer the shot camera (useShotFly.ts has the controls).

interface OrbitLike {
  enabled: boolean
  update: () => void
}

const lookId = () => useUi.getState().lookThroughId

export default function LookThrough() {
  const lookThroughId = useUi((s) => s.lookThroughId)
  const exists = useDocument((s) => (lookThroughId ? activeScene(s).nodes[lookThroughId]?.type === 'camera' : false))
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const controls = useThree((s) => s.controls) as unknown as OrbitLike | null
  const scene = useThree((s) => s.scene)
  const gl = useThree((s) => s.gl)
  const size = useThree((s) => s.size)
  const working = useShotFly({ element: lookThroughId ? gl.domElement : null, shotId: lookId, rollAnytime: true })

  // Leave camera view if the camera is deleted (or undone away).
  useEffect(() => {
    if (lookThroughId && !exists) useUi.getState().setLookThrough(null)
  }, [lookThroughId, exists])

  // Save the free view on entry and restore it on exit.
  useEffect(() => {
    if (!lookThroughId) return
    const saved = { position: camera.position.clone(), quaternion: camera.quaternion.clone(), fov: camera.fov }
    if (controls) controls.enabled = false
    return () => {
      camera.position.copy(saved.position)
      camera.quaternion.copy(saved.quaternion)
      camera.fov = saved.fov
      camera.near = 0.05
      camera.updateProjectionMatrix()
      if (controls) {
        controls.enabled = true
        controls.update()
      }
    }
  }, [lookThroughId, camera, controls])

  useFrame(() => {
    const id = lookId()
    if (!id) return
    const node = activeScene(useDocument.getState()).nodes[id]
    const object = scene.getObjectByName(id)
    if (node?.type !== 'camera' || !object) return
    // Show the view from the shot camera (from the move in progress, if there is one).
    const w = working.current
    if (w) {
      camera.position.copy(w.position)
      camera.quaternion.copy(poseQuaternion(w))
    } else {
      const pose = cameraPose(object)
      camera.position.copy(pose.position)
      camera.quaternion.copy(pose.quaternion)
    }
    const kit = useDocument.getState().project.camera
    camera.fov = viewFit(opticsFor(kit, node.focalLength), size.width, size.height).verticalFov
    camera.aspect = size.width / Math.max(1, size.height)
    camera.near = 0.02
    camera.updateProjectionMatrix()
  })

  return null
}
