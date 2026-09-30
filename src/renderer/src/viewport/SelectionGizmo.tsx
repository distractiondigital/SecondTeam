import { useEffect, useState } from 'react'
import { MathUtils, type Object3D } from 'three'
import { useThree } from '@react-three/fiber'
import { TransformControls } from '@react-three/drei'
import type { Scene } from '../../../shared/project'
import { activeScene, useDocument } from '../state/documentStore'
import { useUi } from '../state/uiStore'
import { moveSnap } from '../units'
import { viewportBridge } from './viewportBridge'

const ROTATE_SNAP_DEGREES = 15
const SCALE_SNAP = 0.1

const r4 = (n: number) => Math.round(n * 10000) / 10000 || 0

/** Can this node be moved with the gizmo? Not if it, or a group it's in, is hidden or locked. */
function isMovable(scene: Scene, id: string): boolean {
  let node = scene.nodes[id]
  while (node) {
    if (node.hidden || node.locked) return false
    node = node.parentId ? scene.nodes[node.parentId] : undefined!
  }
  return true
}

// Shows the move/rotate/scale gizmo on a single selected object or group.
// The gizmo moves the three.js object directly; each change is copied into the document,
// and the whole drag is recorded as one undo step.
export default function SelectionGizmo() {
  const selection = useUi((s) => s.selection)
  const mode = useUi((s) => s.gizmoMode)
  const snapping = useUi((s) => s.snapping)
  const units = useUi((s) => s.units)
  const targetId = selection.length === 1 ? selection[0] : null
  const node = useDocument((s) => (targetId ? activeScene(s).nodes[targetId] : undefined))
  const movable = useDocument((s) => (targetId ? isMovable(activeScene(s), targetId) : false))
  const threeScene = useThree((s) => s.scene)
  const [object, setObject] = useState<Object3D | null>(null)

  // Find the rendered object for the selected node (it's named by its id).
  useEffect(() => {
    setObject(targetId && node ? (threeScene.getObjectByName(targetId) ?? null) : null)
  }, [targetId, node, threeScene])

  if (!object || !targetId || !movable) return null

  const copyToDocument = () => {
    useDocument.getState().updateNode(targetId, {
      position: object.position.toArray().map(r4) as [number, number, number],
      rotation: [object.rotation.x, object.rotation.y, object.rotation.z].map((r) => r4(MathUtils.radToDeg(r))) as [
        number,
        number,
        number
      ],
      scale: object.scale.toArray().map(r4) as [number, number, number]
    })
  }

  return (
    <TransformControls
      object={object}
      mode={mode}
      size={0.9}
      translationSnap={snapping ? moveSnap(units) : null}
      rotationSnap={snapping ? MathUtils.degToRad(ROTATE_SNAP_DEGREES) : null}
      scaleSnap={snapping ? SCALE_SNAP : null}
      onMouseDown={() => {
        viewportBridge.gizmoBusy = true
        useDocument.getState().beginGesture()
      }}
      onObjectChange={copyToDocument}
      onMouseUp={() => {
        copyToDocument()
        useDocument.getState().endGesture()
        // The browser sends a click right after the mouse is released; ignore that one.
        setTimeout(() => (viewportBridge.gizmoBusy = false), 0)
      }}
    />
  )
}
