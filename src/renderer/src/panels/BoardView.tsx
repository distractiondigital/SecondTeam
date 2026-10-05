import { useEffect, useState } from 'react'
import { FileDown, GripVertical, ImageOff } from 'lucide-react'
import { boardShots, moveOnBoard, panelDescription, sceneTag, type BoardShot } from '../../../shared/board'
import { activateShot } from '../state/actions'
import { useDocument } from '../state/documentStore'
import { loadTakes, openTake, useGeneration } from '../state/generation'
import { useUi } from '../state/uiStore'
import BoardExport from './BoardExport'

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

function Panel({ b, onDragStart, onDrop, dropHere }: { b: BoardShot; onDragStart: () => void; onDrop: () => void; dropHere: boolean }) {
  const { scene, shot } = b
  const takes = useGeneration((s) => s.takes[shot.id])
  const projectPath = useUi((s) => s.projectPath)
  useEffect(() => {
    if (projectPath && takes === undefined) void loadTakes(shot.id, scene.id)
  }, [projectPath, takes, shot.id, scene.id])
  const take = shot.circleTake ? takes?.find((t) => t.id === shot.circleTake) : undefined
  const showClay = useUi((s) => s.boardImage === 'clay')
  const clay = useUi((s) => s.boardClay[shot.id])
  const update = useDocument.getState().updatePanel
  const description = panelDescription(shot)
  const specs = [`${Math.round(shot.focalLength)}mm`, shot.sizeOverride ?? take?.shotSize, shot.angleOverride ?? take?.angle]
    .filter(Boolean)
    .join(' · ')

  const goToShot = () => {
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
      <div className="board-image" onDoubleClick={goToShot} title="Double-click to go to this shot">
        {showClay ? (
          clay ? (
            <img src={clay} alt={shot.shotNumber} draggable={false} />
          ) : (
            <div className="board-missing">Rendering…</div>
          )
        ) : take ? (
          <img src={take.thumbnail} alt={shot.shotNumber} draggable={false} />
        ) : (
          <div className="board-missing">
            <ImageOff size={20} />
            {shot.circleTake && takes === undefined ? 'Loading…' : 'No circle take yet'}
          </div>
        )}
      </div>
      <div className="board-head">
        <span
          className="board-grip"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move'
            onDragStart()
          }}
          title="Drag to reorder"
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
  const circled = shots.filter((b) => b.shot.circleTake).length
  const boardImage = useUi((s) => s.boardImage)

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
        </div>
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
              <Panel b={b} onDragStart={() => setDragId(b.shot.id)} onDrop={() => drop(b.shot.id)} dropHere={overId === b.shot.id && dragId !== b.shot.id} />
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
      {exporting && <BoardExport shots={shots} onClose={() => setExporting(false)} />}
    </div>
  )
}
