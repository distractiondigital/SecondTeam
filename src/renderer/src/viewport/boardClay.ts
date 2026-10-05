import type { WebGLRenderer } from 'three'
import { useDocument } from '../state/documentStore'
import { renderShot } from './renderShot'
import { shotScenes } from './ShotScenes'

// Clay pictures of every shot in the project, for the storyboard (on screen and exported).
// Needs the hidden per-shot copies of every scene, which ShotScenes builds while the board shows.

/** Data URLs by camera id; shots whose copy isn't built yet are left out. */
export function renderBoardClay(gl: WebGLRenderer, width: number, type: 'image/jpeg' | 'image/png'): Record<string, string> {
  const { project } = useDocument.getState()
  const images: Record<string, string> = {}
  for (const c of project.scenes.flatMap((s) => Object.values(s.nodes))) {
    const scene = shotScenes.get(c.id)
    if (c.type !== 'camera' || !scene) continue
    scene.updateMatrixWorld(true)
    const canvas = renderShot(gl, scene, c, project.camera, width)
    if (canvas) images[c.id] = canvas.toDataURL(type, 0.85)
  }
  return images
}
