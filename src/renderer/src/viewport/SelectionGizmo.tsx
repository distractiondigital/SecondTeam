import { useEffect, useMemo, useRef, useState } from 'react'
import { Box3, MathUtils, Matrix4, Mesh, Object3D, Vector3 } from 'three'
import { useThree } from '@react-three/fiber'
import { TransformControls } from '@react-three/drei'
import type { TransformControls as TransformControlsImpl } from 'three-stdlib'
import { clampScale, MIN_SCALE, type SceneNode, type Vec3 } from '../../../shared/project'
import { activeScene, editedNodes, topLevelOnly, useDocument } from '../state/documentStore'
import { movedPlacement, parentWorldMatrix, worldMatrix } from '../../../shared/transforms'
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

// Shows the move/rotate/scale gizmo on a single selected object, group or figure
// (several selected: see MultiGizmo).
// The gizmo moves the three.js object directly; each change is copied into the document,
// and the whole drag is recorded as one undo step.
export default function SelectionGizmo() {
  const many = useUi((s) => s.selection.length > 1)
  return many ? <MultiGizmo /> : <SingleGizmo />
}

function SingleGizmo() {
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

// Several things selected: one move/rotate gizmo on a pivot under their middle (centre in X/Z,
// lowest point in Y, like a group's origin). Dragging it moves each of them by the same amount
// in the world, whatever group each one is in; the whole drag is one undo step. In a shot, the
// new placements are that shot's changes, as usual. No scale: scaling rotated things together
// would skew them.
function MultiGizmo() {
  const selection = useUi((s) => s.selection)
  const lookId = useUi((s) => s.lookThroughId)
  const mode = useUi((s) => s.gizmoMode)
  const units = useUi((s) => s.units)
  const gridSnap = useGridSnap()
  const nodes = useDocument((s) => editedNodes(s))
  const threeScene = useThree((s) => s.scene)
  const pivot = useMemo(() => {
    const o = new Object3D()
    o.userData.helper = true
    return o
  }, [])
  const drag = useRef<{ start: Matrix4; items: { id: string; world: Matrix4; parent: Matrix4 }[] } | null>(null)

  // What moves: the outermost of the selected things (a group carries what's inside it).
  const movers = useMemo(() => {
    const scene = activeScene(useDocument.getState())
    return topLevelOnly(scene, selection).filter((id) => nodes[id] && id !== lookId && isMovable(nodes, id))
  }, [selection, nodes, lookId])

  // Put the pivot under the middle of what's selected (not while dragging it).
  useEffect(() => {
    if (drag.current) return
    const box = new Box3()
    threeScene.updateMatrixWorld(true)
    for (const id of movers) {
      const object = threeScene.getObjectByName(id)
      if (object) box.expandByObject(object)
    }
    if (box.isEmpty()) return
    const centre = box.getCenter(new Vector3())
    pivot.position.set(centre.x, box.min.y, centre.z)
    pivot.rotation.set(0, 0, 0)
    pivot.updateMatrixWorld(true)
  }, [movers, nodes, threeScene, pivot])

  if (movers.length === 0 || mode === 'scale') return null

  const apply = () => {
    const d = drag.current
    if (!d) return
    if (gridSnap && mode === 'rotate') lockRotationToGrid(pivot.rotation)
    pivot.updateMatrixWorld(true)
    const delta = pivot.matrixWorld.clone().multiply(d.start.clone().invert())
    const doc = useDocument.getState()
    for (const item of d.items) {
      const { position, rotation } = movedPlacement(item.world, delta, item.parent)
      doc.updateNode(item.id, { position, rotation })
    }
  }

  return (
    <>
      <primitive object={pivot} />
      <TransformControls
        object={pivot}
        mode={mode}
        size={0.9}
        translationSnap={gridSnap ? moveSnap(units) : null}
        rotationSnap={gridSnap ? MathUtils.degToRad(ROTATE_SNAP_DEGREES) : null}
        onMouseDown={() => {
          viewportBridge.gizmoBusy = true
          const view = editedNodes(useDocument.getState())
          pivot.updateMatrixWorld(true)
          drag.current = {
            start: pivot.matrixWorld.clone(),
            items: movers.map((id) => ({ id, world: worldMatrix(view, id), parent: parentWorldMatrix(view, view[id].parentId) }))
          }
          useDocument.getState().beginGesture('gizmo')
        }}
        onObjectChange={apply}
        onMouseUp={() => {
          apply()
          drag.current = null
          useDocument.getState().endGesture('gizmo')
          setTimeout(() => (viewportBridge.gizmoBusy = false), 0)
        }}
      />
    </>
  )
}
