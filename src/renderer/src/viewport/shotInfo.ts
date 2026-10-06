import { Box3, Euler, MathUtils, Matrix4, Mesh, Quaternion, Raycaster, Vector3, type Object3D } from 'three'
import { cameraAngle, fieldOfView, opticsFor, shotSize, type CameraKit, type ShotSize } from '../../../shared/camera'
import type { CameraNode, Scene, Vec3 } from '../../../shared/project'
import { DEFAULT_ENVIRONMENT, fogPhrase, timePhrase } from '../../../shared/environment'
import { describeLighting, type LightSample } from '../../../shared/lighting'

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
  /** Where auto focus focuses (metres along the lens axis): the subject's nearer eye if it's clearly in frame, else the middle of the frame; null = infinity. */
  subjectDepth: number | null
  size: ShotSize | null
  angle: string
  /** e.g. 'Soft key light from camera left, warm tungsten' ('' when the scene has no lights). */
  lighting: string
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
  /** Where auto focus focuses: the eyes for a figure (the nearer one wins), else the middle. */
  focusPoints: Vector3[]
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
    const eyes = [eyeL.getWorldPosition(new Vector3()), eyeR.getWorldPosition(new Vector3())]
    return { id, name: node.name, point, size: node.height, eyeY: point.y, focusPoints: eyes }
  }
  const box = new Box3()
  object.traverseVisible((o) => {
    if (o instanceof Mesh && !o.userData.helper) box.expandByObject(o)
  })
  if (box.isEmpty()) return null
  const point = box.getCenter(new Vector3())
  return { id, name: node.name, point, size: box.max.y - box.min.y, eyeY: null, focusPoints: [point] }
}

/** Shows in renders: it and everything it sits in are visible, and none of them is a viewport helper. */
export function rendered(o: Object3D): boolean {
  for (let p: Object3D | null = o; p; p = p.parent) {
    if (!p.visible || p.userData.helper || (p as { isTransformControls?: boolean }).isTransformControls) return false
  }
  return true
}

/** Auto focus only trusts an eye inside this central part of the frame (each way). */
const FOCUS_SAFE_AREA = 0.75
/** An eye counts as hidden when something is this much closer than it along the line of sight (m). */
const EYE_HIDDEN_MARGIN = 0.1

/** The first surface a ray meets in what renders (no helpers, nothing hidden), or null. */
function firstHit(three: Object3D, from: Vector3, direction: Vector3): number | null {
  const ray = new Raycaster(from, direction.clone().normalize(), 0.05, 1000)
  const hit = ray.intersectObject(three, true).find((h) => (h as { object: { isMesh?: boolean } }).object.isMesh && rendered(h.object))
  return hit ? hit.distance : null
}

/**
 * Where auto focus lands (metres along the lens axis): the nearer of the subject's focus points
 * (a figure's eyes) that sits inside the safe area of the frame and isn't hidden; otherwise whatever
 * is under the centre of the frame; null (infinity) if that's empty sky.
 */
function autoFocusDepth(
  three: Object3D,
  points: Vector3[],
  pose: { position: Vector3; quaternion: Quaternion },
  toCamera: Matrix4,
  tanH: number,
  tanV: number
): number | null {
  let best: number | null = null
  for (const point of points) {
    const p = point.clone().applyMatrix4(toCamera)
    const depth = -p.z
    if (depth <= 0.05 || Math.abs(p.x) > depth * tanH * FOCUS_SAFE_AREA || Math.abs(p.y) > depth * tanV * FOCUS_SAFE_AREA) continue
    const toward = point.clone().sub(pose.position)
    const hit = firstHit(three, pose.position, toward)
    if (hit !== null && hit < toward.length() - EYE_HIDDEN_MARGIN) continue
    if (best === null || depth < best) best = depth
  }
  if (best !== null) return best
  return firstHit(three, pose.position, new Vector3(0, 0, -1).applyQuaternion(pose.quaternion))
}

export function computeShotInfo(scene: Scene, camera: CameraNode, kit: CameraKit, three: Object3D): ShotInfo | null {
  const object = three.getObjectByName(camera.id)
  if (!object) return null
  const pose = cameraPose(object)
  const fov = fieldOfView(opticsFor(kit, camera.focalLength))
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
  let subjectDepth: number | null = null
  let size: ShotSize | null = null
  if (subject) {
    distance = subject.point.distanceTo(pose.position)
    const depth = Math.max(0.05, -subject.point.clone().applyMatrix4(toCamera).z)
    size = shotSize(2 * depth * tanV, subject.size)
  }

  // Auto focus: the eye nearest the lens, like a focus puller would, when it's clearly in frame;
  // else whatever is in the middle of the frame.
  subjectDepth = autoFocusDepth(three, subject?.focusPoints ?? [], pose, toCamera, tanH, tanV)

  // Lighting, measured at the subject (or 3 m in front of the lens) as seen from this camera.
  const forward = new Vector3(0, 0, -1).applyQuaternion(pose.quaternion)
  const right = new Vector3(1, 0, 0).applyQuaternion(pose.quaternion)
  const measureAt = subject?.point ?? pose.position.clone().addScaledVector(forward, 3)
  const samples: LightSample[] = []
  for (const n of Object.values(scene.nodes)) {
    if (n.type !== 'light' || n.hidden) continue
    const o = three.getObjectByName(n.id)
    if (!o) continue
    const q = new Quaternion()
    const p = new Vector3()
    o.updateWorldMatrix(true, false)
    o.matrixWorld.decompose(p, q, new Vector3())
    samples.push({
      id: n.id,
      kind: n.kind,
      position: p.toArray() as Vec3,
      direction: new Vector3(0, 0, -1).applyQuaternion(q).toArray() as Vec3,
      stops: n.stops,
      kelvin: n.kelvin,
      softness: n.softness,
      coneAngle: n.coneAngle,
      falloff: n.falloff
    })
  }
  const fromLights = describeLighting(samples, measureAt.toArray() as Vec3, {
    forward: forward.toArray() as Vec3,
    right: right.toArray() as Vec3
  })
  // The time of day comes first ("At sunset, warm golden-hour light, soft key light from…").
  const env = camera.environment ?? scene.environment ?? DEFAULT_ENVIRONMENT
  const time = timePhrase(env.time)
  const lighting = [time.charAt(0).toUpperCase() + time.slice(1), fogPhrase(env.fog ?? 0), fromLights.charAt(0).toLowerCase() + fromLights.slice(1)]
    .filter(Boolean)
    .join(', ')

  return {
    lighting,
    height: pose.position.y,
    pan: pose.pan,
    tilt: pose.tilt,
    roll: pose.roll,
    subjectId: subject?.id ?? null,
    subjectName: subject?.name ?? null,
    distance,
    subjectDepth,
    size,
    angle: cameraAngle(pose.tilt, pose.position.y, subject?.eyeY ?? null, pose.roll)
  }
}
