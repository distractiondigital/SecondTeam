import { Eye, Layers, Plus, Video } from 'lucide-react'
import { compareShotNumbers } from '../../../shared/camera'
import { sceneLabel, type CameraNode } from '../../../shared/project'
import { activateShot, addShot, lookThrough } from '../state/actions'
import { activeScene, useDocument } from '../state/documentStore'
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

function ShotRow({ camera }: { camera: CameraNode }) {
  const selected = useUi((s) => s.selection.includes(camera.id))
  const looking = useUi((s) => s.lookThroughId === camera.id)
  const active = useDocument((s) => s.activeShotId === camera.id)
  const thumbnail = useUi((s) => s.thumbnails[camera.id])
  const info = useUi((s) => s.shotInfo[camera.id])
  const size = camera.sizeOverride ?? info?.size?.label
  const angle = camera.angleOverride ?? info?.angle
  const changes = Object.keys(camera.overrides).length

  return (
    <div
      className={`shot-row${selected ? ' selected' : ''}${active ? ' active' : ''}${looking ? ' looking' : ''}`}
      onClick={() => {
        useUi.getState().select([camera.id])
        activateShot(camera.id)
      }}
      onDoubleClick={() => lookThrough(camera.id)}
      title="Click to edit this shot · double-click to look through it"
    >
      <div className="shot-thumb">{thumbnail ? <img src={thumbnail} alt="" /> : <Video size={18} />}</div>
      <div className="shot-text">
        <div className="shot-number">
          {camera.shotNumber}
          <span className="shot-lens">{Math.round(camera.focalLength)}mm</span>
        </div>
        <div className="shot-desc">
          {[size ? (SIZE_SHORT[size] ?? size) : null, angle].filter(Boolean).join(' · ') || '—'}
        </div>
        {changes > 0 && (
          <div className="shot-changes" title="Objects changed in this shot (everything else follows the Master scene)">
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
        </div>
        {cameras.map((c) => (
          <ShotRow key={c.id} camera={c} />
        ))}
        <button className="add-shot" onClick={addShot} title="New shot with its camera where your view is now">
          <Plus size={14} /> Add shot
        </button>
        {cameras.length === 0 && <p className="hint">Frame something in the viewport, then add a shot.</p>}
      </div>
    </section>
  )
}
