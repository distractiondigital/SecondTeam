import { useEffect, useState } from 'react'
import { Eye, Layers, Plus, RefreshCw, Video } from 'lucide-react'
import { compareShotNumbers } from '../../../shared/camera'
import { sceneLabel, type CameraNode } from '../../../shared/project'
import { activateShot, addShot, lookThrough } from '../state/actions'
import { activeScene, useDocument } from '../state/documentStore'
import { closeTake, loadTakes, openTake, useGeneration } from '../state/generation'
import { useUi } from '../state/uiStore'

// The Master scene, then every camera setup in shot order with a live thumbnail of its frame.
// Clicking a row picks what you're editing: the Master scene, or one shot's version of the set.

const SIZE_SHORT: Record<string, string> = {
  'Extreme close-up': 'ECU',
  'Close-up': 'CU',
  'Medium close-up': 'MCU',
  'Medium shot': 'MS',
  'Medium wide shot': 'MWS',
  'Wide shot': 'WS',
  'Extreme wide shot': 'EWS'
}

interface DragProps {
  /** Where a dragged shot would land relative to this row. */
  dropSide: 'before' | 'after' | null
  onDragStart: () => void
  onDragOver: (side: 'before' | 'after') => void
  onDrop: () => void
  onDragEnd: () => void
}

function ShotRow({ camera, drag }: { camera: CameraNode; drag: DragProps }) {
  const selected = useUi((s) => s.selection.includes(camera.id))
  const looking = useUi((s) => s.lookThroughId === camera.id)
  const active = useDocument((s) => s.activeShotId === camera.id)
  const live = useUi((s) => s.thumbnails[camera.id])
  // Once a shot has a circle take, the Shot list shows it instead of the live greybox render.
  const circle = useGeneration((s) =>
    camera.circleTake ? s.takes[camera.id]?.find((t) => t.id === camera.circleTake)?.thumbnail : undefined
  )
  const takesLoaded = useGeneration((s) => camera.id in s.takes)
  useEffect(() => {
    if (camera.circleTake && !takesLoaded) void loadTakes(camera.id)
  }, [camera.circleTake, camera.id, takesLoaded])
  const thumbnail = circle ?? live
  const info = useUi((s) => s.shotInfo[camera.id])
  const size = camera.sizeOverride ?? info?.size?.label
  const angle = camera.angleOverride ?? info?.angle
  const changes = Object.keys(camera.overrides).length

  return (
    <div
      className={`shot-row${selected ? ' selected' : ''}${active ? ' active' : ''}${looking ? ' looking' : ''}${
        drag.dropSide ? ` drop-${drag.dropSide}` : ''
      }`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        drag.onDragStart()
      }}
      onDragOver={(e) => {
        e.preventDefault()
        const box = e.currentTarget.getBoundingClientRect()
        drag.onDragOver(e.clientY < box.top + box.height / 2 ? 'before' : 'after')
      }}
      onDrop={(e) => {
        e.preventDefault()
        drag.onDrop()
      }}
      onDragEnd={drag.onDragEnd}
      onClick={() => {
        useUi.getState().select([camera.id])
        activateShot(camera.id)
        // Show the shot's circle take (Esc closes it); a shot without one closes any open take.
        if (camera.circleTake) {
          if (!takesLoaded) void loadTakes(camera.id)
          void openTake(camera.id, camera.circleTake)
        } else {
          closeTake()
        }
      }}
      onDoubleClick={() => {
        closeTake()
        lookThrough(camera.id)
      }}
      title={`Click to edit this shot${camera.circleTake ? ' and see its circle take (Esc closes it)' : ''} · double-click to look through it · drag to reorder`}
    >
      <div className={`shot-thumb${circle ? ' circled' : ''}`} title={circle ? 'Circle take' : undefined}>
        {thumbnail ? <img src={thumbnail} alt="" /> : <Video size={18} />}
      </div>
      <div className="shot-text">
        <div className="shot-number">
          {camera.shotNumber}
          <span className="shot-lens">{Math.round(camera.focalLength)}mm</span>
        </div>
        <div className="shot-desc">
          {[size ? (SIZE_SHORT[size] ?? size) : null, angle].filter(Boolean).join(' · ') || '—'}
        </div>
        {changes > 0 && (
          <div className="shot-changes" title="Objects changed in this shot (everything else follows the scene's set)">
            {changes} change{changes === 1 ? '' : 's'}
          </div>
        )}
      </div>
      <button
        className={`icon-button${looking ? ' on' : ''}`}
        title={looking ? 'Back to the free view' : 'Look through this camera'}
        onClick={(e) => {
          e.stopPropagation()
          lookThrough(looking ? null : camera.id)
        }}
      >
        <Eye size={14} />
      </button>
    </div>
  )
}

export default function ShotList() {
  const nodes = useDocument((s) => activeScene(s).nodes)
  const masterActive = useDocument((s) => s.activeShotId === null)
  const label = useDocument((s) => sceneLabel(activeScene(s)))
  const [dragging, setDragging] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; side: 'before' | 'after' } | null>(null)
  const cameras = Object.values(nodes)
    .filter((n): n is CameraNode => n.type === 'camera')
    .sort((a, b) => compareShotNumbers(a.shotNumber, b.shotNumber))

  return (
    <section className="panel shot-list">
      <div className="panel-header">Shot list</div>
      <div className="panel-body">
        <div
          className={`shot-row master${masterActive ? ' active' : ''}`}
          onClick={() => activateShot(null)}
          title="Edit the scene's own set: changes flow to every shot that hasn't changed that object"
        >
          <div className="shot-thumb master-thumb">
            <Layers size={18} />
          </div>
          <div className="shot-text">
            <div className="shot-number">{label}</div>
            <div className="shot-desc">The set every shot starts from</div>
          </div>
          <button
            className="icon-button shot-refresh"
            title="Refresh every shot's Clay thumbnail in this scene"
            onClick={(e) => {
              e.stopPropagation()
              useUi.getState().refreshThumbnails()
            }}
          >
            <RefreshCw size={14} />
          </button>
        </div>
        {cameras.map((c) => (
          <ShotRow
            key={c.id}
            camera={c}
            drag={{
              dropSide: dragging && dropTarget?.id === c.id && dragging !== c.id ? dropTarget.side : null,
              onDragStart: () => setDragging(c.id),
              onDragOver: (side) => setDropTarget({ id: c.id, side }),
              onDrop: () => {
                if (dragging && dropTarget) {
                  // Shots are renamed to match their new order (1A, 1B, 1C…).
                  const order = cameras.map((x) => x.id).filter((id) => id !== dragging)
                  const at = order.indexOf(dropTarget.id) + (dropTarget.side === 'after' ? 1 : 0)
                  order.splice(at, 0, dragging)
                  useDocument.getState().reorderShots(order)
                }
                setDragging(null)
                setDropTarget(null)
              },
              onDragEnd: () => {
                setDragging(null)
                setDropTarget(null)
              }
            }}
          />
        ))}
        <button className="add-shot" onClick={addShot} title="New shot with its camera where your view is now (opens its camera view)">
          <Plus size={14} /> Add shot
        </button>
        {cameras.length === 0 && <p className="hint">Frame something in the viewport, then add a shot.</p>}
      </div>
    </section>
  )
}
