import { useEffect } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { panelDescription, sceneTag, type BoardShot } from '../../../shared/board'
import { useBoardPicture, useSharpPicture } from './boardPictures'

// A board panel's picture, big: over the board, as large as the window allows. The panel's small
// picture shows at once, then a sharp one replaces it (the take's full image, a large Clay picture,
// or the Render as saved). ← / → step through the board, Esc or a click outside closes.

export default function BoardLightbox({ shots, shotId, onShow, onClose }: { shots: BoardShot[]; shotId: string; onShow: (id: string) => void; onClose: () => void }) {
  const index = shots.findIndex((b) => b.shot.id === shotId)
  const b = shots[index]
  return b ? <Lightbox b={b} index={index} shots={shots} onShow={onShow} onClose={onClose} /> : null
}

function Lightbox({ b, index, shots, onShow, onClose }: { b: BoardShot; index: number; shots: BoardShot[]; onShow: (id: string) => void; onClose: () => void }) {
  const pic = useBoardPicture(b)
  const src = useSharpPicture(b, pic)

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
