import type { PrimitiveType } from '../../../shared/project'
import { viewportBridge } from '../viewport/viewportBridge'
import { activeScene, useDocument } from './documentStore'
import { useUi } from './uiStore'

// Editing actions shared by the toolbar, panels and keyboard shortcuts.

const doc = () => useDocument.getState()
const ui = () => useUi.getState()

/** The current selection, minus anything that no longer exists (e.g. after undo). */
export function liveSelection(): string[] {
  const nodes = activeScene(doc()).nodes
  return ui().selection.filter((id) => id in nodes)
}

export function addPrimitive(type: PrimitiveType): void {
  const id = doc().addPrimitive(type, viewportBridge.getGroundPoint())
  ui().select([id])
}

export function addMannequin(): void {
  const id = doc().addMannequin(viewportBridge.getGroundPoint())
  ui().select([id])
}

export function deleteSelected(): void {
  const ids = liveSelection()
  if (ids.length === 0) return
  doc().deleteNodes(ids)
  ui().select([])
}

export function duplicateSelected(): void {
  const ids = liveSelection()
  if (ids.length === 0) return
  ui().select(doc().duplicateNodes(ids))
}

export function groupSelected(): void {
  const ids = liveSelection()
  if (ids.length === 0) return
  const groupId = doc().groupNodes(ids)
  if (groupId) ui().select([groupId])
}

export function ungroupSelected(): void {
  const ids = liveSelection()
  const released = doc().ungroup(ids)
  if (released.length > 0) ui().select(released)
}

export function toggleHiddenSelected(): void {
  const ids = liveSelection()
  if (ids.length === 0) return
  const nodes = activeScene(doc()).nodes
  const anyVisible = ids.some((id) => !nodes[id].hidden)
  doc().updateNodes(ids, { hidden: anyVisible })
}

export function undo(): void {
  doc().undo()
}

export function redo(): void {
  doc().redo()
}

export function renameSelected(): void {
  const ids = liveSelection()
  if (ids.length === 1) ui().setRenamingId(ids[0])
}
