import type { Scene as ThreeScene, WebGLRenderer } from 'three'
import { shotFocus } from '../../../shared/depthOfField'
import type { CameraNode } from '../../../shared/project'
import { sceneForShot, sceneOfShot, useDocument } from '../state/documentStore'
import { renderShot } from './renderShot'
import { computeShotInfo } from './shotInfo'
import { shotScenes } from './ShotScenes'

// Clay pictures of every shot in the project, for the storyboard (on screen and exported).
// Needs the hidden per-shot copies of every scene, which ShotScenes builds while the board shows.

/** Where a shot focuses: its own distance, else its subject (measured in the shot's copy of the set), else infinity. */
export function focusOf(camera: CameraNode, scene: ThreeScene): number {
  if (camera.focusDistance !== null) return camera.focusDistance
  const state = useDocument.getState()
  const docScene = { ...sceneOfShot(state, camera.id), nodes: sceneForShot(state, camera.id) }
  return shotFocus(null, computeShotInfo(docScene, camera, state.project.camera, scene)?.subjectDepth)
}

/** Data URLs by camera id; shots whose copy isn't built yet are left out. */
export function renderBoardClay(gl: WebGLRenderer, width: number, type: 'image/jpeg' | 'image/png'): Record<string, string> {
  const { project } = useDocument.getState()
  const images: Record<string, string> = {}
  for (const c of project.scenes.flatMap((s) => Object.values(s.nodes))) {
    const scene = shotScenes.get(c.id)
    if (c.type !== 'camera' || !scene) continue
    scene.updateMatrixWorld(true)
    const canvas = renderShot(gl, scene, c, project.camera, width, focusOf(c, scene))
    if (canvas) images[c.id] = canvas.toDataURL(type, 0.85)
  }
  return images
}
