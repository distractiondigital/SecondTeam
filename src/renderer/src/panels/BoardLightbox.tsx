import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { panelDescription, sceneTag, type BoardShot } from '../../../shared/board'
import { currentRender } from '../../../shared/renders'
import { useDocument } from '../state/documentStore'
import { useGeneration } from '../state/generation'
import { useRenders } from '../state/renders'
import { useUi } from '../state/uiStore'
import { focusOf } from '../viewport/boardClay'
import { getRenderer } from '../viewport/RendererHandle'
import { renderShot } from '../viewport/renderShot'
import { shotFingerprint } from '../viewport/shotFingerprint'
import { shotScenes } from '../viewport/ShotScenes'
import { useBoardImage } from './BoardView'

// A board panel's picture, big: over the board, as large as the window allows. The panel's small
// picture shows at once, then a sharp one replaces it (the take's full image, a large Clay picture,
// or the Render as saved). ← / → step through the board, Esc or a click outside closes.

/** Width of the Clay picture made for the big view (px). */
const CLAY_WIDTH = 1920

export default function BoardLightbox({ shots, shotId, onShow, onClose }: { shots: BoardShot[]; shotId: string; onShow: (id: string) => void; onClose: () => void }) {
  const index = shots.findIndex((b) => b.shot.id === shotId)
  const b = shots[index]
  const mode = useBoardImage()
  const takes = useGeneration((s) => (b ? s.takes[b.shot.id] : undefined))
  const take = b?.shot.circleTake ? takes?.find((t) => t.id === b.shot.circleTake) : undefined
  const clay = useUi((s) => (b ? s.boardClay[b.shot.id] : undefined))
  useDocument((s) => s.project) // (re-check the Render when the project changes)
  const render = useRenders((s) => (b && mode === 'render' ? (currentRender(s.byShot[b.shot.id], shotFingerprint(b.shot.id))?.url ?? null) : null))
  const projectPath = useUi((s) => s.projectPath)
  const kind = render ? 'render' : mode === 'ai' && take ? 'ai' : 'clay'
  const [sharp, setSharp] = useState<{ key: string; src: string } | null>(null)
  const key = `${shotId}:${kind}:${take?.id ?? ''}`

  // The sharp picture.
  useEffect(() => {
    if (!b || kind === 'render') return
    let live = true
    if (kind === 'ai' && take && projectPath) {
      void window.secondTeam.readTake(projectPath, b.scene.id, b.shot.id, take.id).then((r) => {
        if (live && !('error' in r)) setSharp({ key, src: r.image })
      })
    } else if (kind === 'clay') {
      const gl = getRenderer()
      const scene = shotScenes.get(b.shot.id)
      if (gl && scene) {
        scene.updateMatrixWorld(true)
        const canvas = renderShot(gl, scene, b.shot, useDocument.getState().project.camera, CLAY_WIDTH, focusOf(b.shot, scene))
        if (canvas) setSharp({ key, src: canvas.toDataURL('image/jpeg', 0.92) })
      }
    }
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, projectPath])

  // Keys: step and close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft' && index > 0) onShow(shots[index - 1].shot.id)
      else if (e.key === 'ArrowRight' && index < shots.length - 1) onShow(shots[index + 1].shot.id)
      else return
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [index, shots, onShow, onClose])

  if (!b) return null
  const small = render ?? (kind === 'ai' ? take?.thumbnail : clay) ?? null
  const src = render ?? (sharp?.key === key ? sharp.src : small)
  const description = panelDescription(b.shot)

  return (
    <div className="board-lightbox" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <button className="pass-close board-lightbox-close" onClick={onClose} title="Close (Esc)">
        <X size={18} />
      </button>
      <button className="board-lightbox-step left" disabled={index <= 0} onClick={() => onShow(shots[index - 1].shot.id)} title="Previous shot (←)">
        <ChevronLeft size={28} />
      </button>
      <figure className="board-lightbox-frame">
        {src ? <img src={src} alt={b.shot.shotNumber} draggable={false} /> : <div className="board-missing">No picture yet</div>}
        <figcaption>
          <b>{b.shot.shotNumber}</b> <span className="dim">{sceneTag(b.scene)}</span>
          {description && <span className="board-lightbox-text">{description}</span>}
          {b.shot.dialogue && <span className="board-lightbox-text dialogue">{b.shot.dialogue}</span>}
        </figcaption>
      </figure>
      <button className="board-lightbox-step right" disabled={index >= shots.length - 1} onClick={() => onShow(shots[index + 1].shot.id)} title="Next shot (→)">
        <ChevronRight size={28} />
      </button>
    </div>
  )
}
