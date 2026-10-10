import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { FileDown, GripVertical, ImageOff } from 'lucide-react'
import { boardShots, moveOnBoard, panelDescription, sceneTag, type BoardShot } from '../../../shared/board'
import { deliveryFrame, opticsFor } from '../../../shared/camera'
import { activateShot } from '../state/actions'
import { useDocument } from '../state/documentStore'
import { openTake } from '../state/generation'
import { useUi } from '../state/uiStore'
import BoardExport from './BoardExport'
import BoardLightbox from './BoardLightbox'
import { useRenders } from '../state/renders'
import { useBoardImage, useBoardPicture } from './boardPictures'
import AnimaticPlayer from './AnimaticPlayer'
import AnimaticTimeline, { SHOT_DRAG_TYPE } from './AnimaticTimeline'
import { useAnimatic } from '../state/animaticUi'

// The storyboard: every shot's circle take in the board's own order (across scenes), with a
// description, dialogue and notes per panel. Drag panels to reorder (shots keep their names).

/** A caption box that saves when you click away (one undo step per edit). */
function Caption(props: { value: string; placeholder: string; className?: string; onSave: (v: string) => void; rows?: number }) {
  const [text, setText] = useState(props.value)
  useEffect(() => setText(props.value), [props.value])
  return (
    <textarea
      className={`board-caption ${props.className ?? ''}`}
      rows={props.rows ?? 2}
      value={text}
      placeholder={props.placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text !== props.value && props.onSave(text)}
    />
  )
}

/** How long a click waits to see if it's a double-click (which goes to the shot instead). */
const DOUBLE_CLICK_MS = 250

function Panel({ b, onDragStart, onDrop, dropHere, aspect, onExpand }: { b: BoardShot; onDragStart: () => void; onDrop: () => void; dropHere: boolean; aspect: number; onExpand: () => void }) {
  const { scene, shot } = b
  const pic = useBoardPicture(b)
  const take = pic.take
  const update = useDocument.getState().updatePanel
  const description = panelDescription(shot)
  const specs = [`${Math.round(shot.focalLength)}mm`, shot.sizeOverride ?? take?.shotSize, shot.angleOverride ?? take?.angle]
    .filter(Boolean)
    .join(' · ')

  // Click: the picture big; double-click: go to the shot (so a click waits a moment first).
  const pendingClick = useRef<number | null>(null)
  useEffect(() => () => void (pendingClick.current !== null && clearTimeout(pendingClick.current)), [])
  const onClick = (e: MouseEvent) => {
    if (e.detail !== 1) return
    pendingClick.current = window.setTimeout(() => {
      pendingClick.current = null
      onExpand()
    }, DOUBLE_CLICK_MS)
  }

  const goToShot = () => {
    if (pendingClick.current !== null) clearTimeout(pendingClick.current)
    pendingClick.current = null
    const ui = useUi.getState()
    useDocument.getState().setSceneId(scene.id)
    ui.setView('set')
    ui.select([shot.id])
    activateShot(shot.id)
    if (shot.circleTake) void openTake(shot.id, shot.circleTake)
  }

  return (
    <div
      className={`board-panel${dropHere ? ' drop-before' : ''}`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        onDrop()
      }}
    >
      <div className="board-image" style={{ aspectRatio: aspect }} onClick={onClick} onDoubleClick={goToShot} title="Click to see it bigger; double-click to go to this shot">
        {pic.src ? (
          <>
            <img src={pic.src} alt={shot.shotNumber} draggable={false} />
            {pic.pending && <span className="board-pending">{pic.pending}</span>}
          </>
        ) : (
          <div className="board-missing">
            {pic.kind === 'ai' && <ImageOff size={20} />}
            {pic.missing}
          </div>
        )}
      </div>
      <div className="board-head">
        <span
          className="board-grip"
          draggable
          onDragStart={(e) => {
            // Move on the board; copy onto the animatic's timeline.
            e.dataTransfer.effectAllowed = 'copyMove'
            e.dataTransfer.setData(SHOT_DRAG_TYPE, shot.id)
            onDragStart()
          }}
          title="Drag to reorder, or onto the animatic below to add it there"
        >
          <GripVertical size={14} />
        </span>
        <span className="board-shot">{shot.shotNumber}</span>
        <span className="board-scene">{sceneTag(scene)}</span>
        <span className="board-specs">{specs}</span>
      </div>
      <Caption
        value={description}
        placeholder="Description (what happens)"
        onSave={(v) => update(scene.id, shot.id, { boardText: v })}
      />
      <Caption value={shot.dialogue} placeholder="Dialogue" className="dialogue" rows={1} onSave={(v) => update(scene.id, shot.id, { dialogue: v })} />
      <Caption value={shot.notes} placeholder="Notes" className="notes-cap" rows={1} onSave={(v) => update(scene.id, shot.id, { notes: v })} />
    </div>
  )
}

export default function BoardView() {
  const project = useDocument((s) => s.project)
  const shots = boardShots(project)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const circled = shots.filter((b) => b.shot.circleTake).length
  const boardImage = useBoardImage()
  const queue = useRenders((s) => s.queue)
  const playerOpen = useAnimatic((s) => s.playerOpen)
  // Every frame on the board in the shots' own shape (the delivery frame), shown whole.
  const aspect = useDocument((s) => deliveryFrame(opticsFor(s.project.camera, 35)).ratio)

  const drop = (beforeId: string | null) => {
    if (dragId && dragId !== beforeId) {
      const order = shots.map((b) => b.shot.id)
      useDocument.getState().setBoardOrder(moveOnBoard(order, dragId, beforeId))
    }
    setDragId(null)
    setOverId(null)
  }

  return (
    <div className="board" onDragEnd={() => (setDragId(null), setOverId(null))}>
      <div className="board-bar">
        <span className="board-title">Storyboard</span>
        <span className="dim">
          {shots.length} shot{shots.length === 1 ? '' : 's'} · {circled} with a circle take
        </span>
        <div className="segmented board-image-switch" title="Show each shot's circle take or its clay render">
          <button className={boardImage === 'ai' ? 'active' : ''} onClick={() => useUi.getState().setBoardImage('ai')}>
            AI
          </button>
          <button className={boardImage === 'clay' ? 'active' : ''} onClick={() => useUi.getState().setBoardImage('clay')}>
            Clay
          </button>
          <button className={boardImage === 'render' ? 'active' : ''} onClick={() => useUi.getState().setBoardImage('render')} title="Each shot's path-traced Render (made in the background)">
            Render
          </button>
        </div>
        {boardImage === 'render' && queue && <span className="dim">Rendering {Math.min(queue.done + 1, queue.total)} of {queue.total}…</span>}
        <button className="generate-button small" onClick={() => setExporting(true)} disabled={!shots.length}>
          <FileDown size={14} /> Export…
        </button>
      </div>
      {shots.length === 0 ? (
        <p className="hint board-empty">No shots yet. Add shots in the Set view; they appear here in order.</p>
      ) : (
        <div className="board-grid">
          {shots.map((b) => (
            <div
              key={b.shot.id}
              onDragEnter={() => dragId && setOverId(b.shot.id)}
              className={dragId === b.shot.id ? 'board-dragging' : undefined}
            >
              <Panel b={b} onDragStart={() => setDragId(b.shot.id)} onDrop={() => drop(b.shot.id)} dropHere={overId === b.shot.id && dragId !== b.shot.id} aspect={aspect} onExpand={() => setExpanded(b.shot.id)} />
            </div>
          ))}
          <div
            className={`board-end${overId === '__end' ? ' drop-before' : ''}`}
            onDragEnter={() => dragId && setOverId('__end')}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              drop(null)
            }}
          >
            {dragId ? 'Drop here to move to the end' : ''}
          </div>
        </div>
      )}
      <AnimaticTimeline shots={shots} />
      {playerOpen && <AnimaticPlayer shots={shots} />}
      {expanded && <BoardLightbox shots={shots} shotId={expanded} onShow={setExpanded} onClose={() => setExpanded(null)} />}
      {exporting && <BoardExport shots={shots} onClose={() => setExporting(false)} />}
    </div>
  )
}
