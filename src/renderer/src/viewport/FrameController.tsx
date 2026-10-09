import { useEffect } from 'react'
import { Box3, Euler, MathUtils, Mesh, PerspectiveCamera, Raycaster, Sphere, Vector2, Vector3 } from 'three'
import type { Vec3 } from '../../../shared/project'
import { useThree } from '@react-three/fiber'
import { activeScene, editedNodes, useDocument } from '../state/documentStore'
import { dropPoint, type DropHit } from '../../../shared/placement'
import { setSurfaces } from './surfaces'
import { useUi } from '../state/uiStore'
import { viewportBridge } from './viewportBridge'

const EMPTY_VIEW_DISTANCE = 12

/** The parts of OrbitControls this component uses. */
interface OrbitLike {
  target: Vector3
  update: () => void
}

// Handles "frame selected" (F) and tells the toolbar where new things go (in front of the view).
export default function FrameController() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const controls = useThree((s) => s.controls) as unknown as OrbitLike | null
  const threeScene = useThree((s) => s.scene)
  const frameRequest = useUi((s) => s.frameRequest)

  useEffect(() => {
    viewportBridge.getDropPoint = () => {
      // What the middle of the view looks at (shared/placement.ts decides from there).
      const ray = new Raycaster()
      ray.setFromCamera(new Vector2(0, 0), camera)
      const surfaces = setSurfaces(threeScene, editedNodes(useDocument.getState()))
      const first = ray.intersectObjects(surfaces, false)[0]
      let hit: DropHit | null = null
      if (first) {
        const normal = first.face ? first.face.normal.clone().transformDirection(first.object.matrixWorld) : new Vector3(0, 1, 0)
        if (normal.dot(ray.ray.direction) > 0) normal.negate()
        hit = { point: first.point.toArray() as Vec3, distance: first.distance, normal: normal.toArray() as Vec3 }
      }
      return dropPoint(ray.ray.origin.toArray() as Vec3, ray.ray.direction.toArray() as Vec3, hit)
    }
    viewportBridge.getViewPose = () => {
      const e = new Euler().setFromQuaternion(camera.quaternion, 'XYZ')
      return {
        position: camera.position.toArray() as Vec3,
        rotation: [e.x, e.y, e.z].map((r) => MathUtils.radToDeg(r)) as Vec3
      }
    }
  }, [controls, camera, threeScene])

  useEffect(() => {
    if (frameRequest === 0 || !controls) return
    const boundsOf = (ids: string[]) => {
      const box = new Box3()
      for (const id of ids) {
        const object = threeScene.getObjectByName(id)
        object?.traverseVisible((child) => {
          if (child instanceof Mesh && !child.userData.helper) box.expandByObject(child)
        })
      }
      return box
    }
    // Frame the selection; if nothing (visible) is selected, frame everything.
    let box = boundsOf(useUi.getState().selection)
    if (box.isEmpty()) box = boundsOf(activeScene(useDocument.getState()).rootIds)

    const direction = camera.position.clone().sub(controls.target).normalize()
    if (box.isEmpty()) {
      controls.target.set(0, 0, 0)
      camera.position.copy(direction.multiplyScalar(EMPTY_VIEW_DISTANCE))
    } else {
      const sphere = box.getBoundingSphere(new Sphere())
      const radius = Math.max(sphere.radius, 0.25)
      const fov = (camera.fov * Math.PI) / 180
      const distance = (radius / Math.sin(Math.min(fov, fov * camera.aspect) / 2)) * 1.15
      controls.target.copy(sphere.center)
      camera.position.copy(sphere.center.clone().add(direction.multiplyScalar(distance)))
    }
    camera.near = 0.05
    camera.updateProjectionMatrix()
    controls.update()
  }, [frameRequest, controls, camera, threeScene])

  return null
}
