import { useEffect, useState } from 'react'
import { MathUtils, type Object3D } from 'three'
import { useThree } from '@react-three/fiber'
import { TransformControls } from '@react-three/drei'
import { clampJoint } from '../../../shared/mannequin'
import type { Vec3 } from '../../../shared/project'
import { editedNodes, useDocument } from '../state/documentStore'
import { useUi } from '../state/uiStore'
import { lockRotationToGrid, r4, ROTATE_SNAP_DEGREES, useGridSnap } from './gizmoShared'
import { isMovable } from './SelectionGizmo'
import { viewportBridge } from './viewportBridge'

// Rotation rings on the joint being posed. Each change is snapped (if grid snapping is on),
// held inside the joint's realistic range (if the figure has limits on), written back to the
// joint so the rings visibly stop at the limit, and stored as one undo step per drag.
export default function JointGizmo() {
  const selection = useUi((s) => s.selection)
  const joint = useUi((s) => s.selectedJoint)
  const gridSnap = useGridSnap()
  const figureId = selection.length === 1 ? selection[0] : null
  const node = useDocument((s) => (figureId ? editedNodes(s)[figureId] : undefined))
  const movable = useDocument((s) => (figureId ? isMovable(editedNodes(s), figureId) : false))
  const threeScene = useThree((s) => s.scene)
  const [object, setObject] = useState<Object3D | null>(null)

  useEffect(() => {
    setObject(figureId && joint && node ? (threeScene.getObjectByName(`${figureId}:${joint}`) ?? null) : null)
  }, [figureId, joint, node, threeScene])

  if (!object || !figureId || !joint || node?.type !== 'mannequin' || !movable) return null

  const copyToDocument = () => {
    if (gridSnap) lockRotationToGrid(object.rotation)
    let degrees = [object.rotation.x, object.rotation.y, object.rotation.z].map((r) =>
      r4(MathUtils.radToDeg(r))
    ) as Vec3
    if (node.limits) {
      degrees = clampJoint(joint, degrees)
      object.rotation.set(...(degrees.map((d) => MathUtils.degToRad(d)) as Vec3))
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
        useDocument.getState().beginGesture('joint')
      }}
      onObjectChange={copyToDocument}
      onMouseUp={() => {
        copyToDocument()
        useDocument.getState().endGesture('joint')
        setTimeout(() => (viewportBridge.gizmoBusy = false), 0)
      }}
    />
  )
}
