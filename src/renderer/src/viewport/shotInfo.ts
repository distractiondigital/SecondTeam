import { Box3, Euler, MathUtils, Matrix4, Mesh, Quaternion, Vector3, type Object3D } from 'three'
import { cameraAngle, fieldOfView, shotSize, type ShotSize } from '../../../shared/camera'
import type { CameraNode, Scene } from '../../../shared/project'

// Live readouts for a shot camera, measured from the rendered 3D scene (so posed and grouped
// figures are exact): camera height, tilt, roll, distance to the subject, and the shot-size /
// angle words that later feed the AI prompt.

export interface ShotInfo {
  /** Lens height above the floor (metres). */
  height: number
  pan: number
  tilt: number
  roll: number
  subjectId: string | null
  subjectName: string | null
  /** Straight-line distance from the lens to the subject (metres). */
  distance: number | null
  size: ShotSize | null
  angle: string
}

/** World position, pan/tilt/roll (degrees) of a rendered camera object. */
export function cameraPose(object: Object3D) {
  object.updateWorldMatrix(true, false)
  const position = new Vector3()
  const quaternion = new Quaternion()
  object.matrixWorld.decompose(position, quaternion, new Vector3())
  const e = new Euler().setFromQuaternion(quaternion, 'YXZ')
  return {
    position,
    quaternion,
    pan: MathUtils.radToDeg(e.y),
    tilt: MathUtils.radToDeg(e.x),
    roll: -MathUtils.radToDeg(e.z)
  }
}

interface SubjectPoint {
  id: string
  name: string
  /** The point to measure to: a figure's eyes, or an object's centre. */
  point: Vector3
  /** Height used for shot size: a figure's height, or an object's height. */
  size: number
  /** Eye height for the camera angle (figures only). */
  eyeY: number | null
}

function subjectPoint(scene: Scene, id: string, three: Object3D): SubjectPoint | null {
  const node = scene.nodes[id]
  const object = three.getObjectByName(id)
  if (!node || !object || node.type === 'camera') return null
  if (node.type === 'mannequin') {
    const eyeL = three.getObjectByName(`${id}:kp:eyeL`)
    const eyeR = three.getObjectByName(`${id}:kp:eyeR`)
    if (!eyeL || !eyeR) return null
    const point = eyeL.getWorldPosition(new Vector3()).add(eyeR.getWorldPosition(new Vector3())).multiplyScalar(0.5)
    return { id, name: node.name, point, size: node.height, eyeY: point.y }
  }
  const box = new Box3()
  object.traverseVisible((o) => {
    if (o instanceof Mesh && !o.userData.helper) box.expandByObject(o)
  })
  if (box.isEmpty()) return null
  const point = box.getCenter(new Vector3())
  return { id, name: node.name, point, size: box.max.y - box.min.y, eyeY: null }
}

export function computeShotInfo(scene: Scene, camera: CameraNode, three: Object3D): ShotInfo | null {
  const object = three.getObjectByName(camera.id)
  if (!object) return null
  const pose = cameraPose(object)
  const fov = fieldOfView(camera)
  const toCamera = new Matrix4().compose(pose.position, pose.quaternion, new Vector3(1, 1, 1)).invert()
  const tanH = Math.tan(MathUtils.degToRad(fov.horizontal / 2))
  const tanV = Math.tan(MathUtils.degToRad(fov.vertical / 2))

  // The subject: the one chosen, or the nearest visible figure whose eyes are in frame.
  let subject: SubjectPoint | null = null
  if (camera.subjectId) {
    subject = subjectPoint(scene, camera.subjectId, three)
  } else {
    let best = Number.POSITIVE_INFINITY
    for (const n of Object.values(scene.nodes)) {
      if (n.type !== 'mannequin' || n.hidden) continue
      const s = subjectPoint(scene, n.id, three)
      if (!s) continue
      const p = s.point.clone().applyMatrix4(toCamera)
      const depth = -p.z
      if (depth <= 0.05 || Math.abs(p.x) > depth * tanH || Math.abs(p.y) > depth * tanV) continue
      if (depth < best) {
        best = depth
        subject = s
      }
    }
  }

  let distance: number | null = null
  let size: ShotSize | null = null
  if (subject) {
    distance = subject.point.distanceTo(pose.position)
    const depth = Math.max(0.05, -subject.point.clone().applyMatrix4(toCamera).z)
    size = shotSize(2 * depth * tanV, subject.size)
  }

  return {
    height: pose.position.y,
    pan: pose.pan,
    tilt: pose.tilt,
    roll: pose.roll,
    subjectId: subject?.id ?? null,
    subjectName: subject?.name ?? null,
    distance,
    size,
    angle: cameraAngle(pose.tilt, pose.position.y, subject?.eyeY ?? null, pose.roll)
  }
}
