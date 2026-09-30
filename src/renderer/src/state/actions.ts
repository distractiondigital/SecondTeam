import { compareShotNumbers } from '../../../shared/camera'
import { sceneLabel, type CameraNode, type PrimitiveType } from '../../../shared/project'
import { viewportBridge } from '../viewport/viewportBridge'
import { activeScene, editedNodes, useDocument } from './documentStore'
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

/** Cameras in shot order (natural sort by shot number). */
export function camerasInShotOrder(): CameraNode[] {
  return Object.values(activeScene(doc()).nodes)
    .filter((n): n is CameraNode => n.type === 'camera')
    .sort((a, b) => compareShotNumbers(a.shotNumber, b.shotNumber))
}

/**
 * New shot (1A, 1B…) with its camera where the view is now: the free view, or the current shot's
 * camera while looking through it. Its lens copies the active shot's.
 */
export function addShot(): void {
  const id = doc().addCamera(viewportBridge.getViewPose())
  ui().select([id])
  // Working in a shot? Carry on in the new one (it started from the active shot's version).
  if (doc().activeShotId) activateShot(id)
}

/** Switch scene: back to that scene's own set, out of camera view, nothing selected. */
export function switchScene(sceneId: string): void {
  ui().setLookThrough(null)
  ui().select([])
  doc().setSceneId(sceneId)
}

export function newScene(copyCurrent: boolean): void {
  ui().setLookThrough(null)
  ui().select([])
  doc().addScene(copyCurrent)
}

export async function deleteCurrentScene(): Promise<void> {
  const scene = activeScene(doc())
  const shots = Object.values(scene.nodes).filter((n) => n.type === 'camera').length
  const what = `${sceneLabel(scene)}${shots ? ` and its ${shots} shot${shots === 1 ? '' : 's'}` : ''}`
  if (!window.confirm(`Delete ${what}? You can undo this with Ctrl+Z.`)) return
  ui().setLookThrough(null)
  ui().select([])
  doc().deleteScene()
}

/** Look through a shot camera (it becomes the shot being edited), or back to the free view (null). */
export function lookThrough(id: string | null): void {
  ui().setLookThrough(id)
  if (id) doc().setActiveShot(id)
}

/** Edit a shot's version of the set, or the Master scene (null, which also leaves camera view). */
export function activateShot(id: string | null): void {
  doc().setActiveShot(id)
  if (id === null) ui().setLookThrough(null)
  else if (ui().lookThroughId) ui().setLookThrough(id)
}

/** Look through the selected camera (or the active / first shot), or back to the free view. */
export function toggleCameraView(): void {
  if (ui().lookThroughId) {
    ui().setLookThrough(null)
    return
  }
  const nodes = activeScene(doc()).nodes
  const selected = liveSelection().find((id) => nodes[id]?.type === 'camera')
  const target = selected ?? doc().activeShotId ?? camerasInShotOrder()[0]?.id
  if (target) lookThrough(target)
}

/** In camera view, jump to the previous (-1) or next (+1) shot. */
export function stepShot(direction: 1 | -1): void {
  const current = ui().lookThroughId
  const shots = camerasInShotOrder()
  if (!current || shots.length < 2) return
  const i = shots.findIndex((c) => c.id === current)
  const next = shots[(i + direction + shots.length) % shots.length]
  lookThrough(next.id)
  ui().select([next.id])
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
  const nodes = editedNodes(doc())
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
