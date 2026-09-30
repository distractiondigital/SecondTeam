import { useEffect, useRef, useState } from 'react'
import { Box3, MathUtils, Mesh, type Object3D } from 'three'
import { useThree } from '@react-three/fiber'
import { TransformControls } from '@react-three/drei'
import type { TransformControls as TransformControlsImpl } from 'three-stdlib'
import { clampScale, MIN_SCALE, type Scene, type Vec3 } from '../../../shared/project'
import { activeScene, useDocument } from '../state/documentStore'
import { useUi } from '../state/uiStore'
import { moveSnap } from '../units'
import { contactOffset, draggedAxes } from './contactSnap'
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

/** True while the Ctrl key is held (it flips grid snapping during a drag). */
function useCtrlHeld(): boolean {
  const [held, setHeld] = useState(false)
  useEffect(() => {
    const update = (e: KeyboardEvent) => setHeld(e.ctrlKey)
    const release = () => setHeld(false)
    window.addEventListener('keydown', update)
    window.addEventListener('keyup', update)
    window.addEventListener('blur', release)
    return () => {
      window.removeEventListener('keydown', update)
      window.removeEventListener('keyup', update)
      window.removeEventListener('blur', release)
    }
  }, [])
  return held
}

// Shows the move/rotate/scale gizmo on a single selected object or group.
// The gizmo moves the three.js object directly; each change is copied into the document,
// and the whole drag is recorded as one undo step.
export default function SelectionGizmo() {
  const selection = useUi((s) => s.selection)
  const mode = useUi((s) => s.gizmoMode)
  const snapMode = useUi((s) => s.snapMode)
  const units = useUi((s) => s.units)
  const ctrlHeld = useCtrlHeld()
  const targetId = selection.length === 1 ? selection[0] : null
  const node = useDocument((s) => (targetId ? activeScene(s).nodes[targetId] : undefined))
  const movable = useDocument((s) => (targetId ? isMovable(activeScene(s), targetId) : false))
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

  // Ctrl flips grid snapping for as long as it's held.
  const gridSnap = (snapMode === 'grid') !== ctrlHeld
  const surfaceSnap = snapMode === 'surface' && mode === 'translate'
  const isPlane = node.type === 'primitive' && node.primitive === 'plane'

  const collectSurfaceTargets = () => {
    const nodeIds = new Set(Object.keys(activeScene(useDocument.getState()).nodes))
    const moving = new Set<Object3D>()
    object.traverse((o) => moving.add(o))
    const boxes: Box3[] = []
    threeScene.traverseVisible((o) => {
      if (o instanceof Mesh && nodeIds.has(o.name) && !moving.has(o)) boxes.push(new Box3().setFromObject(o))
    })
    surfaceTargets.current = boxes
  }

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

  // The gizmo's own rotation snap turns in 15° steps from wherever the object started (7° → 22°).
  // Lock the result to whole 15° increments instead, so a carelessly rotated object snaps back
  // onto the grid.
  const lockRotationToGrid = () => {
    const step = MathUtils.degToRad(ROTATE_SNAP_DEGREES)
    const r = object.rotation
    r.set(Math.round(r.x / step) * step, Math.round(r.y / step) * step, Math.round(r.z / step) * step)
  }

  const copyToDocument = () => {
    if (surfaceSnap) applySurfaceSnap()
    if (gridSnap && mode === 'rotate') lockRotationToGrid()
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
        if (surfaceSnap) collectSurfaceTargets()
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
