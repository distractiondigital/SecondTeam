import { useEffect, useRef, useState } from 'react'
import { Euler, MathUtils, Quaternion, type Object3D } from 'three'
import { useThree } from '@react-three/fiber'
import { TransformControls } from '@react-three/drei'
import { clampJoint } from '../../../shared/mannequin'
import { drivenJoints, LIMB_ENDS, type LimbEnd } from '../../../shared/posing'
import type { Vec3 } from '../../../shared/project'
import { editedNodes, useDocument } from '../state/documentStore'
import { useUi } from '../state/uiStore'
import { lockRotationToGrid, r4, ROTATE_SNAP_DEGREES, useGridSnap } from './gizmoShared'
import { isMovable } from './SelectionGizmo'
import { viewportBridge } from './viewportBridge'

// Rotation rings on the joint being posed. Each change is snapped (if grid snapping is on),
// held inside the joint's realistic range (if the figure has limits on), written back to the
// joint so the rings visibly stop at the limit, and stored as one undo step per drag.
// In Move mode (W) a hand, foot or the hips get a grab ball instead (ReachHandles). Joints worked
// out by planted hands/feet or look-at have no rings. The rings show the drawn pose, which can
// include a look-at's share of the chest, so a drag changes the stored rotation by how far it turned.
// A planted hand or foot keeps its rings: turning them turns the plant (the arm/leg follows), so a
// hand resting on a table can still be angled without unplanting it.
export default function JointGizmo() {
  const selection = useUi((s) => s.selection)
  const joint = useUi((s) => s.selectedJoint)
  const gridSnap = useGridSnap()
  const figureId = selection.length === 1 ? selection[0] : null
  const node = useDocument((s) => (figureId ? editedNodes(s)[figureId] : undefined))
  const movable = useDocument((s) => (figureId ? isMovable(editedNodes(s), figureId) : false))
  const threeScene = useThree((s) => s.scene)
  const [object, setObject] = useState<Object3D | null>(null)
  const mode = useUi((s) => s.gizmoMode)
  const startRef = useRef<{ shown: Vec3; stored: Vec3 } | null>(null)

  useEffect(() => {
    setObject(figureId && joint && node ? (threeScene.getObjectByName(`${figureId}:${joint}`) ?? null) : null)
  }, [figureId, joint, node, threeScene])

  if (!object || !figureId || !joint || node?.type !== 'mannequin' || !movable) return null
  if (mode === 'translate' && /^(wrist|ankle|pelvis)/.test(joint)) return null
  const planted = (LIMB_ENDS as string[]).includes(joint) && node.plants?.[joint as LimbEnd] ? (joint as LimbEnd) : null
  if (!planted && drivenJoints(node.plants, node.lookAt !== null).has(joint)) return null

  /** A planted hand/foot: its turn in the figure's space becomes the plant's. */
  const copyToPlant = (end: LimbEnd) => {
    if (gridSnap) lockRotationToGrid(object.rotation)
    const figure = figureRoot(object, figureId)
    const now = editedNodes(useDocument.getState())[figureId]
    if (!figure || now?.type !== 'mannequin' || !now.plants[end]) return
    const q = figure.getWorldQuaternion(new Quaternion()).invert().multiply(object.getWorldQuaternion(new Quaternion()))
    const e = new Euler().setFromQuaternion(q, 'XYZ')
    const rotation = [e.x, e.y, e.z].map((r) => r4(MathUtils.radToDeg(r))) as Vec3
    useDocument.getState().updatePose(figureId, { plants: { ...now.plants, [end]: { ...now.plants[end], rotation } } })
  }

  const copyToDocument = () => {
    if (gridSnap) lockRotationToGrid(object.rotation)
    let degrees = [object.rotation.x, object.rotation.y, object.rotation.z].map((r) =>
      r4(MathUtils.radToDeg(r))
    ) as Vec3
    const start = startRef.current
    if (start) degrees = degrees.map((d, i) => r4(start.stored[i] + d - start.shown[i])) as Vec3
    if (node.limits) {
      degrees = clampJoint(joint, degrees)
      // Back onto the rings as drawn (the stored rotation plus whatever look-at adds).
      const shown = degrees.map((d, i) => (start ? d + start.shown[i] - start.stored[i] : d))
      object.rotation.set(...(shown.map((d) => MathUtils.degToRad(d)) as Vec3))
    }
    useDocument.getState().setJointRotation(figureId, joint, degrees)
  }

  return (
    <TransformControls
      object={object}
      mode="rotate"
      space="local"
      size={0.7}
      rotationSnap={gridSnap ? MathUtils.degToRad(ROTATE_SNAP_DEGREES) : null}
      onMouseDown={() => {
        viewportBridge.gizmoBusy = true
        startRef.current = {
          shown: [object.rotation.x, object.rotation.y, object.rotation.z].map((r) => MathUtils.radToDeg(r)) as Vec3,
          stored: node.pose.joints[joint]
        }
        useDocument.getState().beginGesture('joint')
      }}
      onObjectChange={() => (planted ? copyToPlant(planted) : copyToDocument())}
      onMouseUp={() => {
        if (planted) copyToPlant(planted)
        else copyToDocument()
        startRef.current = null
        useDocument.getState().endGesture('joint')
        setTimeout(() => (viewportBridge.gizmoBusy = false), 0)
      }}
    />
  )
}

/** The figure's own space: the group its joints hang from (the pelvis's parent). */
function figureRoot(joint: Object3D, figureId: string): Object3D | null {
  let o: Object3D | null = joint
  while (o && o.name !== `${figureId}:pelvis`) o = o.parent
  return o?.parent ?? null
}
