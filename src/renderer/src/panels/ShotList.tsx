import { Eye, Video } from 'lucide-react'
import { compareShotNumbers } from '../../../shared/camera'
import type { CameraNode } from '../../../shared/project'
import { addCamera } from '../state/actions'
import { activeScene, useDocument } from '../state/documentStore'
import { useUi } from '../state/uiStore'

// Every camera setup in the scene, in shot order, with a live thumbnail of its frame.

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
  const thumbnail = useUi((s) => s.thumbnails[camera.id])
  const info = useUi((s) => s.shotInfo[camera.id])
  const size = camera.sizeOverride ?? info?.size?.label
  const angle = camera.angleOverride ?? info?.angle

  return (
    <div
      className={`shot-row${selected ? ' selected' : ''}${looking ? ' looking' : ''}`}
      onClick={() => useUi.getState().select([camera.id])}
      onDoubleClick={() => {
        useUi.getState().select([camera.id])
        useUi.getState().setLookThrough(camera.id)
      }}
      title="Click to select · double-click to look through"
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
      </div>
      <button
        className={`icon-button${looking ? ' on' : ''}`}
        title={looking ? 'Back to the free view' : 'Look through this camera'}
        onClick={(e) => {
          e.stopPropagation()
          useUi.getState().setLookThrough(looking ? null : camera.id)
        }}
      >
        <Eye size={14} />
      </button>
    </div>
  )
}

export default function ShotList() {
  const nodes = useDocument((s) => activeScene(s).nodes)
  const cameras = Object.values(nodes)
    .filter((n): n is CameraNode => n.type === 'camera')
    .sort((a, b) => compareShotNumbers(a.shotNumber, b.shotNumber))

  return (
    <section className="panel shot-list">
      <div className="panel-header">Shot list</div>
      <div className="panel-body">
        {cameras.length === 0 ? (
          <p className="hint">
            No shots yet. Frame something in the viewport, then click{' '}
            <button className="inline-link" onClick={addCamera}>
              Camera
            </button>{' '}
            to place a camera there.
          </p>
        ) : (
          cameras.map((c) => <ShotRow key={c.id} camera={c} />)
        )}
      </div>
    </section>
  )
}
