import { MathUtils } from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import type { Scene, Vec3 } from '../../../shared/project'
import { activeScene, useDocument } from '../state/documentStore'
import { useUi } from '../state/uiStore'

// Shared click-to-select behaviour for everything in the viewport.

export const SELECTION_COLOR = '#f2a33a'
export const CLICK_DRAG_TOLERANCE = 4 // pixels; a bigger mouse move counts as a drag, not a click

export const toRadians = (rotation: Vec3): Vec3 => rotation.map((d) => MathUtils.degToRad(d)) as Vec3

export const noRaycast = () => null

/** Outermost group containing this node (clicking an object in a group selects the group). */
export function outermostAncestor(scene: Scene, id: string): string {
  let current = scene.nodes[id]
  while (current?.parentId && scene.nodes[current.parentId]) current = scene.nodes[current.parentId]
  return current?.id ?? id
}

export function handleNodeClick(e: ThreeEvent<MouseEvent>, id: string): void {
  e.stopPropagation()
  if (e.delta > CLICK_DRAG_TOLERANCE) return
  const scene = activeScene(useDocument.getState())
  const target = outermostAncestor(scene, id)
  const ui = useUi.getState()
  if (e.ctrlKey || e.shiftKey) ui.toggleSelected(target)
  else ui.select([target])
}

export function handleNodeDoubleClick(e: ThreeEvent<MouseEvent>, id: string): void {
  // Double-click drills into a group and selects the object itself.
  e.stopPropagation()
  const ui = useUi.getState()
  if (ui.selection.length === 1 && ui.selection[0] === id) return
  ui.select([id])
}
