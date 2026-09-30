import { useEffect, useRef, useState } from 'react'
import { Box3, MathUtils, Mesh, type Object3D } from 'three'
import { useThree } from '@react-three/fiber'
import { TransformControls } from '@react-three/drei'
import type { TransformControls as TransformControlsImpl } from 'three-stdlib'
import { clampScale, MIN_SCALE, type SceneNode, type Vec3 } from '../../../shared/project'
import { activeScene, editedNodes, useDocument } from '../state/documentStore'
import { useUi } from '../state/uiStore'
import { moveSnap } from '../units'
import { contactOffset, draggedAxes } from './contactSnap'
import { lockRotationToGrid, r4, ROTATE_SNAP_DEGREES, useGridSnap } from './gizmoShared'
import { viewportBridge } from './viewportBridge'

const SCALE_SNAP = 0.1

/** Can this node be moved with the gizmo? Not if it, or a group it's in, is hidden or locked. */
export function isMovable(nodes: Record<string, SceneNode>, id: string): boolean {
  let node = nodes[id]
  while (node) {
    if (node.hidden || node.locked) return false
    node = node.parentId ? nodes[node.parentId] : undefined!
  }
  return true
}

/** Bounding boxes of every visible object's parts, except those inside `moving`. */
function surfaceBoxes(threeScene: Object3D, moving: Object3D): Box3[] {
  const skip = new Set<Object3D>()
  moving.traverse((o) => skip.add(o))
  const boxes: Box3[] = []
  for (const id of Object.keys(activeScene(useDocument.getState()).nodes)) {
    const object = threeScene.getObjectByName(id)
    if (!object || skip.has(object) || object.children.some((c) => skip.has(c))) continue
    object.traverseVisible((o) => {
      // Only the object's own parts: a group's children are listed separately.
      if (o instanceof Mesh && !skip.has(o) && (o === object || !o.name)) boxes.push(new Box3().setFromObject(o))
    })
  }
  return boxes
}

// Shows the move/rotate/scale gizmo on a single selected object, group or figure.
// The gizmo moves the three.js object directly; each change is copied into the document,
// and the whole drag is recorded as one undo step.
export default function SelectionGizmo() {
  const selection = useUi((s) => s.selection)
  const selectedJoint = useUi((s) => s.selectedJoint)
  const lookId = useUi((s) => s.lookThroughId)
  const mode = useUi((s) => s.gizmoMode)
  const snapMode = useUi((s) => s.snapMode)
  const units = useUi((s) => s.units)
  const gridSnap = useGridSnap()
  const targetId = selection.length === 1 ? selection[0] : null
  const node = useDocument((s) => (targetId ? editedNodes(s)[targetId] : undefined))
  const movable = useDocument((s) => (targetId ? isMovable(editedNodes(s), targetId) : false))
  const threeScene = useThree((s) => s.scene)
  const [object, setObject] = useState<Object3D | null>(null)
  const controlsRef = useRef<TransformControlsImpl>(null)
  /** Bounding boxes of everything else, collected when a surface-snap drag starts. */
  const surfaceTargets = useRef<Box3[]>([])

  // Find the rendered object for the selected node (it's named by its id).
  useEffect(() => {
    setObject(targetId && node ? (threeScene.getObjectByName(targetId) ?? null) : null)
  }, [targetId, node, threeScene])

  if (!object || !targetId || !movable || !node) return null
  // While posing a joint, the joint gizmo takes over.
  if (selectedJoint && node.type === 'mannequin') return null
  // A figure's size comes from its Height setting, and cameras don't scale.
  if ((node.type === 'mannequin' || node.type === 'camera' || node.type === 'light') && mode === 'scale') return null
  // Don't put a gizmo on the camera you're looking through (it would sit on the lens).
  if (lookId === targetId) return null

  const surfaceSnap = snapMode === 'surface' && mode === 'translate'
  const isPlane = node.type === 'primitive' && node.primitive === 'plane'

  const applySurfaceSnap = () => {
    // `axis` (the handle being dragged, e.g. "X" or "XZ") is public at runtime but typed as private.
    const controls = controlsRef.current as unknown as { axis: string | null } | null
    const axes = draggedAxes(controls?.axis ?? null)
    if (axes.length === 0) return
    object.updateMatrixWorld(true)
    const offset = contactOffset(new Box3().setFromObject(object), surfaceTargets.current, axes)
    if (offset.lengthSq() === 0) return
    const world = object.getWorldPosition(object.position.clone()).add(offset)
    object.position.copy(object.parent ? object.parent.worldToLocal(world) : world)
    object.updateMatrixWorld(true)
  }

  const copyToDocument = () => {
    if (surfaceSnap) applySurfaceSnap()
    if (gridSnap && mode === 'rotate') lockRotationToGrid(object.rotation)
    // Never let a scale reach zero: a flat object can't be clicked or seen properly.
    const scale = clampScale(object.scale.toArray() as Vec3)
    object.scale.set(...scale)
    useDocument.getState().updateNode(targetId, {
      position: object.position.toArray().map(r4) as Vec3,
      rotation: [object.rotation.x, object.rotation.y, object.rotation.z].map((r) => r4(MathUtils.radToDeg(r))) as Vec3,
      scale: scale.map((s) => Math.max(MIN_SCALE, r4(s))) as Vec3
    })
  }

  return (
    <TransformControls
      ref={controlsRef}
      object={object}
      mode={mode}
      size={0.9}
      // A plane has no height, so its vertical scale handle would only squash it flat.
      showY={!(isPlane && mode === 'scale')}
      translationSnap={gridSnap ? moveSnap(units) : null}
      rotationSnap={gridSnap ? MathUtils.degToRad(ROTATE_SNAP_DEGREES) : null}
      scaleSnap={gridSnap ? SCALE_SNAP : null}
      onMouseDown={() => {
        viewportBridge.gizmoBusy = true
        if (surfaceSnap) surfaceTargets.current = surfaceBoxes(threeScene, object)
        useDocument.getState().beginGesture('gizmo')
      }}
      onObjectChange={copyToDocument}
      onMouseUp={() => {
        copyToDocument()
        useDocument.getState().endGesture('gizmo')
        // The browser sends a click right after the mouse is released; ignore that one.
        setTimeout(() => (viewportBridge.gizmoBusy = false), 0)
      }}
    />
  )
}
