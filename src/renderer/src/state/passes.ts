import { create } from 'zustand'
import { deliveryFrame, guideLabel, opticsFor } from '../../../shared/camera'
import { PASS_KINDS, type PassKind } from '../../../shared/passes'
import type { CameraNode } from '../../../shared/project'
import { getRenderer } from '../viewport/RendererHandle'
import { renderPasses, type PassResult } from '../viewport/renderPasses'
import { shotScenes } from '../viewport/ShotScenes'
import { activeScene, sceneForShot, useDocument } from './documentStore'
import { useUi } from './uiStore'

// Rendering a shot's passes, saving them into the project folder, and what the pass viewer shows.
// Not part of the document (not saved in project.json, not undoable).

export interface PassView {
  sceneId: string
  shotId: string
  shotName: string
  result: PassResult
  /** Where they were saved, or why they weren't. */
  savedTo: string | null
  saveError: string | null
}

interface PassState {
  view: PassView | null
  tab: PassKind
  rendering: boolean
  setTab: (tab: PassKind) => void
  close: () => void
}

export const usePasses = create<PassState>()((set) => ({
  view: null,
  tab: 'clay',
  rendering: false,
  setTab: (tab) => set({ tab }),
  close: () => set({ view: null })
}))

/** Flip to the next or previous pass in the viewer. */
export function stepPass(direction: 1 | -1): void {
  const { tab, setTab } = usePasses.getState()
  const i = PASS_KINDS.indexOf(tab)
  setTab(PASS_KINDS[(i + direction + PASS_KINDS.length) % PASS_KINDS.length])
}

/** Render all five passes for a shot in the current scene, save them if the project has a folder, and show them. */
export async function renderShotPasses(shotId: string): Promise<void> {
  usePasses.setState({ rendering: true })
  try {
    // Let the button show "Rendering…" before the (briefly blocking) render starts.
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    const view = await renderAndSavePasses(shotId)
    if (view) usePasses.setState((s) => ({ view, tab: s.view ? s.tab : 'clay' }))
  } finally {
    usePasses.setState({ rendering: false })
  }
}

/** Render a shot's passes and save them into the project folder (if it has one), without showing them. */
export async function renderAndSavePasses(shotId: string): Promise<PassView | null> {
  const state = useDocument.getState()
  const scene = activeScene(state)
  const nodes = sceneForShot(state, shotId)
  const shot = nodes[shotId]
  const gl = getRenderer()
  const threeScene = shotScenes.get(shotId)
  if (!shot || shot.type !== 'camera' || !gl || !threeScene) return null

  const kit = state.project.camera
  const result = renderPasses({ gl, scene: threeScene, shot, kit, nodes, rootIds: scene.rootIds })
  if (!result) return null

  const view: PassView = {
    sceneId: scene.id,
    shotId,
    shotName: shot.shotNumber,
    result,
    savedTo: null,
    saveError: null
  }
  const folder = useUi.getState().projectPath
  if (folder) {
    const files: Record<string, string> = { 'passes.json': passesJson(shot, scene.number, scene.id, result) }
    for (const kind of PASS_KINDS) files[`${kind}.png`] = result.images[kind]
    const saved = await window.secondTeam.writePasses(folder, scene.id, shotId, files)
    if ('error' in saved) view.saveError = saved.error
    else view.savedTo = saved.path
  }
  return view
}

/** The sidecar M6 reads: size, lens, camera, the ID colour legend and the depth range. */
function passesJson(shot: CameraNode, sceneNumber: number, sceneId: string, r: PassResult): string {
  const kit = useDocument.getState().project.camera
  const optics = opticsFor(kit, shot.focalLength)
  return (
    JSON.stringify(
      {
        format: 'secondteam-passes',
        version: 1,
        renderedAt: new Date().toISOString(),
        scene: { id: sceneId, number: sceneNumber },
        shot: { id: shot.id, name: shot.shotNumber },
        width: r.width,
        height: r.height,
        camera: {
          position: shot.position,
          rotation: shot.rotation,
          focalLength: shot.focalLength,
          sensor: kit.sensor,
          squeeze: kit.squeeze,
          delivery: kit.delivery === 'sensor' ? 'Full sensor' : guideLabel(kit.delivery),
          deliveryRatio: deliveryFrame(optics).ratio
        },
        depth: { curve: 'inverse (disparity), nearest = white, farthest and empty = black', ...r.depthRange },
        normal: 'camera space: red = right, green = up, blue = toward the lens',
        pose: 'OpenPose COCO-18',
        id: r.legend
      },
      null,
      2
    ) + '\n'
  )
}
