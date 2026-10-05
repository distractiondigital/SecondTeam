import { useRef, type ReactElement } from 'react'
import { Matrix4, Plane, Quaternion, Raycaster, Vector3, type Object3D } from 'three'
import { useThree } from '@react-three/fiber'
import type { JointName, Pose, Proportions } from '../../../shared/mannequin'
import { chainOf, degrees, effectivePose, forwardKinematics, LIMB_ENDS, solveReach, type LimbEnd, type Plants } from '../../../shared/posing'
import type { MannequinNode, Vec3 } from '../../../shared/project'
import { worldMatrix } from '../../../shared/transforms'
import { editedNodes, useDocument } from '../state/documentStore'
import { useUi } from '../state/uiStore'
import { figureProportions } from './figurePose'
import GrabHandle, { type GrabMove } from './GrabHandle'
import { isMovable } from './SelectionGizmo'
import { setSurfaces } from './surfaces'

// Posing 2 in the viewport: grab balls on the selected figure's hand, foot or hips (Move mode, W),
// and on its look-at point. Dragging a hand or foot bends the limb to reach it (shared/posing.ts);
// near a surface it snaps on (a foot flat on it, a palm against it) and stays planted there when
// let go. Dragging the hips moves them; planted hands and feet hold their spots.

const SNAP_DISTANCE = 0.5 // metres between the free point and the surface under the cursor
const GROUND = new Plane(new Vector3(0, 1, 0), 0)

const isEnd = (joint: JointName | null): joint is LimbEnd => LIMB_ENDS.includes(joint as LimbEnd)

interface DragStart {
  node: MannequinNode
  p: Proportions
  /** The figure's own space → world. */
  world: Matrix4
  toFigure: Matrix4
  turn: Quaternion
  /** The pose as drawn when the drag began (plants applied), for which way elbows/knees bend. */
  pose: Pose
}

export default function ReachHandles() {
  const selection = useUi((s) => s.selection)
  const joint = useUi((s) => s.selectedJoint)
  const mode = useUi((s) => s.gizmoMode)
  const lookId = useUi((s) => s.lookThroughId)
  const figureId = selection.length === 1 ? selection[0] : null
  const node = useDocument((s) => (figureId ? editedNodes(s)[figureId] : undefined))
  const movable = useDocument((s) => (figureId ? isMovable(editedNodes(s), figureId) : false))
  const scene = useThree((s) => s.scene)
  const start = useRef<DragStart | null>(null)

  if (!figureId || node?.type !== 'mannequin' || !movable || lookId === figureId) return null

  const begin = (): DragStart | null => {
    const n = editedNodes(useDocument.getState())[figureId]
    if (n?.type !== 'mannequin') return null
    const p = figureProportions(n)
    if (!p) return null
    const world = worldMatrix(editedNodes(useDocument.getState()), figureId)
    return {
      node: n,
      p,
      world,
      toFigure: world.clone().invert(),
      turn: new Quaternion().setFromRotationMatrix(world),
      pose: effectivePose(n, p, null)
    }
  }

  /** Where a joint is drawn now (world). */
  const jointAt = (j: JointName) => () => scene.getObjectByName(`${figureId}:${j}`)?.getWorldPosition(new Vector3()) ?? null

  const handles: ReactElement[] = []

  // A hand or foot: reach, snap, plant.
  if (isEnd(joint) && mode === 'translate') {
    const end = joint
    const arm = end.startsWith('wrist')
    const onMove = ({ point, ray, snap }: GrabMove): boolean => {
      const s = start.current
      if (!s) return false
      const frames = forwardKinematics(s.pose, s.p)
      // The hand/foot's turn in the world as it is now.
      const endWorldRot = s.turn.clone().multiply(frames[end].rotation)
      let target = point.clone()
      let endRotation: Quaternion | undefined
      let snapped = false
      if (snap) {
        const hit = surfaceUnder(ray, scene, figureId)
        // Near the dragged point, or anywhere the limb can reach (the drag plane faces the camera,
        // so from a high angle the surface under the cursor can be well behind or in front of it).
        const root = frames[chainOf(end)[0]].position.clone().applyMatrix4(s.world)
        const length = arm ? s.p.upperArm + s.p.forearm : s.p.hipY - s.p.ankleY
        if (hit && (hit.point.distanceTo(point) < SNAP_DISTANCE || hit.point.distanceTo(root) < length * 1.02)) {
          snapped = true
          const n = hit.normal
          if (arm) {
            // Palm flat against the surface: the palm faces the body at rest (-X on the left hand).
            const palm = new Vector3(end === 'wristL' ? -1 : 1, 0, 0).applyQuaternion(endWorldRot)
            const turned = new Quaternion().setFromUnitVectors(palm, n.clone().negate()).multiply(endWorldRot)
            const palmCentre = hit.point.clone().addScaledVector(n, s.p.forearmRadius * 0.6)
            target = palmCentre.sub(new Vector3(0, -s.p.hand * 0.5, 0).applyQuaternion(turned))
            endRotation = turned
          } else {
            // Sole flat on the surface, the ankle its own height above it.
            const up = new Vector3(0, 1, 0).applyQuaternion(endWorldRot)
            endRotation = new Quaternion().setFromUnitVectors(up, n).multiply(endWorldRot)
            target = hit.point.clone().addScaledVector(n, s.p.ankleY)
          }
        }
      }
      const local = target.applyMatrix4(s.toFigure)
      const localRot = endRotation ? s.turn.clone().invert().multiply(endRotation) : undefined
      const joints = solveReach(s.pose, s.p, end, local, { limits: s.node.limits, endRotation: localRot })
      // Left on a surface it's planted there; left in mid-air it just follows the body.
      const plants: Plants = { ...s.node.plants }
      if (snapped) {
        // Where it actually got to (joint limits can stop it short of the surface).
        const reached = forwardKinematics({ ...s.pose, joints: { ...s.pose.joints, ...joints } }, s.p)[end]
        plants[end] = { position: reached.position.toArray().map((v) => Math.round(v * 10000) / 10000) as Vec3, rotation: degrees(reached.rotation) }
      } else delete plants[end]
      useDocument.getState().updatePose(figureId, { joints, plants })
      return snapped
    }
    handles.push(
      <GrabHandle
        key={end}
        at={jointAt(end)}
        snapping
        onStart={() => (start.current = begin())}
        onMove={onMove}
        onEnd={() => (start.current = null)}
      />
    )
  }

  // The hips: move them; planted hands and feet hold their spots (worked out when drawing).
  if (joint === 'pelvis' && mode === 'translate') {
    handles.push(
      <GrabHandle
        key="pelvis"
        at={jointAt('pelvis')}
        onStart={() => (start.current = begin())}
        onMove={({ point }) => {
          const s = start.current
          if (!s) return false
          const local = point.clone().applyMatrix4(s.toFigure)
          const h = s.p.height
          useDocument.getState().updatePose(figureId, { pelvisOffset: [local.x / h, (local.y - s.p.pelvisY) / h, local.z / h] })
          return false
        }}
        onEnd={() => (start.current = null)}
      />
    )
  }

  // A look-at point: while the figure is selected.
  if (!joint && node.lookAt?.kind === 'point') {
    const at = new Vector3(...node.lookAt.position)
    handles.push(
      <GrabHandle
        key="look"
        at={() => at}
        onStart={() => undefined}
        onMove={({ point }) => {
          useDocument.getState().updateNode(figureId, { lookAt: { kind: 'point', position: point.toArray().map((v) => Math.round(v * 1000) / 1000) as Vec3 } })
          return false
        }}
        onEnd={() => undefined}
      />
    )
  }

  return <>{handles}</>
}

/** The first surface under the cursor (the set, then the floor), with its world normal. */
function surfaceUnder(ray: { origin: Vector3; direction: Vector3 }, scene: Object3D, figureId: string): { point: Vector3; normal: Vector3 } | null {
  const caster = new Raycaster(ray.origin, ray.direction)
  const nodes = editedNodes(useDocument.getState())
  const hit = caster.intersectObjects(setSurfaces(scene, nodes, [figureId]), false)[0]
  const ground = ray.direction.y < 0 ? caster.ray.intersectPlane(GROUND, new Vector3()) : null
  if (hit && hit.face && (!ground || hit.distance < ground.distanceTo(ray.origin))) {
    const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize()
    // Face the cursor's side of the surface.
    if (normal.dot(ray.direction) > 0) normal.negate()
    return { point: hit.point.clone(), normal }
  }
  return ground ? { point: ground, normal: new Vector3(0, 1, 0) } : null
}
