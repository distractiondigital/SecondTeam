import type { WebGLRenderer } from 'three'
import type { BoardShot } from '../../../shared/board'
import { deliveryFrame, opticsFor } from '../../../shared/camera'
import { useDocument } from '../state/documentStore'
import { keepRender, useRenders } from '../state/renders'
import { focusOf } from './boardClay'
import { PathTrace } from './pathTrace'
import { shotFingerprint } from './shotFingerprint'
import { shotScenes } from './ShotScenes'

/**
 * Every shot's Final Render for an export (PNG data URLs by shot id, `width` px wide): an
 * up-to-date Final at least that wide is used as is, the rest are rendered now (and kept as the
 * shots' Renders). `progress` gets a line to show; returns null if cancelled.
 */
export async function exportRenders(
  gl: WebGLRenderer,
  shots: BoardShot[],
  width: number,
  progress: (text: string) => void,
  cancelled: () => boolean
): Promise<Record<string, string> | null> {
  const images: Record<string, string> = {}
  const kit = useDocument.getState().project.camera
  const todo = shots.filter(({ shot }) => {
    const final = useRenders.getState().byShot[shot.id]?.final
    if (final && final.print === shotFingerprint(shot.id) && final.width >= width) {
      images[shot.id] = final.url
      return false
    }
    return true
  })
  if (!todo.length) return images
  const pt = new PathTrace(gl)
  try {
    for (let i = 0; i < todo.length; i++) {
      const { shot } = todo[i]
      const scene = shotScenes.get(shot.id)
      if (!scene) continue
      const label = `Rendering ${shot.shotNumber} (${i + 1} of ${todo.length})`
      progress(`${label}…`)
      const print = shotFingerprint(shot.id)
      const height = Math.round(width / deliveryFrame(opticsFor(kit, shot.focalLength)).ratio)
      scene.updateMatrixWorld(true)
      pt.prepare(scene, shot, kit, focusOf(shot, scene), width, height, 'final')
      const finished = await pt.run((samples) => progress(`${label}… ${Math.round((100 * samples) / pt.target)}%`), cancelled)
      if (!finished) return null
      const url = pt.toCanvas().toDataURL('image/png')
      images[shot.id] = url
      void keepRender(shot.id, 'final', { url, print, width, height, samples: pt.target })
    }
    return images
  } finally {
    pt.dispose()
  }
}
